# Cloudflare Turnstile Bot Protection (B6) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Cloudflare Turnstile bot challenge to signup + forgot-password (always-on) and login (adaptive — only after `failedLoginCount >= 3`), with server-side token verification, public config endpoint, and graceful no-op fallback when env vars are unset.

**Architecture:** New `SecurityModule` exposing `TurnstileService.verify(token, ip?)` (returns true when secret unset, otherwise calls Cloudflare siteverify). Public `GET /api/security/turnstile-config` tells the frontend whether the gate is live. `AuthService.signup`, `forgotPassword`, and `login` call `verify` at the right points. Frontend `TurnstileWidget` renders only when enabled; signup/forgot mount it inline, login mounts it adaptively on a "challenge required" 401.

**Tech Stack:** NestJS 10, Jest, Next.js 14, `@marsidev/react-turnstile@^0.4`.

**Spec:** [docs/superpowers/specs/2026-06-28-turnstile-bot-protection-design.md](../specs/2026-06-28-turnstile-bot-protection-design.md)

---

## File Structure

### Backend (new)
- `backend/src/security/turnstile.service.ts` — `verify(token, ip?)` + `isEnabled`
- `backend/src/security/turnstile.service.spec.ts` — 4 unit tests
- `backend/src/security/security.controller.ts` — `GET /api/security/turnstile-config`
- `backend/src/security/security.module.ts` — module wiring

### Backend (modified)
- `backend/.env.example` — `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY`
- `backend/src/app.module.ts` — import `SecurityModule`
- `backend/src/auth/auth.module.ts` — import `SecurityModule`
- `backend/src/auth/auth.dto.ts` — `turnstileToken?` on Signup/Login/ForgotPassword DTOs
- `backend/src/auth/auth.service.ts` — gate signup, forgotPassword, login (adaptive)
- `backend/src/auth/auth.controller.ts` — pass `req.ip` to service methods
- `backend/src/auth/auth.service.spec.ts` — 2 new login-Turnstile tests + add `TurnstileService` mock to existing modules

### Frontend (new)
- `frontend/src/lib/turnstile.ts` — `useTurnstileConfig()` hook + module-level cache
- `frontend/src/components/TurnstileWidget.tsx`

### Frontend (modified)
- `frontend/package.json` — `@marsidev/react-turnstile@^0.4`
- `frontend/src/lib/api.ts` — `getTurnstileConfig`, body types gain `turnstileToken?`
- `frontend/src/app/signup/page.tsx` — render widget + token state + gated submit
- `frontend/src/app/forgot-password/page.tsx` — same pattern
- `frontend/src/app/login/page.tsx` — adaptive widget on "Bot challenge required" 401

---

## Phase 1 — Backend `TurnstileService` (TDD)

### Task 1.1: Failing tests

**Files:**
- Create: `backend/src/security/turnstile.service.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
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
```

- [ ] **Step 2: Run — confirm red**

```bash
cd backend && npx jest src/security/turnstile.service.spec.ts 2>&1 | tail -10
```

Expected: failure — `Cannot find module './turnstile.service'`.

### Task 1.2: Implement `TurnstileService`

**Files:**
- Create: `backend/src/security/turnstile.service.ts`

- [ ] **Step 1: Write the service**

```ts
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
```

- [ ] **Step 2: Run — confirm green**

```bash
cd backend && npx jest src/security/turnstile.service.spec.ts 2>&1 | tail -10
```

Expected: `Tests: 4 passed, 4 total`.

### Task 1.3: SecurityController + SecurityModule

**Files:**
- Create: `backend/src/security/security.controller.ts`
- Create: `backend/src/security/security.module.ts`

- [ ] **Step 1: Write `security.controller.ts`**

```ts
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
```

- [ ] **Step 2: Write `security.module.ts`**

```ts
// backend/src/security/security.module.ts
import { Module } from '@nestjs/common';
import { SecurityController } from './security.controller';
import { TurnstileService } from './turnstile.service';

@Module({
  controllers: [SecurityController],
  providers: [TurnstileService],
  exports: [TurnstileService],
})
export class SecurityModule {}
```

- [ ] **Step 3: Import `SecurityModule` in `AppModule`**

In `backend/src/app.module.ts`, add the import and add `SecurityModule` to the `@Module.imports` array:

```ts
import { SecurityModule } from './security/security.module';
```

