// backend/src/security/turnstile.service.spec.ts
import { TurnstileService } from './turnstile.service';

describe('TurnstileService', () => {
  const originalFetch = global.fetch;
  const originalSecret = process.env.TURNSTILE_SECRET_KEY;

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
    else process.env.TURNSTILE_SECRET_KEY = originalSecret;
  });

  it('returns true when no secret is configured (disabled)', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    const svc = new TurnstileService();
    await expect(svc.verify('whatever')).resolves.toBe(true);
    expect(svc.isEnabled).toBe(false);
  });

  it('returns false when enabled but token is missing', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret-x';
    const svc = new TurnstileService();
    await expect(svc.verify(undefined)).resolves.toBe(false);
    await expect(svc.verify('')).resolves.toBe(false);
  });

  it('returns true when Cloudflare confirms the token', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret-x';
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ success: true }),
    })) as any;
    const svc = new TurnstileService();
    await expect(svc.verify('good-token')).resolves.toBe(true);
    expect((global.fetch as any)).toHaveBeenCalledWith(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('returns false when Cloudflare rejects the token', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret-x';
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ success: false, 'error-codes': ['invalid'] }),
    })) as any;
    const svc = new TurnstileService();
    await expect(svc.verify('bad-token')).resolves.toBe(false);
  });
});
