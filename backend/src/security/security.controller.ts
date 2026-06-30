// backend/src/security/security.controller.ts
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { TurnstileService } from './turnstile.service';

@ApiTags('Security')
@SkipThrottle()
@Controller('security')
export class SecurityController {
  constructor(private readonly turnstile: TurnstileService) {}

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
}
