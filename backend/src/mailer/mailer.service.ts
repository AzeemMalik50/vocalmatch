// backend/src/mailer/mailer.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';

export interface MailTransporter {
  sendMail(options: {
    from?: string;
    to: string;
    subject: string;
    text: string;
  }): Promise<unknown>;
}

// Which delivery backend is active. `resend` uses HTTPS (port 443) and
// survives cloud firewalls that block SMTP; `smtp` uses Gmail SMTP;
// `console` is the dev fallback. Chosen at boot from env vars.
type MailerBackend = 'resend' | 'smtp' | 'console';

@Injectable()
export class MailerService {
  private readonly logger = new Logger('MailerService');
  private readonly transporter: MailTransporter | null;
  private readonly resend: Resend | null;
  private readonly backend: MailerBackend;
  private readonly from: string;
  // Runtime health surfaced via SecurityController → GET
  // /api/security/mailer-health. Lets an operator confirm on the LIVE
  // Railway container (not just local dev) whether Gmail SMTP actually
  // connected without having to chase log lines. Safe to expose
  // publicly — only reports coarse booleans and the sanitized error
  // reason, never the credentials themselves.
  public health: {
    backend: MailerBackend;
    configured: boolean;
    from: string;
    userConfigured: boolean;
    userMasked: string;
    passwordLength: number;
    resendConfigured: boolean;
    frontendResetUrlConfigured: boolean;
    frontendResetUrl: string | null;
    smtpHandshake: 'pending' | 'ok' | 'failed' | 'skipped';
    smtpHandshakeError: string | null;
    smtpHandshakeCheckedAt: string | null;
    lastSendResult: {
      to: string;
      status: 'ok' | 'error';
      messageId: string | null;
      error: string | null;
      at: string;
    } | null;
  } = {
    backend: 'console',
    configured: false,
    from: '',
    userConfigured: false,
    userMasked: '(unset)',
    passwordLength: 0,
    resendConfigured: false,
    frontendResetUrlConfigured: false,
    frontendResetUrl: null,
    smtpHandshake: 'pending',
    smtpHandshakeError: null,
    smtpHandshakeCheckedAt: null,
    lastSendResult: null,
  };

  /**
   * Construct from process.env on boot. The transporter can also be
   * injected explicitly for tests via the optional argument.
   */
  constructor(@Optional() injected?: MailTransporter) {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    const resendKey = process.env.RESEND_API_KEY;
    this.from =
      process.env.MAIL_FROM ?? (user ? `VOCALMATCH <${user}>` : 'VOCALMATCH');

    // Populate the runtime health snapshot up front so a diagnostic
    // endpoint can read it even before the async SMTP verify below
    // resolves.
    this.health.from = this.from;
    this.health.userConfigured = !!user;
    this.health.userMasked = user
      ? `${user.slice(0, 3)}…${user.slice(-8)}`
      : '(unset)';
    this.health.passwordLength = pass?.length ?? 0;
    this.health.resendConfigured = !!resendKey;
    this.health.frontendResetUrlConfigured = !!process.env.FRONTEND_RESET_URL;
    this.health.frontendResetUrl = process.env.FRONTEND_RESET_URL ?? null;

    this.resend = null;
    this.transporter = null;

    if (injected) {
      this.transporter = injected;
      this.backend = 'smtp';
      this.health.backend = 'smtp';
      this.health.configured = true;
      this.health.smtpHandshake = 'ok';
      this.health.smtpHandshakeCheckedAt = new Date().toISOString();
      return;
    }

    // Backend priority: Resend > Gmail SMTP > console. Resend goes over
    // HTTPS (port 443) and can't be blocked by cloud provider outbound
    // firewalls the way SMTP ports 25/465/587 can. If you're on
    // Railway / Fly / Vercel and hitting "Connection timeout" from
    // nodemailer, set RESEND_API_KEY and don't look back.
    if (resendKey) {
      this.resend = new Resend(resendKey);
      this.backend = 'resend';
      this.health.backend = 'resend';
      this.health.configured = true;
      this.health.smtpHandshake = 'skipped'; // not relevant for HTTPS
      this.health.smtpHandshakeCheckedAt = new Date().toISOString();
      this.logger.log(
        `Mailer using Resend HTTPS API (from=${this.from}, FRONTEND_RESET_URL=${process.env.FRONTEND_RESET_URL ?? '(unset)'})`,
      );
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
        'Mailer disabled (no RESEND_API_KEY, and GMAIL_USER or GMAIL_APP_PASSWORD not set); falling back to console — password-reset URLs will be logged only, not emailed',
      );
      this.backend = 'console';
      this.health.backend = 'console';
      this.health.configured = false;
      this.health.smtpHandshake = 'failed';
      this.health.smtpHandshakeError =
        'No email backend configured. Set RESEND_API_KEY (preferred on Railway) or GMAIL_USER + GMAIL_APP_PASSWORD.';
      this.health.smtpHandshakeCheckedAt = new Date().toISOString();
      return;
    }
    this.backend = 'smtp';
    this.health.backend = 'smtp';
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
    // Explicit host/port instead of `service: 'gmail'`. The shorthand
    // uses port 465 (SMTPS), which Railway (and many other cloud
    // hosts) block by default to prevent outbound spam. Port 587
    // (submission) with STARTTLS is the widely-supported alternative
    // — Gmail supports both and 587 typically survives cloud firewall
    // rules. Fall back to 465 if you explicitly set SMTP_PORT.
    const smtpPort = parseInt(process.env.SMTP_PORT ?? '587', 10);
    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: smtpPort,
      secure: smtpPort === 465, // true for 465 (SMTPS), false for 587 (STARTTLS)
      auth: { user, pass: cleanPass },
      // Give the SMTP connection a reasonable timeout so a firewall
      // block manifests as a fast timeout rather than blocking the
      // request thread for minutes.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
    this.health.configured = true;
    this.logger.log(
      `Gmail transport configured on smtp.gmail.com:${smtpPort} (secure=${smtpPort === 465})`,
    );

