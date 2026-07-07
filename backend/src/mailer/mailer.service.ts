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

    // Detailed boot log — makes it obvious in the Railway log stream
    // whether the container actually received the Gmail env vars. Was
    // previously a single generic "Mailer disabled" line, which meant
    // "env vars unset OR value has whitespace OR something else" all
    // looked identical. Now we log the length + last-4 chars so an
    // operator can verify their App Password made it in without
    // exposing the whole secret.
    const userMasked = user
      ? `${user.slice(0, 3)}…${user.slice(-8)} (len ${user.length})`
      : '(unset)';
    const passLen = pass?.length ?? 0;
    const passMasked = pass
      ? `••••••••••••${pass.slice(-4)} (len ${passLen})`
      : '(unset)';
    this.logger.log(
      `Boot config — GMAIL_USER=${userMasked}, GMAIL_APP_PASSWORD=${passMasked}, MAIL_FROM=${this.from}, FRONTEND_RESET_URL=${process.env.FRONTEND_RESET_URL ?? '(unset)'}`,
    );

    if (!user || !pass) {
      this.logger.warn(
        'Mailer disabled (GMAIL_USER or GMAIL_APP_PASSWORD not set); falling back to console — password-reset URLs will be logged only, not emailed',
      );
      this.transporter = null;
      return;
    }
    if (pass.includes(' ')) {
      this.logger.warn(
        'GMAIL_APP_PASSWORD contains spaces — Gmail displays App Passwords with spaces for readability, but they must be entered without spaces. Stripping spaces automatically; consider fixing the env var value.',
      );
    }
    const cleanPass = pass.replace(/\s+/g, '');
    if (cleanPass.length !== 16) {
      this.logger.warn(
        `GMAIL_APP_PASSWORD is ${cleanPass.length} chars — expected 16. Google App Passwords are always exactly 16 lowercase letters. This value is likely a regular password (won't work) or has extra characters.`,
      );
    }
    this.transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass: cleanPass },
    });

    // Verify SMTP handshake immediately at boot rather than waiting
    // for a user to hit forgot-password. If Gmail rejects the auth
    // (bad App Password, 2FA off, IP block), the error surfaces in
    // logs on deploy — not when a real user is stuck at 3am.
    (this.transporter as unknown as nodemailer.Transporter)
      .verify?.()
      .then(() => this.logger.log('SMTP handshake OK — Gmail is ready to send'))
      .catch((err) =>
        this.logger.error(
          `SMTP handshake FAILED at boot — sends will error: ${err?.message ?? err}`,
        ),
      );
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
      this.logger.log(`Sending password reset to ${toEmail}…`);
      const info = await this.transporter.sendMail({
        from: this.from,
        to: toEmail,
        subject,
        text,
      });
      // Log the messageId + accepted addresses so we can prove the
      // send left our server. If a user reports "didn't receive",
      // this line + Gmail's Sent folder tell us whether the problem
      // is on our side or the recipient's spam filter.
      const asAny = info as {
        messageId?: string;
        accepted?: string[];
        rejected?: string[];
        response?: string;
      };
      this.logger.log(
        `Password reset sent to ${toEmail} — messageId=${asAny.messageId ?? '?'} accepted=${JSON.stringify(asAny.accepted ?? [])} rejected=${JSON.stringify(asAny.rejected ?? [])}`,
      );
    } catch (err: any) {
      // Don't punish the user for our SMTP failure — log full detail
      // and move on. Include the error name / code so a Google-side
      // reason (BadCredentials, RateLimit, etc.) is obvious in logs.
      this.logger.error(
        `Failed to send password reset email to ${toEmail}: ${err?.name ?? 'Error'} ${err?.code ?? ''} ${err?.message ?? err}`,
      );
    }
  }
}
