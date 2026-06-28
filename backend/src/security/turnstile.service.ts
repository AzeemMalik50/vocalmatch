// backend/src/security/turnstile.service.ts
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger('TurnstileService');
  private readonly secret: string;
  private readonly enabled: boolean;

  constructor() {
    this.secret = process.env.TURNSTILE_SECRET_KEY ?? '';
    this.enabled = this.secret.length > 0;
    if (!this.enabled) {
      this.logger.warn(
        'Turnstile disabled (TURNSTILE_SECRET_KEY not set); bot challenges will pass through',
      );
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Returns true when:
   *   - Turnstile is disabled (no secret), OR
   *   - Cloudflare confirms the token.
   * Returns false when Turnstile is enabled and the token is missing,
   * expired, or rejected.
   */
  async verify(token: string | undefined, remoteIp?: string): Promise<boolean> {
    if (!this.enabled) return true;
    if (!token) return false;

    try {
      const params = new URLSearchParams();
      params.set('secret', this.secret);
      params.set('response', token);
      if (remoteIp) params.set('remoteip', remoteIp);

      const res = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        { method: 'POST', body: params },
      );
      if (!res.ok) {
        this.logger.warn(`Turnstile siteverify HTTP ${res.status}`);
        return false;
      }
      const body = (await res.json()) as {
        success: boolean;
        'error-codes'?: string[];
      };
      if (!body.success) {
        this.logger.warn(
          `Turnstile rejected token; error-codes=${(body['error-codes'] ?? []).join(',')}`,
        );
      }
      return body.success === true;
    } catch (err: any) {
      this.logger.error(`Turnstile verify threw: ${err?.message ?? err}`);
      return false;
    }
  }
}