    // Verify SMTP handshake immediately at boot rather than waiting
    // for a user to hit forgot-password. If Gmail rejects the auth
    // (bad App Password, 2FA off, IP block), the error surfaces in
    // logs on deploy — not when a real user is stuck at 3am.
    (this.transporter as unknown as nodemailer.Transporter)
      .verify?.()
      .then(() => {
        this.logger.log('SMTP handshake OK — Gmail is ready to send');
        this.health.smtpHandshake = 'ok';
        this.health.smtpHandshakeCheckedAt = new Date().toISOString();
      })
      .catch((err) => {
        const msg = err?.message ?? String(err);
        this.logger.error(
          `SMTP handshake FAILED at boot — sends will error: ${msg}`,
        );
        this.health.smtpHandshake = 'failed';
        this.health.smtpHandshakeError = msg;
        this.health.smtpHandshakeCheckedAt = new Date().toISOString();
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

    const html = `<div style="font-family:system-ui,sans-serif;color:#111;max-width:520px;margin:0 auto;padding:24px">
  <h2 style="margin:0 0 12px 0">Reset your VOCALMATCH password</h2>
  <p style="line-height:1.5">Someone requested a password reset for this account.</p>
  <p style="line-height:1.5">If that was you, click the button below to set a new password. The link expires in 1 hour.</p>
  <p style="margin:24px 0"><a href="${resetUrl}" style="display:inline-block;background:#FF4B57;color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px;font-weight:600">Reset password</a></p>
  <p style="line-height:1.5;color:#666;font-size:14px">Or copy this link: <a href="${resetUrl}">${resetUrl}</a></p>
  <p style="line-height:1.5;color:#666;font-size:14px">If you didn't request this, ignore this email — your password won't change.</p>
  <p style="margin-top:32px;color:#999;font-size:12px">— VOCALMATCH</p>
</div>`;

    // Resend path — HTTPS API, works when SMTP is firewalled.
    if (this.backend === 'resend' && this.resend) {
      try {
        this.logger.log(`Sending password reset to ${toEmail} via Resend…`);
        const { data, error } = await this.resend.emails.send({
          from: this.from,
          to: toEmail,
          subject,
          text,
          html,
        });
        if (error) {
          this.logger.error(
            `Resend rejected send to ${toEmail}: ${error.name ?? 'Error'} ${error.message}`,
          );
          this.health.lastSendResult = {
            to: toEmail,
            status: 'error',
            messageId: null,
            error: `${error.name ?? 'Error'}: ${error.message}`,
            at: new Date().toISOString(),
          };
          return;
        }
        this.logger.log(
          `Password reset sent to ${toEmail} via Resend — id=${data?.id ?? '?'}`,
        );
        this.health.lastSendResult = {
          to: toEmail,
          status: 'ok',
          messageId: data?.id ?? null,
          error: null,
          at: new Date().toISOString(),
        };
      } catch (err: any) {
        this.logger.error(
          `Failed to send password reset email to ${toEmail} via Resend: ${err?.name ?? 'Error'} ${err?.message ?? err}`,
        );
        this.health.lastSendResult = {
          to: toEmail,
          status: 'error',
          messageId: null,
          error: `${err?.name ?? 'Error'}: ${err?.message ?? String(err)}`,
          at: new Date().toISOString(),
        };
      }
      return;
    }

    // SMTP path — Gmail (or injected transporter for tests).
    if (this.transporter) {
      try {
        this.logger.log(`Sending password reset to ${toEmail} via SMTP…`);
        const info = await this.transporter.sendMail({
          from: this.from,
          to: toEmail,
          subject,
          text,
        });
        const asAny = info as {
          messageId?: string;
          accepted?: string[];
          rejected?: string[];
        };
        this.logger.log(
          `Password reset sent to ${toEmail} — messageId=${asAny.messageId ?? '?'} accepted=${JSON.stringify(asAny.accepted ?? [])} rejected=${JSON.stringify(asAny.rejected ?? [])}`,
        );
        this.health.lastSendResult = {
          to: toEmail,
          status: 'ok',
          messageId: asAny.messageId ?? null,
          error: null,
          at: new Date().toISOString(),
        };
      } catch (err: any) {
        this.logger.error(
          `Failed to send password reset email to ${toEmail}: ${err?.name ?? 'Error'} ${err?.code ?? ''} ${err?.message ?? err}`,
        );
        this.health.lastSendResult = {
          to: toEmail,
          status: 'error',
          messageId: null,
          error: `${err?.name ?? 'Error'} ${err?.code ?? ''}: ${err?.message ?? String(err)}`.trim(),
          at: new Date().toISOString(),
        };
      }
      return;
    }

    // Console fallback — no email backend configured.
    console.log(`🔐 Reset link for ${toEmail}: ${resetUrl}`);
    this.health.lastSendResult = {
      to: toEmail,
      status: 'ok',
      messageId: null,
      error: null,
      at: new Date().toISOString(),
    };
  }
}
