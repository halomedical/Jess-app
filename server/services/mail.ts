import nodemailer from 'nodemailer';
import { config } from '../config';

export function isSmtpConfigured(): boolean {
  return Boolean(config.smtpHost && config.smtpUser && config.smtpPass);
}

export function createMailTransporter(): nodemailer.Transporter {
  if (!isSmtpConfigured()) {
    throw new Error('SMTP is not configured');
  }
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });
}

/** Envelope From / Sender header (some providers require a verified address). */
export function getSmtpFromAddress(): string {
  return config.smtpFrom || config.smtpUser;
}
