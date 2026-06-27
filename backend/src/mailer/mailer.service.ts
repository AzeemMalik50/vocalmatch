// backend/src/mailer/mailer.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface MailTransporter {
  sendMail(options: {
    from?: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<unknown>;
}

@Injectable()
export class MailerService {
  private readonly logger = new Logger('MailerService');
  private readonly transporter: MailTransporter | null;
  private readonly from: string;

  /**
   * Construct from process.env on boot. The transporter can also be
   * injected explicitly for tests via the optional argument.
   */
  constructor(@Optional() injected?: MailTransporter) {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    this.from =
      process.env.MAIL_FROM ?? (user ? `VOCALMATCH <${user}>` : 'VOCALMATCH');

    if (injected) {
      this.transporter = injected;
      return;
    }
    if (!user || !pass) {
      this.logger.warn(
        'Mailer disabled (GMAIL_USER or GMAIL_APP_PASSWORD not set); falling back to console',
      );
      this.transporter = null;
      return;
    }
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
    });
  }

  async sendPasswordResetEmail(toEmail: string, resetUrl: string): Promise<void> {
    const subject = 'Reset your VOCALMATCH password';
    const text = `Someone requested a password reset for this account.

If that was you, click here to set a new password (link expires in 1 hour):
${resetUrl}

If you didn't request this, ignore this email — your password won't change.

— VOCALMATCH
`;

    if (!this.transporter) {
      // Console fallback — preserves the existing developer pattern.
      console.log(`🔐 Reset link for ${toEmail}: ${resetUrl}`);
      return;
    }

    try {
      await this.transporter.sendMail({
        from: this.from,
        to: toEmail,
        subject,
        text,
      });
    } catch (err: any) {
      // Don't punish the user for our SMTP failure — log and move on.
      this.logger.error(
        `Failed to send password reset email to ${toEmail}: ${err?.message ?? err}`,
      );
    }
  }
}