Add to imports, after `StatsModule` (or wherever the existing domain modules end).

- [ ] **Step 4: Verify boot + endpoint**

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9
curl -s http://localhost:4000/api/security/turnstile-config ; echo
pkill -f 'nest start' || true
```

Expected: `{"enabled":false,"siteKey":null}` (Turnstile not configured in dev).

---

## Phase 2 — Wire DTOs + service gates

### Task 2.1: Add `turnstileToken` to DTOs

**Files:**
- Modify: `backend/src/auth/auth.dto.ts`

- [ ] **Step 1: Add the field**

Append this snippet inside `SignupDto`, `LoginDto`, and `ForgotPasswordDto` (3 separate places):

```ts
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  turnstileToken?: string;
```

Add to the existing `class-validator` import if not present: `IsOptional`, `MaxLength`.

### Task 2.2: Inject `TurnstileService` into `AuthService`

**Files:**
- Modify: `backend/src/auth/auth.module.ts`
- Modify: `backend/src/auth/auth.service.ts`

- [ ] **Step 1: Import `SecurityModule` in `AuthModule`**

```ts
import { SecurityModule } from '../security/security.module';
```

Add `SecurityModule` to the `imports` array.

- [ ] **Step 2: Inject in `AuthService`**

Add to imports:

```ts
import { TurnstileService } from '../security/turnstile.service';
```

Update the constructor:

```ts
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly legal: LegalService,
    private readonly mailer: MailerService,
    private readonly turnstile: TurnstileService,
  ) {}
```

### Task 2.3: Gate `signup`, `forgotPassword`, and adaptive `login`

**Files:**
- Modify: `backend/src/auth/auth.service.ts`

- [ ] **Step 1: Update `signup` signature + first line**

Change the signature to accept `remoteIp`:

```ts
  async signup(dto: SignupDto, remoteIp?: string) {
```

Add the Turnstile check as the FIRST thing in the method body:

```ts
    const turnstilePass = await this.turnstile.verify(
      dto.turnstileToken,
      remoteIp,
    );
    if (!turnstilePass) {
      throw new BadRequestException('Bot challenge failed — refresh and try again');
    }
```

- [ ] **Step 2: Same treatment for `forgotPassword`**

```ts
  async forgotPassword(dto: ForgotPasswordDto, remoteIp?: string) {
    const turnstilePass = await this.turnstile.verify(
      dto.turnstileToken,
      remoteIp,
    );
    if (!turnstilePass) {
      throw new BadRequestException('Bot challenge failed — refresh and try again');
    }
    // ...existing flow
  }
```

- [ ] **Step 3: Adaptive Turnstile in `login`**

Update the signature:

```ts
  async login(dto: LoginDto, remoteIp?: string) {
```

After the existing user lookup + lockout check and BEFORE `bcrypt.compare`, insert:

```ts
    // Adaptive Turnstile: only required after 3 consecutive failed
    // attempts. Cheap user-experience win — legit users don't see the
    // widget unless something is already off.
    if ((user.failedLoginCount ?? 0) >= 3) {
      const turnstilePass = await this.turnstile.verify(
        dto.turnstileToken,
        remoteIp,
      );
      if (!turnstilePass) {
        throw new UnauthorizedException(
          'Bot challenge required — refresh and try again',
        );
      }
    }
```

- [ ] **Step 4: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean. If a test compile fails because the `auth.service.spec.ts` mocks don't pass `TurnstileService`, that's fine — Phase 3 handles it.

### Task 2.4: Pass `req.ip` from controller

**Files:**
- Modify: `backend/src/auth/auth.controller.ts`

- [ ] **Step 1: Update the three handlers**

In `auth.controller.ts`, find the three methods and pass `req.ip` as the second argument.

Find `signup`:
```ts
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
  }
```
Change to:
```ts
  signup(@Req() req: any, @Body() dto: SignupDto) {
    return this.auth.signup(dto, req.ip);
  }
```

Find `login`:
```ts
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }
```
Change to:
```ts
  login(@Req() req: any, @Body() dto: LoginDto) {
    return this.auth.login(dto, req.ip);
  }
```

Find `forgotPassword`:
```ts
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }
```
Change to:
```ts
  forgotPassword(@Req() req: any, @Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto, req.ip);
  }
