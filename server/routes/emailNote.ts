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
import { extractTextFromFile, downloadFileBuffer } from '../services/drive';
import { buildPatientDemographicsForNoteInput } from '../../shared/patientChartContext';

const router = Router();
router.use(requireAuth);

const MAX_BODY_CHARS = 400_000;
const MAX_DRIVE_ATTACH_BYTES = 12 * 1024 * 1024;
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

function safeAttachmentFilename(original: string, mimeType: string): string {
  const base = safeDocxFileBase(original.replace(/\.[^.]+$/, '')) || 'document';
  const lower = original.toLowerCase();
  if (mimeType.includes('wordprocessingml') || lower.endsWith('.docx')) return `${base}.docx`;
  if (mimeType === 'application/pdf' || lower.endsWith('.pdf')) return `${base}.pdf`;
  const dot = original.lastIndexOf('.');
  if (dot > 0 && dot < original.length - 1) {
    const ext = original.slice(dot).replace(/[^\w.]/g, '').slice(0, 8);
    return ext ? `${base}${ext}` : `${base}.bin`;
  }
  return `${base}.bin`;
}

/**
 * POST /api/email-note/drive-file
 * Email a file from the workspace: patient chart block, Drive link, extracted text, optional binary attachment.
 */
router.post('/drive-file', async (req: Request, res: Response): Promise<void> => {
  const sessionEmail = req.session.userEmail?.trim();

  if (!sessionEmail || !EMAIL_RE.test(sessionEmail)) {
    res.status(400).json({ error: 'Your session has no valid email. Sign out and sign in again with Google.' });
    return;
  }

  if (!isSmtpConfigured()) {
    console.warn('[email-note] SMTP not configured (drive-file).');
    res.status(503).json({
      error:
        'Email is not configured. Add SMTP_HOST, SMTP_USER, and SMTP_PASS to your server .env (or Heroku Config Vars). Then restart the app.',
    });
    return;
  }

  const { fileId, fileName, mimeType, fileUrl, patient } = req.body as {
    fileId?: string;
    fileName?: string;
    mimeType?: string;
    fileUrl?: string;
    patient?: {
      name?: string;
      dob?: string;
      sex?: string;
      folderNumber?: string;
      contactNumber?: string;
    };
  };

  if (!fileId || typeof fileId !== 'string') {
    res.status(400).json({ error: 'fileId is required.' });
    return;
  }

  const token = req.session.accessToken!;
  const fname = typeof fileName === 'string' && fileName.trim() ? fileName.trim() : 'document';
  const fmime = typeof mimeType === 'string' && mimeType.trim() ? mimeType.trim() : 'application/octet-stream';

  let extracted = '';
  try {
    extracted = await extractTextFromFile(token, { id: fileId, name: fname, mimeType: fmime }, 120_000);
  } catch (e) {
    console.warn('[email-note/drive-file] extract failed:', e);
  }

  const p = patient || {};
  const sex = p.sex === 'F' || p.sex === 'M' ? p.sex : 'M';
  const chartBlock = buildPatientDemographicsForNoteInput({
    name: (p.name || '—').trim() || '—',
    dob: p.dob || '',
    sex,
    folderNumber: p.folderNumber,
    contactNumber: p.contactNumber,
  });

  const link = typeof fileUrl === 'string' && fileUrl.trim().startsWith('http') ? fileUrl.trim() : '';

  const mainBody = [
    chartBlock,
    '',
    '--- Workspace file ---',
    `File name: ${fname}`,
    link ? `Open in Google Drive: ${link}` : '',
    '',
    extracted.trim()
      ? '--- Extracted text (may be truncated) ---\n\n' + extracted.trim()
      : '--- Extracted text ---\n\n(No plain-text extraction for this file type; open the Drive link above for the full document.)',
  ]
    .filter(Boolean)
    .join('\n');

  const body = mainBody.length > MAX_BODY_CHARS ? mainBody.slice(0, MAX_BODY_CHARS) : mainBody;
  const subj = `Document: ${fname.slice(0, 120)} — ${(p.name || 'Patient').trim().slice(0, 60)}`;

  let attachment: { filename: string; content: Buffer; contentType: string } | undefined;
  try {
    const buf = await downloadFileBuffer(token, fileId);
    if (buf.length > 0 && buf.length <= MAX_DRIVE_ATTACH_BYTES) {
      attachment = {
        filename: safeAttachmentFilename(fname, fmime),
        content: buf,
        contentType: fmime || 'application/octet-stream',
      };
    }
  } catch (e) {
    console.warn('[email-note/drive-file] attachment skipped:', e);
  }

  const fromAddr = getClinicalNoteFromAddress();
  const headerLines = [
    'This message was sent from the patient workspace app.',
    `Patient: ${typeof p.name === 'string' && p.name.trim() ? p.name.trim() : '—'}`,
    `Sent to (your account): ${sessionEmail}`,
    `Date: ${new Date().toISOString()}`,
    '',
  ];

  try {
    const transporter = createMailTransporter();
    await transporter.sendMail({
      from: fromAddr,
      to: sessionEmail,
      replyTo: fromAddr,
      subject: subj.slice(0, 500),
      text: [...headerLines, body].join('\n'),
      attachments: attachment ? [attachment] : undefined,
    });

    res.json({
      ok: true,
      message: attachment
        ? 'Email sent with file attachment, patient details, and extracted text preview.'
        : 'Email sent with patient details and link (file could not be attached—use Drive link).',
    });
  } catch (err) {
    console.error('[email-note/drive-file] Send failed:', err);
    res.status(500).json({ error: getSmtpSendErrorMessage(err) });
  }
});

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

  const plainBodyDefault = [...headerLines, body].join('\n');
  const plainBody =
    docxBuffer && wantDocx && tid
      ? [...headerLines, 'A Word copy of this note is attached.', '', '--- Note (plain text) ---', '', body].join('\n')
      : plainBodyDefault;

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
      ? 'Email sent with Word attachment and note text.'
      : wantDocx && tid
        ? 'Email sent (plain text only; Word attachment could not be generated).'
        : 'Email sent to your inbox.';
    res.json({ ok: true, message: msg });
  } catch (err) {
    console.error('[email-note] Send failed:', err);
    res.status(500).json({ error: getSmtpSendErrorMessage(err) });
  }
});

export default router;
