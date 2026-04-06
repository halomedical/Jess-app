import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { config } from '../config';
import {
  createMailTransporter,
  getClinicalNoteFromAddress,
  getSmtpSendErrorMessage,
  isSmtpConfigured,
} from '../services/mail';
import { generateNote } from '../services/haloApi';

const router = Router();
router.use(requireAuth);

const MAX_BODY_CHARS = 400_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function safeDocxFileBase(name: string): string {
  return name
    .replace(/\//g, '-')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200) || 'Clinical_Note';
}

/**
 * POST /api/email-note
 * Sends the note to the signed-in user's email (session).
 * From: admin@halo.africa (config.ADMIN_EMAIL). Requires Outlook/SMTP configured for that mailbox.
 *
 * Body: { subject?: string, text: string, patientName?: string, template_id?: string,
 *         attachDocx?: boolean, docxFileName?: string }
 * If attachDocx is true (default), builds a DOCX via the same Halo/Python path as Save as DOCX and attaches it.
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const sessionEmail = req.session.userEmail?.trim();

  if (!sessionEmail || !EMAIL_RE.test(sessionEmail)) {
    res.status(400).json({ error: 'Your session has no valid email. Sign out and sign in again with Google.' });
    return;
  }

  const { subject, text, patientName, template_id, attachDocx, docxFileName } = req.body as {
    subject?: string;
    text?: string;
    patientName?: string;
    template_id?: string;
    attachDocx?: boolean;
    docxFileName?: string;
  };

  if (typeof text !== 'string' || !text.trim()) {
    res.status(400).json({ error: 'Note text is required.' });
    return;
  }

  const body = text.length > MAX_BODY_CHARS ? text.slice(0, MAX_BODY_CHARS) : text;

  if (!isSmtpConfigured()) {
    console.warn('[email-note] SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS (restart server after .env changes).');
    res.status(503).json({
      error:
        'Email is not configured. Add SMTP_HOST, SMTP_USER, and SMTP_PASS to your server .env (or Heroku Config Vars). ' +
        'Personal Outlook/Hotmail: SMTP_HOST=smtp-mail.outlook.com. Work Microsoft 365: smtp.office365.com. Port 587, SMTP_SECURE=false. Then restart the app.',
    });
    return;
  }

  const subj =
    typeof subject === 'string' && subject.trim()
      ? subject.trim().slice(0, 500)
      : 'Clinical note';

  const fromAddr = getClinicalNoteFromAddress();

  const headerLines = [
    'This message was sent from the patient workspace app.',
    `Patient: ${typeof patientName === 'string' && patientName.trim() ? patientName.trim() : '—'}`,
    `Sent to (your account): ${sessionEmail}`,
    `Date: ${new Date().toISOString()}`,
    '',
    '--- Note ---',
    '',
  ];

  /** When a .docx is attached, keep only a short preamble so the message is not duplicated in the body. */
  const shortHeaderLines = [
    'This message was sent from the patient workspace app.',
    `Patient: ${typeof patientName === 'string' && patientName.trim() ? patientName.trim() : '—'}`,
    `Sent to (your account): ${sessionEmail}`,
    `Date: ${new Date().toISOString()}`,
    '',
  ];

  const wantDocx = attachDocx !== false;
  const tid = typeof template_id === 'string' && template_id.trim() ? template_id.trim() : '';

  let docxBuffer: Buffer | undefined;
  let attachLabel = '';
  if (wantDocx && tid) {
    try {
      const buf = await generateNote({
        user_id: config.haloUserId,
        template_id: tid,
        text: body,
        return_type: 'docx',
      });
      if (Buffer.isBuffer(buf) && buf.length > 0) {
        docxBuffer = buf;
        const base = safeDocxFileBase(typeof docxFileName === 'string' ? docxFileName : subj);
        attachLabel = base.endsWith('.docx') ? base : `${base}.docx`;
      }
    } catch (e) {
      console.warn('[email-note] DOCX generation failed; sending text only:', e);
    }
  }

  const plainBodyFullText = [...headerLines, body].join('\n');
  const plainBody =
    docxBuffer && attachLabel
      ? [
          ...shortHeaderLines,
          'The clinical document is attached as a Microsoft Word file (.docx).',
          '',
          'Open the attachment to read the full content (plain text is not duplicated here).',
        ].join('\n')
      : plainBodyFullText;

  try {
    const transporter = createMailTransporter();
    await transporter.sendMail({
      from: fromAddr,
      to: sessionEmail,
      replyTo: fromAddr,
      subject: subj,
      text: plainBody,
      attachments:
        docxBuffer && attachLabel
          ? [{ filename: attachLabel, content: docxBuffer, contentType: DOCX_MIME }]
          : undefined,
    });

    const msg = docxBuffer
      ? 'Email sent with Word attachment.'
      : wantDocx && tid
        ? 'Email sent (plain text in message; Word attachment could not be generated).'
        : 'Email sent to your inbox.';
    res.json({ ok: true, message: msg });
  } catch (err) {
    console.error('[email-note] Send failed:', err);
    res.status(500).json({ error: getSmtpSendErrorMessage(err) });
  }
});

export default router;
