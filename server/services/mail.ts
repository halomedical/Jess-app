import nodemailer from 'nodemailer';
import { config } from '../config';

export function isSmtpConfigured(): boolean {
  return Boolean(config.smtpHost && config.smtpUser && config.smtpPass);
}

export function createMailTransporter(): nodemailer.Transporter {
  if (!isSmtpConfigured()) {
    throw new Error('SMTP is not configured');
  }
  const port = config.smtpPort;
  const secure = config.smtpSecure;
  // Outlook / Microsoft: port 587 uses STARTTLS (secure=false + requireTLS).
  const requireTLS = !secure && port === 587;
  return nodemailer.createTransport({
    host: config.smtpHost,
    port,
    secure,
    requireTLS,
    tls: { minVersion: 'TLSv1.2' as const },
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });
}

/** Map nodemailer / SMTP errors to a safe, actionable message for the client. */
export function getSmtpSendErrorMessage(err: unknown): string {
  const e = err as { code?: string; responseCode?: number; response?: string; message?: string };
  if (e.code === 'EAUTH' || e.responseCode === 535) {
    return (
      'SMTP login failed (535): wrong password or wrong SMTP_HOST. ' +
      'Gmail / Google Workspace: SMTP_HOST=smtp.gmail.com, port 587, SMTP_SECURE=false; use a Google App Password if 2-Step Verification is on (not your normal password). ' +
      'Microsoft 365: smtp.office365.com. Personal Outlook/Hotmail: smtp-mail.outlook.com. ' +
      'SMTP_USER must be the full email address; keep ADMIN_EMAIL the same as SMTP_USER unless your provider allows otherwise.'
    );
  }
  if (e.responseCode === 550 || /not authorized/i.test(String(e.response))) {
    return (
      'The server accepted login but refused the message (often “not allowed to send as” From). ' +
      'Set ADMIN_EMAIL and SMTP_USER to the same address, or grant Send As permission for that mailbox.'
    );
  }
  return 'Failed to send email. Check server logs for the SMTP error detail.';
}

/** Default From for general SMTP sends (e.g. template requests). */
export function getSmtpFromAddress(): string {
  return config.smtpFrom || config.smtpUser;
}

/** From address for clinical note emails (practice / admin mailbox). */
export function getClinicalNoteFromAddress(): string {
  return config.adminEmail;
}