```

`@Req` is already imported on this file.

---

## Phase 3 — Extend `auth.service.spec.ts` for Turnstile

### Task 3.1: Add Turnstile mock to existing describes + new tests

**Files:**
- Modify: `backend/src/auth/auth.service.spec.ts`

- [ ] **Step 1: Add the import**

At the top:

```ts
import { TurnstileService } from '../security/turnstile.service';
```

- [ ] **Step 2: Add a Turnstile mock to all three existing describe blocks**

Each of `'AuthService.signup acceptance plumbing'`, `'AuthService.login lockout'`, and `'AuthService password reset'` uses `Test.createTestingModule({ providers: [...] })`. Add this provider to EACH:

```ts
        { provide: TurnstileService, useValue: { verify: jest.fn(async () => true), isEnabled: false } },
```

This makes Turnstile always pass for all existing tests — no behavioral change.

- [ ] **Step 3: Append new login-Turnstile tests**

At the end of the file (outside the existing describes), add:

```ts
describe('AuthService.login Turnstile gate', () => {
  let service: AuthService;
  const usersState: any[] = [];
  const turnstile: any = { verify: jest.fn(), isEnabled: true };

  const userRepo: any = {
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => usersState[0] ?? null),
    })),
    save: jest.fn(async (row: any) => {
      const i = usersState.findIndex((u) => u.id === row.id);
      if (i >= 0) usersState[i] = { ...usersState[i], ...row };
      else usersState.push(row);
      return row;
    }),
    create: jest.fn((row: any) => row),
    findOne: jest.fn(async ({ where }: any) =>
      usersState.find((u) => u.id === where.id) ?? null,
    ),
  };
  const jwt: any = { sign: jest.fn(() => 'fake.jwt') };
  const legal: any = {
    getCurrentVersionIds: jest.fn(async () => ({
      terms: 'v-t',
      privacy: 'v-p',
    })),
  };
  const mailer: any = { sendPasswordResetEmail: jest.fn(async () => undefined) };

  beforeEach(async () => {
    usersState.length = 0;
    jest.clearAllMocks();
    turnstile.verify.mockReset();
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('correctpwd', 10);
    usersState.push({
      id: 'u-1',
      email: 'a@b.com',
      username: 'tester',
      passwordHash: hash,
      failedLoginCount: 3,
      lockoutUntil: null,
      tokenVersion: 0,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: JwtService, useValue: jwt },
        { provide: LegalService, useValue: legal },
        { provide: MailerService, useValue: mailer },
        { provide: TurnstileService, useValue: turnstile },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('requires Turnstile after 3 failed attempts; rejects when verify returns false', async () => {
    turnstile.verify.mockResolvedValue(false);
    await expect(
      service.login({ email: 'a@b.com', password: 'correctpwd' } as any),
    ).rejects.toThrow(/Bot challenge required/);
    expect(turnstile.verify).toHaveBeenCalled();
  });

  it('proceeds past the Turnstile gate when verify returns true', async () => {
    turnstile.verify.mockResolvedValue(true);
    const out = await service.login(
      { email: 'a@b.com', password: 'correctpwd', turnstileToken: 't' } as any,
    );
    expect(out.token).toBe('fake.jwt');
    expect(turnstile.verify).toHaveBeenCalledWith('t', undefined);
  });
});
```

- [ ] **Step 3: Run all auth tests — confirm green**

```bash
cd backend && npx jest src/auth/auth.service.spec.ts 2>&1 | tail -15
```

Expected: full file passes — 14 tests (12 existing + 2 new).

- [ ] **Step 4: Run the full backend suite**

```bash
cd backend && npx jest 2>&1 | tail -10
```

Expected: ≥ 99 tests passing (93 baseline from B4 + 4 turnstile.service + 2 new auth = 99).

---

## Phase 4 — `.env.example` + smoke test

### Task 4.1: Update `.env.example`

**Files:**
- Modify: `backend/.env.example`

- [ ] **Step 1: Append Turnstile section**

Append at the bottom (after the `FRONTEND_RESET_URL` block from B2):

```env

# Cloudflare Turnstile bot protection. Both keys are issued at
# https://dash.cloudflare.com/?to=/:account/turnstile. Leave empty
# to disable Turnstile and allow all requests through.
TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=
```

### Task 4.2: Live smoke (Turnstile disabled, then with always-pass test keys)

- [ ] **Step 1: Smoke with Turnstile disabled**

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# Config endpoint reports disabled
echo "=== Config (disabled) ==="
curl -s http://localhost:4000/api/security/turnstile-config

# Signup without token still works
echo -n "Signup (no token, disabled): "
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"b6-off-$(date +%s)@test.com\",\"username\":\"b6off$(date +%s)\",\"password\":\"strongpwd\",\"acceptedTerms\":true,\"acceptedPrivacy\":true}"

pkill -f 'nest start' || true
```

Expected: config returns `{"enabled":false,"siteKey":null}`; signup returns 201.

- [ ] **Step 2: Smoke with Cloudflare's always-pass test secret**

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true

# Cloudflare published test keys:
# Always-pass site:    1x00000000000000000000AA
# Always-pass secret:  1x0000000000000000000000000000000AA
# Always-fail secret:  2x0000000000000000000000000000000AA

cd backend && (TURNSTILE_SITE_KEY=1x00000000000000000000AA TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA npm run start:dev &) ; sleep 9

echo "=== Config (always-pass enabled) ==="
curl -s http://localhost:4000/api/security/turnstile-config

# Signup WITHOUT token (should 400: missing challenge response)
echo -n "Signup (missing token, enabled): "
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"b6-noTok-$(date +%s)@test.com\",\"username\":\"b6notok$(date +%s)\",\"password\":\"strongpwd\",\"acceptedTerms\":true,\"acceptedPrivacy\":true}"

# Signup WITH a fake non-empty token — the always-pass secret accepts any token
echo -n "Signup (with token, always-pass): "
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"b6-yesTok-$(date +%s)@test.com\",\"username\":\"b6yestok$(date +%s)\",\"password\":\"strongpwd\",\"acceptedTerms\":true,\"acceptedPrivacy\":true,\"turnstileToken\":\"any-string\"}"

pkill -f 'nest start' || true
```

Expected:
- Config: `{"enabled":true,"siteKey":"1x00000000000000000000AA"}`
- Signup w/o token: `400`
- Signup w/ token: `201`

If the always-pass smoke doesn't produce 201 (e.g. Cloudflare's siteverify is slow or unreachable from your dev machine), that's a network issue not a code defect — the unit tests already prove the gate logic.

---

## Phase 5 — Frontend

### Task 5.1: Install `@marsidev/react-turnstile`

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install**

```bash
cd frontend && npm install @marsidev/react-turnstile@^0.4
```

Expected: installs cleanly. Appears in `dependencies`.

### Task 5.2: `useTurnstileConfig` hook + API client

**Files:**
- Create: `frontend/src/lib/turnstile.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add API client method**

In `frontend/src/lib/api.ts`, add this DTO:

```ts
export interface TurnstileConfigDto {
  enabled: boolean;
  siteKey: string | null;
}
```

Add the method to the `api` object:

```ts
  getTurnstileConfig: () =>
    request<TurnstileConfigDto>('/security/turnstile-config'),
```

Extend the existing body types on `signup`, `login`, `forgotPassword` to accept `turnstileToken?: string`:

```ts
  signup: (body: {
    email: string;
    username: string;
    password: string;
    acceptedTerms: boolean;
    acceptedPrivacy: boolean;
    turnstileToken?: string;
  }) =>
    request<AuthResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
```

```ts
  login: (body: { email: string; password: string; turnstileToken?: string }) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
```

```ts
  forgotPassword: (body: { email: string; turnstileToken?: string }) =>
    request<{ sent: boolean }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
```

- [ ] **Step 2: Write the hook**

```ts
// frontend/src/lib/turnstile.ts
'use client';

import { useEffect, useState } from 'react';
import { api, TurnstileConfigDto } from './api';

let cached: TurnstileConfigDto | undefined;
let inflight: Promise<TurnstileConfigDto> | null = null;

function fetchOnce(): Promise<TurnstileConfigDto> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api
      .getTurnstileConfig()
      .then((config) => {
        cached = config;
        return config;
      })
      .catch((err) => {
        inflight = null;
        // Fail-open: if config fetch fails, behave as disabled.
        // Worst case is that legitimate users sail through; the server
        // still rejects requests if Turnstile is actually enabled.
        const fallback: TurnstileConfigDto = { enabled: false, siteKey: null };
        cached = fallback;
        return fallback;
      });
  }
  return inflight;
}

export function useTurnstileConfig(): TurnstileConfigDto {
  const [config, setConfig] = useState<TurnstileConfigDto>(
    cached ?? { enabled: false, siteKey: null },
  );

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    fetchOnce().then((c) => {
      if (!cancelled) setConfig(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}
```

### Task 5.3: `TurnstileWidget` component

**Files:**
- Create: `frontend/src/components/TurnstileWidget.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/TurnstileWidget.tsx
'use client';

import { useEffect } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { useTurnstileConfig } from '@/lib/turnstile';

interface Props {
  onToken: (token: string) => void;
  onExpire?: () => void;
  /** Force a fresh widget — pass a bumping integer to reset after a failed submit. */
  resetKey?: number;
}

export default function TurnstileWidget({ onToken, onExpire, resetKey }: Props) {
  const { enabled, siteKey } = useTurnstileConfig();

  // When Turnstile is disabled, immediately signal "open" so submit
  // gating doesn't deadlock.
  useEffect(() => {
    if (!enabled) onToken('');
  }, [enabled, onToken]);

  if (!enabled || !siteKey) return null;

  return (
    <div className="mt-2">
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
    </div>
  );
}
```

### Task 5.4: Wire into Signup page

**Files:**
- Modify: `frontend/src/app/signup/page.tsx`

- [ ] **Step 1: Add imports**

```tsx
import TurnstileWidget from '@/components/TurnstileWidget';
```

- [ ] **Step 2: Add state**

Inside `SignupPage`, add (near the other `useState` calls):

```ts
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
```

- [ ] **Step 3: Update the signup signature usage**

In the submit handler, where `signup(email, username, password, acceptedTerms, acceptedPrivacy)` is called — we need to thread the token through. Since `useAuth().signup` already takes these args, extend its signature (Task 5.6 below covers `useAuth`). For now, change the call to also pass the token:

```ts
      await signup(email, username, password, acceptedTerms, acceptedPrivacy, turnstileToken ?? undefined);
```

- [ ] **Step 4: Render the widget above the submit button**

```tsx
        <TurnstileWidget onToken={setTurnstileToken} />
```

- [ ] **Step 5: Gate the submit button**

Update the `disabled` prop to include `turnstileToken === null`:

```tsx
disabled={loading || !acceptedTerms || !acceptedPrivacy || turnstileToken === null}
```

When Turnstile is disabled, the widget's effect immediately sets `turnstileToken = ''` (an empty string is not `null`, so the gate passes).

### Task 5.5: Update `useAuth().signup` signature

**Files:**
- Modify: `frontend/src/lib/auth-context.tsx`

- [ ] **Step 1: Add an optional `turnstileToken` arg**

Find the `signup` function (5 args after B2 added the two boolean params). Add `turnstileToken?: string` and thread it through:

```ts
  const signup = async (
    email: string,
    username: string,
    password: string,
    acceptedTerms: boolean,
    acceptedPrivacy: boolean,
    turnstileToken?: string,
  ) => {
    const { token, user } = await api.signup({
      email,
      username,
      password,
      acceptedTerms,
      acceptedPrivacy,
      turnstileToken,
    });
    // ... preserve all existing post-signup logic ...
  };
```

Update the `AuthContextValue` type's `signup` field to match the new signature.

### Task 5.6: Wire into Forgot-password page

**Files:**
- Modify: `frontend/src/app/forgot-password/page.tsx`

- [ ] **Step 1: Add state + widget**

Import the widget:
```tsx
import TurnstileWidget from '@/components/TurnstileWidget';
```

Add state:
```ts
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
```

In the submit handler, change the API call:
```ts
      await api.forgotPassword({
        email: email.trim().toLowerCase(),
        turnstileToken: turnstileToken ?? undefined,
      });
```

Render the widget above the submit button:
```tsx
        <TurnstileWidget onToken={setTurnstileToken} />
```

Gate the submit:
```tsx
<Button type="submit" disabled={loading || !email || turnstileToken === null}>
```

### Task 5.7: Adaptive Turnstile on Login page

**Files:**
- Modify: `frontend/src/app/login/page.tsx`

- [ ] **Step 1: Imports + state**

```tsx
import TurnstileWidget from '@/components/TurnstileWidget';
```

Add inside the component:

```ts
  const [requiresTurnstile, setRequiresTurnstile] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
```

- [ ] **Step 2: Adapt the submit handler**

Find the existing submit handler. Change the API call to include `turnstileToken`:

```ts
      const res = await api.login({
        email,
        password,
        turnstileToken: turnstileToken ?? undefined,
      });
```

Wrap the existing error handling so a "Bot challenge required" 401 toggles the widget on:

```ts
    try {
      const res = await api.login({
        email,
        password,
        turnstileToken: turnstileToken ?? undefined,
      });
      // existing success path (set user, redirect, etc.)
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (/Bot challenge required/i.test(msg)) {
        setRequiresTurnstile(true);
        setTurnstileToken(null);
        setTurnstileResetKey((k) => k + 1);
        setErr('Please complete the bot challenge below and try again.');
      } else {
        setErr(msg || 'Login failed');
      }
    }
```

Use whichever error setter the file already uses (`setErr`, `setError`, etc.).

- [ ] **Step 3: Conditionally render the widget**

Above the submit button:

```tsx
        {requiresTurnstile && (
          <TurnstileWidget
            onToken={setTurnstileToken}
            resetKey={turnstileResetKey}
          />
        )}
```

- [ ] **Step 4: Conditionally gate the submit**

The submit button should be disabled while Turnstile is required and the token is still `null`:

```tsx
disabled={loading || (requiresTurnstile && turnstileToken === null)}
```

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

---

## Phase 6 — End-to-end verification

### Task 6.1: Backend tests + build

```bash
cd backend && npx jest 2>&1 | tail -10 && npm run build 2>&1 | tail -10
```

Expected: ≥ 99 tests pass; clean build.

### Task 6.2: Frontend build

```bash
cd frontend && npx next build 2>&1 | tail -20
```

Expected: clean.

### Task 6.3: Live smoke (Turnstile disabled)

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# Public config
echo "=== Config ==="
curl -s http://localhost:4000/api/security/turnstile-config

# Signup (no token, disabled) → 201
echo -n "Signup: "
SMOKE_EMAIL="b6-final-$(date +%s)@test.com"
SMOKE_USER="b6final$(date +%s)"
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"username\":\"$SMOKE_USER\",\"password\":\"strongpwd\",\"acceptedTerms\":true,\"acceptedPrivacy\":true}"

# Login 4× with bad password → 4× 401 (the 4th attempt triggers adaptive
# Turnstile but since it's disabled it auto-passes)
echo "=== Login lockout/Turnstile path ==="
for i in $(seq 1 4); do
  curl -s -o /dev/null -w "$i: %{http_code}\n" -X POST http://localhost:4000/api/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$SMOKE_EMAIL\",\"password\":\"wrong\"}"
done

pkill -f 'nest start' || true
```

Expected:
- Config: enabled=false
- Signup: 201
- 4 login attempts: each 401 (account locks at 5)

### Task 6.4: Regression smoke

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# A2: signup → 201
echo -n "A2 signup: "
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"b6-reg-$(date +%s)@test.com\",\"username\":\"b6reg$(date +%s)\",\"password\":\"strongpwd\",\"acceptedTerms\":true,\"acceptedPrivacy\":true}"

# B5: helmet headers
echo "B5 helmet:"
curl -sI http://localhost:4000/api/legal/pages | grep -iE "(strict-transport|x-frame)"

# B1: throttle
echo "B1 throttle:"
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "$i: %{http_code}\n" -X POST http://localhost:4000/api/auth/login \
    -H 'Content-Type: application/json' -d '{"email":"b6-throttle@nope.com","password":"x"}'
done

pkill -f 'nest start' || true
```

Expected:
- A2 signup: 201
- B5: both headers present
- B1: 5 × 401, then 429

---

## Verification Checklist

- [ ] Backend tests pass (≥ 99: 93 baseline from B4 + 4 turnstile + 2 auth-turnstile)
- [ ] Backend builds clean
- [ ] Frontend builds clean
- [ ] `GET /api/security/turnstile-config` returns the right shape with both keys
- [ ] Signup without token (Turnstile disabled in dev) returns 201
- [ ] Signup without token (Turnstile enabled with always-pass test secret) returns 400
- [ ] Signup with any non-empty token (Turnstile enabled with always-pass secret) returns 201
- [ ] Login with `failedLoginCount < 3` works without a token
- [ ] Login with `failedLoginCount >= 3` and no token returns 401 with `Bot challenge required` message
- [ ] Frontend signup page renders the widget when enabled, hides it when disabled
- [ ] Frontend login page renders the widget adaptively (only after a Bot-challenge-required error)
- [ ] A2/B5/B1/B3/B2/B4 regressions all clean
