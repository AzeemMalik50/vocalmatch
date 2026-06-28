# Cloudflare Turnstile Bot Protection (Track B6)

**Status:** Design approved, awaiting implementation plan
**Scope:** Cloudflare Turnstile invisible-by-default bot challenge on `signup`, `forgot-password`, and `login`-after-failed-attempts. Server-side token verification + frontend widget. Gracefully degrades to "no challenge" when env vars are unset (dev/local).

This is **sub-project B6** of the launch hardening effort. Independent of other B tracks.

---

## Goals

1. Reduce fake-account farming on signup with an invisible challenge.
2. Limit abuse of the password-reset flow as an email-spam vector.
3. Add a captcha gate to login only after we've already seen suspicious behavior (3+ failed attempts), so the legitimate-user UX stays seamless.
4. Use Cloudflare Turnstile because it's free, privacy-respecting, and invisible most of the time.
5. Degrade gracefully — every developer can run the app locally without provisioning Turnstile keys.

## Non-goals

- Turnstile on voting (B1's 30/min/IP throttle is sufficient; captcha would tank conversion).
- Turnstile on uploads (uploads require an authenticated account — secondary surface).
- Adaptive captcha tuning beyond what Turnstile does internally (IP geo, ASN reputation, etc. are Cloudflare's problem).
- Turnstile audit logging via B4.
- Custom error UI beyond the library's defaults.
- Always-on captcha on every authenticated mutation.

---

## Architecture

### Env vars

Two new env vars added to `backend/.env.example`:

```env
# Cloudflare Turnstile bot protection. Both keys are issued at
# https://dash.cloudflare.com/?to=/:account/turnstile. Leave empty
# to disable Turnstile and allow all requests through.
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

The site key is also surfaced to the frontend via `/api/security/turnstile-config` (below). We do NOT use `NEXT_PUBLIC_*` because the frontend currently centralizes API access via the backend.

### `TurnstileService`

New module `backend/src/security/` containing:

- `turnstile.service.ts` — `TurnstileService.verify(token, remoteIp?)`
- `security.controller.ts` — `GET /api/security/turnstile-config` (public)
- `security.module.ts` — wires the above

```ts
@Injectable()
export class TurnstileService {
  private readonly logger = new Logger('TurnstileService');
  private readonly secret = process.env.TURNSTILE_SECRET_KEY ?? '';
  private readonly enabled = !!this.secret;

  /**
   * Returns true when:
   *   - Turnstile is disabled (no TURNSTILE_SECRET_KEY); OR
   *   - Cloudflare confirms the token.
   * Returns false when Turnstile is enabled and the token is missing,
   * expired, or rejected.
   */
  async verify(token: string | undefined, remoteIp?: string): Promise<boolean> {
    if (!this.enabled) {
      this.logger.debug('Turnstile disabled; passing through');
      return true;
    }
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
      const body = (await res.json()) as { success: boolean; 'error-codes'?: string[] };
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

  /** True when Turnstile is configured. */
  get isEnabled(): boolean {
    return this.enabled;
  }
}
```

Service is provider-exported; `AuthModule` imports `SecurityModule` to inject it.

### Public config endpoint

`GET /api/security/turnstile-config` (no auth, no throttle):

```ts
@Controller('security')
export class SecurityController {
  constructor(private readonly turnstile: TurnstileService) {}

  @Get('turnstile-config')
  config() {
    return {
      enabled: this.turnstile.isEnabled,
      siteKey: process.env.TURNSTILE_SITE_KEY || null,
    };
  }
}
```

The frontend fetches this once on mount and caches it. If `enabled === false`, the widget is skipped entirely and forms treat the gate as "passed."

### DTO additions

`SignupDto`, `ForgotPasswordDto`, and `LoginDto` each gain:

```ts
@IsOptional()
@IsString()
@MaxLength(2048)
turnstileToken?: string;
```

Optional in the DTO so dev-mode clients (which won't have a token) still validate. Required-or-not is enforced in the service layer per endpoint.

### Service gates

**`AuthService.signup`** — first thing in the method:

```ts
const ok = await this.turnstile.verify(dto.turnstileToken, /* remoteIp passed via controller */);
if (!ok) throw new BadRequestException('Bot challenge failed — refresh and try again');
```

When Turnstile is disabled, `verify` returns `true` so the existing flow is unchanged.

**`AuthService.forgotPassword`** — same pattern at the top of the method.

**`AuthService.login`** — adaptive. After the user lookup (and the lockout check, but before bcrypt), if the user exists and `user.failedLoginCount >= 3`:

```ts
const ok = await this.turnstile.verify(dto.turnstileToken, remoteIp);
if (!ok) {
  throw new UnauthorizedException(
    'Bot challenge required — refresh and try again',
  );
}
```

The specific error message is what the frontend matches against to know to render the widget. Same 401 status code, different message — preserves the "don't leak whether the password was right" behavior.

The check happens after the user is loaded (so we know their `failedLoginCount`) but before bcrypt — meaning a missing/failed Turnstile short-circuits before the expensive hash compare.

### `remoteIp` plumbing

The IP is passed through from the controller. Inject the request via `@Req() req: any` and pass `req.ip` to the service method:

```ts
@Post('signup')
signup(@Req() req: any, @Body() dto: SignupDto) {
  return this.auth.signup(dto, req.ip);
}
```

Service signatures change minimally — add `remoteIp?: string` as an optional last argument.

### Frontend

**`useTurnstileConfig()` hook** (`frontend/src/lib/turnstile.ts`) — fetches `/api/security/turnstile-config` once and caches in a module-level singleton. Returns `{ enabled: boolean | undefined, siteKey: string | null }`. Components render conditionally.

**`TurnstileWidget` component** (`frontend/src/components/TurnstileWidget.tsx`):

```tsx
'use client';
import { Turnstile } from '@marsidev/react-turnstile';
import { useEffect } from 'react';
import { useTurnstileConfig } from '@/lib/turnstile';

interface Props {
  onToken: (token: string) => void;
  onExpire?: () => void;
  /** Force a fresh render — pass a bumping integer to reset the widget. */
  resetKey?: number;
}

export default function TurnstileWidget({ onToken, onExpire, resetKey }: Props) {
  const { enabled, siteKey } = useTurnstileConfig();

  useEffect(() => {
    if (enabled === false) onToken(''); // gate is "open"
  }, [enabled, onToken]);

  if (enabled === undefined) return null; // still loading config
  if (!enabled || !siteKey) return null; // disabled

  return (
    <Turnstile
      key={resetKey}
      siteKey={siteKey}
      options={{ theme: 'dark', size: 'normal' }}
      onSuccess={onToken}
      onExpire={() => {
        onToken('');
        onExpire?.();
      }}
    />
  );
}
```

**Signup page** — add `<TurnstileWidget>` above the submit button. State: `const [turnstileToken, setTurnstileToken] = useState<string | null>(null)`. Treat `''` (Turnstile disabled) as a valid pass; `null` means "still waiting for solve." Disable submit when `turnstileToken === null`. Pass the token in the API body.

**Forgot-password page** — same pattern.

**Login page** — `requiresTurnstile` state (default false). On submit, if API returns an error matching `/Bot challenge required/`, set `requiresTurnstile = true`. Render `<TurnstileWidget>` conditionally on this flag. Re-render the widget after each failed attempt by bumping a `resetKey` integer.

**API client** — extend `api.signup`, `api.forgotPassword`, `api.login` body types with optional `turnstileToken?: string`.

---

## Error handling

| Scenario | Behavior |
| --- | --- |
| Turnstile env vars unset (dev) | `verify` returns true; widget hidden; no UX change |
| Signup missing token (Turnstile enabled) | 400 `Bot challenge failed — refresh and try again` |
| Forgot-password missing token (Turnstile enabled) | 400 same |
| Login with `failedLoginCount < 3` and no token | Existing behavior — captcha not yet required |
| Login with `failedLoginCount >= 3` and no token | 401 `Bot challenge required — refresh and try again` |
| Login with valid token + correct password | 200 — counters reset, captcha state cleared |
| Cloudflare siteverify HTTP error / network failure | Treated as `false`; logged at warn/error |
| Token expired between solve and submit | Same as missing — 400 or 401 |

## Testing

**Backend (Jest):**

- `turnstile.service.spec.ts` — 4 unit tests:
  1. Disabled (no secret) → returns true regardless of token.
  2. Enabled + missing token → returns false.
  3. Enabled + Cloudflare returns `success: true` (mocked `fetch`) → returns true.
  4. Enabled + Cloudflare returns `success: false` → returns false.

- Extend `auth.service.spec.ts` with 2 tests:
  1. `login` with `failedLoginCount === 3` + missing token + Turnstile enabled → throws `UnauthorizedException` matching `/Bot challenge required/`.
  2. Same setup + valid (mocked-true) token → proceeds past Turnstile gate (i.e. reaches the bcrypt step or beyond).

- `auth.service.spec.ts` Turnstile-disabled cases inherit existing tests — when `TurnstileService.verify` returns true unconditionally, no existing test breaks.

**Manual smoke (with Turnstile disabled):**

```bash
# Confirm endpoint reports disabled
curl -s http://localhost:4000/api/security/turnstile-config
# Expected: {"enabled":false,"siteKey":null}

# Signup works without a token
curl -X POST http://localhost:4000/api/auth/signup -H 'Content-Type: application/json' \
  -d '{"email":"...","username":"...","password":"strongpwd","acceptedTerms":true,"acceptedPrivacy":true}'
# Expected: 201
```

**Manual smoke (with Turnstile enabled using test keys):**

Cloudflare publishes [test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) that always pass or always fail without real challenges:

- Always-pass site key: `1x00000000000000000000AA`
- Always-pass secret: `1x0000000000000000000000000000000AA`
- Always-fail site key: `2x00000000000000000000AB`
- Always-fail secret: `2x0000000000000000000000000000000AA`

Set the always-pass pair in `.env` for a quick wiring check; set the always-fail pair to verify the deny path.

---

## Operator setup (one-time, before deploy)

1. Visit https://dash.cloudflare.com → Turnstile → Add site.
2. Hostnames: `vocalmatch.com`, `*.vocalmatch.com`, `localhost` (for local testing).
3. Widget mode: **Managed** (default) — invisible most of the time.
4. Copy site key + secret key into production env (`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`).
5. Cloudflare's free tier covers 1M challenges/month — generous for early launch.

## Open questions

None remaining. Implementation can begin after approval and plan writing.
