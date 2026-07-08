// backend/src/security/security.controller.ts
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { MailerService } from '../mailer/mailer.service';
import { TurnstileService } from './turnstile.service';

@ApiTags('Security')
@SkipThrottle()
@Controller('security')
export class SecurityController {
  constructor(
    private readonly turnstile: TurnstileService,
    private readonly mailer: MailerService,
  ) {}

  @Get('turnstile-config')
  @ApiOperation({
    summary: 'Public Turnstile site key + enabled flag',
    description:
      'Frontend uses this on mount to decide whether to render the ' +
      'Turnstile widget. siteKey is null when Turnstile is disabled.',
  })
  config() {
    return {
      enabled: this.turnstile.isEnabled,
      siteKey: process.env.TURNSTILE_SITE_KEY || null,
    };
  }

  @Get('mailer-health')
  @ApiOperation({
    summary: 'Runtime state of the outbound mailer',
    description:
      'Diagnostic endpoint — reports whether Gmail SMTP is configured on ' +
      'this environment, whether the SMTP handshake succeeded at boot, and ' +
      'the sanitized state of the GMAIL_USER / GMAIL_APP_PASSWORD / ' +
      'FRONTEND_RESET_URL env vars. Never returns credentials themselves; ' +
      'safe to expose publicly. Useful for confirming a live deploy has ' +
      'actually picked up env-var changes without waiting to trigger a ' +
      'real password reset.',
  })
  mailerHealth() {
    return this.mailer.health;
  }
}
