import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../env.js";

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!env.smtpHost) {
    throw new Error("SMTP is not configured (SMTP_HOST is empty) - set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASSWORD/SMTP_FROM to enable email sending.");
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPassword } : undefined,
    });
  }
  return transporter;
}

export interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}

/** Sends an email via the configured SMTP relay (see env.ts). Currently used only by the Faktura module (`ModuleSdk.sendEmail`, see moduleRegistry/sdk.ts) to send documents - a general capability, not Faktura-specific, so future modules can reuse it. */
export async function sendMail(input: SendMailInput): Promise<void> {
  const from = env.smtpFrom || env.smtpUser;
  await getTransporter().sendMail({ from, to: input.to, subject: input.subject, text: input.text, attachments: input.attachments });
}
