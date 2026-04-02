import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { createMailTransporter, getSmtpFromAddress, isSmtpConfigured } from '../services/mail';

const router = Router();
router.use(requireAuth);

const MAX_BODY_CHARS = 400_000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/email-note
 * Body: { to: string, subject?: string, text: string, patientName?: string }
 * Sends the clinical note as plain text from the configured SMTP account.
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const userEmail = req.session.userEmail;
  const { to, subject, text, patientName } = req.body as {
    to?: string;
    subject?: string;
    text?: string;
    patientName?: string;
  };

  const recipient = typeof to === 'string' ? to.trim() : '';
  if (!recipient || !EMAIL_RE.test(recipient)) {
    res.status(400).json({ error: 'A valid recipient email address is required.' });
    return;
  }

  if (typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'Note text is required.' });
    return;
  }

  const body = text.length > MAX_BODY_CHARS ? text.slice(0, MAX_BODY_CHARS) : text;

  if (!isSmtpConfigured()) {
    console.warn('[email-note] SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS.');
    res.status(503).json({
      error: 'Email is not configured on the server. Add SMTP settings or contact your administrator.',
    });
    return;
  }

  const subj =
    typeof subject === 'string' && subject.trim()
      ? subject.trim().slice(0, 500)
      : 'Clinical note';

  const headerLines = [
    'This message was sent from the Halo Patient Concierge app.',
    `Sent by: ${userEmail || '(unknown)'}`,
    patientName && typeof patientName === 'string' ? `Patient: ${patientName}` : '',
    `Date: ${new Date().toISOString()}`,
    '',
    '--- Note ---',
    '',
  ].filter(Boolean);

  const plain = [...headerLines, body].join('\n');

  try {
    const transporter = createMailTransporter();
    await transporter.sendMail({
      from: getSmtpFromAddress(),
      to: recipient,
      replyTo: userEmail || undefined,
      subject: subj,
      text: plain,
    });

    res.json({ ok: true, message: 'Email sent.' });
  } catch (err) {
    console.error('[email-note] Send failed:', err);
    res.status(500).json({
      error: 'Failed to send email. Check SMTP configuration or try again.',
    });
  }
});

export default router;
