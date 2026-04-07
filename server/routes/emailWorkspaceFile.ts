import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import {
  createMailTransporter,
  getClinicalNoteFromAddress,
  getSmtpSendErrorMessage,
  isSmtpConfigured,
} from '../services/mail';
import { extractTextFromFile, downloadFileBuffer } from '../services/drive';
import { formatAgeFromIsoDob } from '../../shared/patientDemographics';

const router = Router();
router.use(requireAuth);

const MAX_BODY_CHARS = 400_000;
const MAX_DRIVE_ATTACH_BYTES = 12 * 1024 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeDocxFileBase(name: string): string {
  return name
    .replace(/\//g, '-')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200) || 'document';
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

/** Short filing context only — not the same block as clinical note / generate_note. */
function compactPatientForFileEmail(p: {
  name?: string;
  dob?: string;
  sex?: string;
  folderNumber?: string;
  contactNumber?: string;
  referringDoctor?: string;
  visitType?: 'new' | 'follow_up';
  visitDate?: string;
}): string {
  const age = formatAgeFromIsoDob(p.dob || '');
  const vt =
    p.visitType === 'new' ? 'New patient' : p.visitType === 'follow_up' ? 'Follow-up' : '';
  const lines = [
    '--- Patient (filing reference) ---',
    `Name: ${(p.name || '—').trim() || '—'}`,
    `DOB: ${p.dob || '—'}  |  Age: ${age}  |  Sex: ${p.sex || '—'}`,
  ];
  if (p.folderNumber?.trim()) lines.push(`Folder / file no.: ${p.folderNumber.trim()}`);
  if (p.contactNumber?.trim()) lines.push(`Cellphone / contact: ${p.contactNumber.trim()}`);
  if (p.referringDoctor?.trim()) lines.push(`Referring doctor: ${p.referringDoctor.trim()}`);
  if (vt) lines.push(`Visit type: ${vt}`);
  if (p.visitDate?.trim()) lines.push(`Visit date: ${p.visitDate.trim()}`);
  lines.push(
    '---',
    'This email is for the workspace file named below (attached or linked).',
    'It is not the Editor & Scribe clinical note email.',
    '---',
  );
  return lines.join('\n');
}

/**
 * POST /api/email-workspace-file
 * Emails a Drive file from Active Workspace: attachment when possible, short body (no full text dump when attached).
 * Separate from POST /api/email-note (clinical note from the editor).
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const sessionEmail = req.session.userEmail?.trim();

  if (!sessionEmail || !EMAIL_RE.test(sessionEmail)) {
    res.status(400).json({ error: 'Your session has no valid email. Sign out and sign in again with Google.' });
    return;
  }

  if (!isSmtpConfigured()) {
    res.status(503).json({
      error:
        'Email is not configured. Add SMTP_HOST, SMTP_USER, and SMTP_PASS (or Heroku Config Vars), then restart the app.',
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
      referringDoctor?: string;
      visitType?: 'new' | 'follow_up';
      visitDate?: string;
    };
  };

  if (!fileId || typeof fileId !== 'string') {
    res.status(400).json({ error: 'fileId is required.' });
    return;
  }

  const token = req.session.accessToken!;
  const fname = typeof fileName === 'string' && fileName.trim() ? fileName.trim() : 'document';
  const fmime = typeof mimeType === 'string' && mimeType.trim() ? mimeType.trim() : 'application/octet-stream';

  const p = patient || {};
  const filingBlock = compactPatientForFileEmail(p);
  const link = typeof fileUrl === 'string' && fileUrl.trim().startsWith('http') ? fileUrl.trim() : '';

  const subj = `[Workspace file] ${fname.slice(0, 100)} — ${(p.name || 'Patient').trim().slice(0, 50)}`;

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
    console.warn('[email-workspace-file] attachment skipped:', e);
  }

  let extracted = '';
  if (!attachment) {
    try {
      extracted = await extractTextFromFile(token, { id: fileId, name: fname, mimeType: fmime }, 120_000);
    } catch (e) {
      console.warn('[email-workspace-file] extract failed:', e);
    }
  }

  const fromAddr = getClinicalNoteFromAddress();
  const headerLines = [
    'Patient workspace — file from Active Workspace (not the clinical note editor).',
    `Patient: ${typeof p.name === 'string' && p.name.trim() ? p.name.trim() : '—'}`,
    `Sent to: ${sessionEmail}`,
    `Date: ${new Date().toISOString()}`,
    '',
  ];

  const fileMeta = [
    filingBlock,
    '',
    '=== Workspace file ===',
    `File name: ${fname}`,
    link ? `Open in Google Drive: ${link}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  /** With an attachment, avoid pasting the full extracted document into the email body. */
  const bodyText = attachment
    ? [fileMeta, '', 'The file is attached to this message.', '', '(Open the attachment to view the full content.)'].join('\n')
    : (() => {
        const excerpt = extracted.trim().slice(0, 4000);
        const tail =
          extracted.trim().length > 4000
            ? `${excerpt}\n\n… (truncated; attachment was not possible — use the Drive link for the full file.)`
            : excerpt ||
              '(No plain-text preview. Use the Drive link above to open the file; attachment was not available.)';
        return [fileMeta, '', '--- Preview (attachment not sent) ---', '', tail].join('\n');
      })();

  const body = bodyText.length > MAX_BODY_CHARS ? bodyText.slice(0, MAX_BODY_CHARS) : bodyText;

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
        ? 'Workspace file emailed with attachment (short message body).'
        : 'Workspace file emailed (link and short preview; file could not be attached).',
    });
  } catch (err) {
    console.error('[email-workspace-file] Send failed:', err);
    res.status(500).json({ error: getSmtpSendErrorMessage(err) });
  }
});

export default router;
