# Password Reset + Session/Token Hardening (B2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add forgot-password / reset-password flow with Gmail SMTP delivery, plus bcrypt-rounds bump (10→12), password-minlength bump (6→8), and `tokenVersion` rotation on email change.

**Architecture:** New `MailerService` wraps a Nodemailer Gmail transport; falls back to console log when Gmail credentials are absent. Two new public endpoints on `AuthController`. Two new `User` columns hold a sha256 hash + 1h expiry of the active reset token. `AuthService.resetPassword` clears the reset row and bumps `tokenVersion` so all sessions invalidate.

**Tech Stack:** NestJS 10, nodemailer@^6, bcryptjs (existing), Jest, Next.js 14 (frontend).

**Spec:** [docs/superpowers/specs/2026-06-28-password-reset-session-hardening-design.md](../specs/2026-06-28-password-reset-session-hardening-design.md)

---

## File Structure

### Backend (new)
- `backend/src/mailer/mailer.module.ts` — exports `MailerService`
- `backend/src/mailer/mailer.service.ts` — Gmail transport + console fallback
- `backend/src/mailer/mailer.service.spec.ts` — 2 unit tests (configured vs unconfigured)

### Backend (modified)
- `backend/package.json` — add `nodemailer@^6`, `@types/nodemailer`
- `backend/.env.example` — add `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `MAIL_FROM`, `FRONTEND_RESET_URL`
- `backend/src/users/user.entity.ts` — `passwordResetTokenHash`, `passwordResetExpiresAt`
- `backend/src/auth/auth.dto.ts` — `SignupDto.password.@MinLength(8)`, `ChangePasswordDto.newPassword.@MinLength(8)`, new `ForgotPasswordDto`, new `ResetPasswordDto`
- `backend/src/auth/auth.service.ts` — bcrypt 10→12 (3 sites), email change bumps tokenVersion, new `forgotPassword` + `resetPassword` methods
- `backend/src/auth/auth.service.spec.ts` — extend with 6 new tests
- `backend/src/auth/auth.controller.ts` — `POST /auth/forgot-password`, `POST /auth/reset-password` with throttle decorators
- `backend/src/auth/auth.module.ts` — import `MailerModule`

### Frontend (new)
- `frontend/src/app/forgot-password/page.tsx`
- `frontend/src/app/reset-password/page.tsx`

### Frontend (modified)
- `frontend/src/lib/api.ts` — `forgotPassword`, `resetPassword` methods
- `frontend/src/app/login/page.tsx` — "Forgot password?" link + `?reset=1` success banner

---

## Phase 1 — User entity + bcrypt + password length

### Task 1.1: Add reset columns + bump bcrypt + password min length

**Files:**
- Modify: `backend/src/users/user.entity.ts`
- Modify: `backend/src/auth/auth.dto.ts`
- Modify: `backend/src/auth/auth.service.ts`

- [ ] **Step 1: Add the two reset columns**

In `backend/src/users/user.entity.ts`, after the existing `lockoutUntil` column (from B1), before the closing `}`, add:

```ts
  // ─── Password reset (B2) ────────────────────────────────────────
  // Set by POST /auth/forgot-password, cleared by POST /auth/reset-password.
  // The raw token is never stored — only its sha256 hash. Expires 1 hour
  // after issuance.
  @Column({ type: 'varchar', length: 64, nullable: true })
  passwordResetTokenHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  passwordResetExpiresAt: Date | null;
```

- [ ] **Step 2: Bump password min length to 8 in DTOs**

In `backend/src/auth/auth.dto.ts`:

Find `SignupDto.password`:
```ts
  @IsString()
  @MinLength(6)
  password: string;
```
Change `@MinLength(6)` → `@MinLength(8)`.

Find `ChangePasswordDto.newPassword`:
```ts
  @IsString()
  @MinLength(6)
  newPassword: string;
```
Change `@MinLength(6)` → `@MinLength(8)`.

- [ ] **Step 3: Bump bcrypt rounds to 12 in `auth.service.ts`**

In `backend/src/auth/auth.service.ts`, two existing `bcrypt.hash(..., 10)` calls become `bcrypt.hash(..., 12)`:

Line ~58 (in `signup`):
```ts
    const passwordHash = await bcrypt.hash(dto.password, 12);
```

Line ~151 (in `changePassword`):
```ts
    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
```

- [ ] **Step 4: Bump tokenVersion on email change**

In `backend/src/auth/auth.service.ts`, `changeEmail` method (around line 116), find:

```ts
    user.email = lcNew;
    await this.users.save(user);
    return { ok: true, email: lcNew };
```

Change to:

```ts
    user.email = lcNew;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.users.save(user);
    return { ok: true, email: lcNew };
```

- [ ] **Step 5: Verify boot + tests**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && timeout 25 npm run start:dev 2>&1 | grep -iE "(error|started)" | head -5
```

Expected: `Nest application successfully started`. The two new columns are auto-applied by `synchronize: true`.

```bash
cd backend && npx jest 2>&1 | tail -10
```

Expected: full suite passes (74 baseline from B3). The bcrypt rounds bump and minlength change don't break any existing test — the existing `auth.service.spec.ts` fixtures use 8+ char passwords and don't introspect bcrypt rounds.

If a test was using a 6-char password that now fails the validator, update it to 8 chars. Likely candidates: the `seedUser` helper in `auth.service.spec.ts`'s lockout describe block uses `'correct-password'` (15 chars) — should be fine.

---

## Phase 2 — `MailerService`

### Task 2.1: Install `nodemailer`

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install**

```bash
cd backend && npm install nodemailer@^6 && npm install -D @types/nodemailer
```

Expected: both install cleanly.

### Task 2.2: Write `MailerService` failing tests

**Files:**
- Create: `backend/src/mailer/mailer.service.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// backend/src/mailer/mailer.service.spec.ts
import { Test } from '@nestjs/testing';
import { MailerService } from './mailer.service';

describe('MailerService', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    delete process.env.MAIL_FROM;
  });

  it('falls back to console when GMAIL_USER is unset', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [MailerService],
    }).compile();
    const svc = moduleRef.get(MailerService);

    await svc.sendPasswordResetEmail(
      'user@example.com',
      'https://vocalmatch.com/reset-password?token=abc',
    );

    const logs = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(logs).toMatch(/Reset link/i);
    expect(logs).toContain('user@example.com');
    expect(logs).toContain('https://vocalmatch.com/reset-password?token=abc');
  });

  it('calls the Gmail transporter when GMAIL_USER is set', async () => {
    process.env.GMAIL_USER = 'noreply@vocalmatch.com';
    process.env.GMAIL_APP_PASSWORD = 'fake-16-char-pwd';

    // Inject a mock transporter via the service's createTransport seam
    const sendMail = jest.fn(async () => ({ accepted: ['user@example.com'] }));
    const fakeTransport: any = { sendMail };

    const moduleRef = await Test.createTestingModule({
      providers: [
        {
          provide: MailerService,
          useFactory: () => new MailerService(fakeTransport),
        },
      ],
    }).compile();
    const svc = moduleRef.get(MailerService);

    await svc.sendPasswordResetEmail(
      'user@example.com',
      'https://vocalmatch.com/reset-password?token=abc',
    );

    expect(sendMail).toHaveBeenCalledTimes(1);
    const arg = sendMail.mock.calls[0][0];
    expect(arg.to).toBe('user@example.com');
    expect(arg.subject).toMatch(/Reset your VOCALMATCH password/i);
    expect(arg.text).toContain('https://vocalmatch.com/reset-password?token=abc');
    expect(arg.text).toMatch(/1 hour/i);
  });
});
```

- [ ] **Step 2: Run — confirm red**

```bash
cd backend && npx jest src/mailer/mailer.service.spec.ts 2>&1 | tail -10
```

Expected: failure — `Cannot find module './mailer.service'`.

### Task 2.3: Implement `MailerService`

**Files:**
- Create: `backend/src/mailer/mailer.service.ts`
- Create: `backend/src/mailer/mailer.module.ts`

- [ ] **Step 1: Write `mailer.service.ts`**

```ts
// backend/src/mailer/mailer.service.ts
import { Injectable, Logger } from '@nestjs/common';
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
  constructor(injected?: MailTransporter) {
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
```

- [ ] **Step 2: Write `mailer.module.ts`**

```ts
// backend/src/mailer/mailer.module.ts
import { Module } from '@nestjs/common';
import { MailerService } from './mailer.service';

@Module({
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
```

- [ ] **Step 3: Run — confirm green**

```bash
cd backend && npx jest src/mailer/mailer.service.spec.ts 2>&1 | tail -10
```

Expected: `Tests: 2 passed, 2 total`.

---

## Phase 3 — Forgot + reset DTOs and service methods (TDD)

### Task 3.1: Add DTOs

**Files:**
- Modify: `backend/src/auth/auth.dto.ts`

- [ ] **Step 1: Add the two DTOs**

In `backend/src/auth/auth.dto.ts`, append at the end of the file:

```ts
export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  token: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
```

Add `MaxLength` to the existing `class-validator` import if not already present.

### Task 3.2: Write failing tests for forgot + reset

**Files:**
- Modify: `backend/src/auth/auth.service.spec.ts`

- [ ] **Step 1: Append a new describe block**

At the end of `backend/src/auth/auth.service.spec.ts`, add (matching the file's existing imports — augment imports at top if needed: `crypto`, `BadRequestException`):

```ts
describe('AuthService password reset', () => {
  let service: AuthService;
  const usersState: any[] = [];

  const userRepo: any = {
    findOne: jest.fn(async ({ where }: any) => {
      if (where.email) {
        return usersState.find((u) => u.email === where.email) ?? null;
      }
      if (where.passwordResetTokenHash) {
        return (
          usersState.find(
            (u) =>
              u.passwordResetTokenHash === where.passwordResetTokenHash &&
              u.passwordResetExpiresAt &&
              u.passwordResetExpiresAt > new Date(),
          ) ?? null
        );
      }
      return null;
    }),
    save: jest.fn(async (row: any) => {
      const i = usersState.findIndex((u) => u.id === row.id);
      if (i >= 0) usersState[i] = { ...usersState[i], ...row };
      return row;
    }),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => null),
    })),
    create: jest.fn((row: any) => row),
  };

  const jwt: any = { sign: jest.fn(() => 'fake.jwt') };

  const legal: any = {
    getCurrentVersionIds: jest.fn(async () => ({
      terms: 'v-terms-1',
      privacy: 'v-privacy-1',
    })),
  };

  const mailer: any = { sendPasswordResetEmail: jest.fn(async () => undefined) };

  beforeEach(async () => {
    usersState.length = 0;
    jest.clearAllMocks();
    process.env.FRONTEND_RESET_URL = 'https://vocalmatch.com/reset-password';
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: JwtService, useValue: jwt },
        { provide: LegalService, useValue: legal },
        { provide: MailerService, useValue: mailer },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  describe('forgotPassword', () => {
    it('writes hash + expiry and sends email for an existing user', async () => {
      usersState.push({
        id: 'u-1',
        email: 'a@b.com',
        username: 'tester',
        passwordHash: 'hash',
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        tokenVersion: 0,
      });
      const out = await service.forgotPassword({ email: 'a@b.com' } as any);
      expect(out).toEqual({ sent: true });
      expect(usersState[0].passwordResetTokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(usersState[0].passwordResetExpiresAt).toBeInstanceOf(Date);
      const ms = usersState[0].passwordResetExpiresAt.getTime() - Date.now();
      expect(ms).toBeGreaterThan(59 * 60 * 1000);
      expect(ms).toBeLessThanOrEqual(61 * 60 * 1000);
      expect(mailer.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      const [toEmail, url] = mailer.sendPasswordResetEmail.mock.calls[0];
      expect(toEmail).toBe('a@b.com');
      expect(url).toMatch(/^https:\/\/vocalmatch\.com\/reset-password\?token=[a-f0-9]{64}$/);
    });

    it('is a silent no-op for an unknown email', async () => {
      const out = await service.forgotPassword({ email: 'nobody@nope.com' } as any);
      expect(out).toEqual({ sent: true });
      expect(mailer.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('updates passwordHash, clears reset fields, and bumps tokenVersion on a valid token', async () => {
      const crypto = require('crypto');
      const token = 'a'.repeat(64);
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      usersState.push({
        id: 'u-1',
        email: 'a@b.com',
        username: 'tester',
        passwordHash: 'old',
        passwordResetTokenHash: hash,
        passwordResetExpiresAt: new Date(Date.now() + 30 * 60_000),
        tokenVersion: 3,
      });
      const out = await service.resetPassword({
        token,
        newPassword: 'newpassword123',
      } as any);
      expect(out).toEqual({ reset: true });
      expect(usersState[0].passwordHash).not.toBe('old');
      expect(usersState[0].passwordResetTokenHash).toBeNull();
      expect(usersState[0].passwordResetExpiresAt).toBeNull();
      expect(usersState[0].tokenVersion).toBe(4);
    });

    it('rejects an expired token', async () => {
      const crypto = require('crypto');
      const token = 'b'.repeat(64);
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      usersState.push({
        id: 'u-1',
        email: 'a@b.com',
        username: 'tester',
        passwordHash: 'old',
        passwordResetTokenHash: hash,
        passwordResetExpiresAt: new Date(Date.now() - 1000),
        tokenVersion: 0,
      });
      await expect(
        service.resetPassword({
          token,
          newPassword: 'newpassword123',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects an unknown / tampered token', async () => {
      await expect(
        service.resetPassword({
          token: 'c'.repeat(64),
          newPassword: 'newpassword123',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
```

- [ ] **Step 2: Add necessary imports**

At the top of the file, add to the existing imports:

```ts
import { BadRequestException } from '@nestjs/common';
import { MailerService } from '../mailer/mailer.service';
```

- [ ] **Step 3: Run — confirm red**

```bash
cd backend && npx jest src/auth/auth.service.spec.ts -t "password reset" 2>&1 | tail -20
```

Expected: 5 failures (3 forgotPassword + reset tests + 3 more — total 5 in the new describe). Failure reasons will vary: `service.forgotPassword is not a function`, etc.

### Task 3.3: Implement `forgotPassword` and `resetPassword`

**Files:**
- Modify: `backend/src/auth/auth.service.ts`

- [ ] **Step 1: Add imports**

Top of file, add `BadRequestException` to the existing `@nestjs/common` import if not present. Add:

```ts
import * as crypto from 'crypto';
import { MailerService } from '../mailer/mailer.service';
import { ForgotPasswordDto, ResetPasswordDto } from './auth.dto';
```

- [ ] **Step 2: Inject `MailerService`**

In `AuthService` constructor, append after `private readonly legal: LegalService`:

```ts
    private readonly mailer: MailerService,
```

- [ ] **Step 3: Add `forgotPassword` method**

Inside the `AuthService` class, just before the `private tokenize` method, add:

```ts
  async forgotPassword(dto: ForgotPasswordDto) {
    const lcEmail = dto.email.toLowerCase();
    const user = await this.users.findOne({ where: { email: lcEmail } });
    if (!user) {
      // Don't reveal whether the address belongs to a real account.
      return { sent: true };
    }

    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    user.passwordResetTokenHash = hash;
    user.passwordResetExpiresAt = new Date(Date.now() + 60 * 60_000);
    await this.users.save(user);

    const base =
      process.env.FRONTEND_RESET_URL ?? 'http://localhost:3000/reset-password';
    const resetUrl = `${base}?token=${token}`;
    await this.mailer.sendPasswordResetEmail(user.email, resetUrl);

    return { sent: true };
  }
```

- [ ] **Step 4: Add `resetPassword` method**

After `forgotPassword`, add:

```ts
  async resetPassword(dto: ResetPasswordDto) {
    const hash = crypto
      .createHash('sha256')
      .update(dto.token)
      .digest('hex');
    const user = await this.users.findOne({
      where: { passwordResetTokenHash: hash },
    });
    if (
      !user ||
      !user.passwordResetExpiresAt ||
      user.passwordResetExpiresAt <= new Date()
    ) {
      throw new BadRequestException('Invalid or expired reset link');
    }

    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    user.tokenVersion = (user.tokenVersion ?? 0) + 1;
    await this.users.save(user);

    return { reset: true };
  }
```

- [ ] **Step 5: Run — confirm green**

```bash
cd backend && npx jest src/auth/auth.service.spec.ts 2>&1 | tail -15
```

Expected: full file passes, ≥ 12 tests (existing 7 from B1 + 5 new from this phase).

---

## Phase 4 — Wire endpoints + module

### Task 4.1: Add `forgot-password` and `reset-password` routes

**Files:**
- Modify: `backend/src/auth/auth.controller.ts`

- [ ] **Step 1: Add imports**

```ts
import { ForgotPasswordDto, ResetPasswordDto } from './auth.dto';
```

(If imports are grouped per file, add to the existing `from './auth.dto'` line.)

- [ ] **Step 2: Add the two routes**

Inside the `AuthController` class, after the existing `signOutEverywhere` method, add:

```ts
  @Throttle({
    short: { limit: 1, ttl: 60_000 },
    long: { limit: 5, ttl: 3_600_000 },
  })
  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Request a password-reset link',
    description:
      'Public. Always returns 200 — does not reveal whether the email is registered. ' +
      'If the email matches a user, a reset link is sent.',
  })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Reset password with a one-time token',
    description:
      'Public. Token expires 1 hour after issuance. On success the user must ' +
      'sign in with the new password — existing sessions are invalidated.',
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }
```

### Task 4.2: Wire `MailerModule` into `AuthModule`

**Files:**
- Modify: `backend/src/auth/auth.module.ts`

- [ ] **Step 1: Import + add**

In `backend/src/auth/auth.module.ts`, add:

```ts
import { MailerModule } from '../mailer/mailer.module';
```

In the `@Module` decorator's `imports` array, append `MailerModule` after `LegalModule` (or wherever the existing imports end — order doesn't matter).

- [ ] **Step 2: Update `.env.example`**

In `backend/.env.example`, append (after the `ENABLE_DOCS` block):

```env

# Email — Gmail SMTP for transactional sends (password reset, etc.)
# Generate the app password at: https://myaccount.google.com/apppasswords
GMAIL_USER=
GMAIL_APP_PASSWORD=
MAIL_FROM=
# Public URL the password-reset email links back to. Should be the
# frontend's /reset-password route on the production domain.
FRONTEND_RESET_URL=http://localhost:3000/reset-password
```

- [ ] **Step 3: Verify boot + smoke**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# Forgot-password for unknown email
echo "=== Unknown email ==="
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"nobody@nope.example"}'

# Forgot-password for a real user (signup first)
SMOKE_EMAIL="b2-reset-$(date +%s)@test.com"
SMOKE_USER="b2reset$(date +%s)"
curl -s -X POST http://localhost:4000/api/auth/signup -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"username\":\"$SMOKE_USER\",\"password\":\"strongpwd1\",\"acceptedTerms\":true,\"acceptedPrivacy\":true}" > /dev/null

echo "=== Real email ==="
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SMOKE_EMAIL\"}"

# Confirm a log line appeared (if Gmail not configured)
sleep 1
pkill -f 'nest start' || true
```

Expected:
- Both curls return 200.
- If `GMAIL_USER` is unset (likely in dev), the server log contains `🔐 Reset link for <SMOKE_EMAIL>: <URL>`.

---

## Phase 5 — Frontend

### Task 5.1: API client methods

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add the two methods**

In the `api` object literal (the one that holds `signup`, `login`, etc.), add:

```ts
  forgotPassword: (body: { email: string }) =>
    request<{ sent: boolean }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  resetPassword: (body: { token: string; newPassword: string }) =>
    request<{ reset: boolean }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

### Task 5.2: `/forgot-password` page

**Files:**
- Create: `frontend/src/app/forgot-password/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// frontend/src/app/forgot-password/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { Button, Field, TextInput } from '@/components/forms';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await api.forgotPassword({ email: email.trim().toLowerCase() });
      setSubmitted(true);
    } catch (e: any) {
      setErr(e?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Nav />
      <main className="max-w-md mx-auto px-6 py-12">
        <h1 className="text-3xl font-display text-white">Forgot password</h1>
        <p className="mt-2 text-sm text-haze">
          Enter your email and we'll send a link to reset your password.
        </p>

        {submitted ? (
          <div className="mt-6 rounded-md border border-stage-700/60 bg-stage-900/40 px-4 py-4 text-sm text-haze">
            If your email is registered, we've sent a link to reset your
            password. Check your inbox (and spam folder). The link expires in
            1 hour.
            <p className="mt-3">
              <Link href="/login" className="text-spotlight hover:underline">
                Back to sign in
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {err && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-200 px-3 py-2 text-sm">
                {err}
              </div>
            )}
            <Field label="Email">
              <TextInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" disabled={loading || !email}>
              {loading ? 'Sending…' : 'Send reset link'}
            </Button>
            <p className="text-xs text-haze">
              <Link href="/login" className="text-spotlight hover:underline">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </main>
    </>
  );
}
```

### Task 5.3: `/reset-password` page

**Files:**
- Create: `frontend/src/app/reset-password/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// frontend/src/app/reset-password/page.tsx
'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { StageLoader } from '@/components/Loaders';
import { Button, Field, TextInput } from '@/components/forms';
import { api } from '@/lib/api';

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <>
          <Nav />
          <main className="max-w-md mx-auto px-6 py-12">
            <StageLoader message="Loading…" />
          </main>
        </>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params?.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!token) {
      setErr('Missing reset token. Use the link from your email.');
      return;
    }
    if (newPassword.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErr('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword({ token, newPassword });
      router.push('/login?reset=1');
    } catch (e: any) {
      setErr(e?.message ?? 'Reset failed. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Nav />
      <main className="max-w-md mx-auto px-6 py-12">
        <h1 className="text-3xl font-display text-white">Reset password</h1>
        <p className="mt-2 text-sm text-haze">Choose a new password.</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {err && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-200 px-3 py-2 text-sm">
              {err}
            </div>
          )}
          <Field label="New password (8+ characters)">
            <TextInput
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </Field>
          <Field label="Confirm new password">
            <TextInput
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </Field>
          <Button type="submit" disabled={loading || !token}>
            {loading ? 'Resetting…' : 'Reset password'}
          </Button>
          <p className="text-xs text-haze">
            <Link href="/login" className="text-spotlight hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      </main>
    </>
  );
}
```

### Task 5.4: Add Forgot-password link + success banner to login page

**Files:**
- Modify: `frontend/src/app/login/page.tsx`

- [ ] **Step 1: Add a "Forgot password?" link**

In `frontend/src/app/login/page.tsx`, find the password field (search for `type="password"`). After the password field's containing `<Field>` or similar, add:

```tsx
        <p className="text-xs text-right">
          <Link href="/forgot-password" className="text-spotlight hover:underline">
            Forgot password?
          </Link>
        </p>
```

If `Link` is not already imported, add `import Link from 'next/link';` at the top.

- [ ] **Step 2: Show success banner when redirected with `?reset=1`**

At the top of the component (inside the `LoginPage` function), add:

```ts
  const search = useSearchParams();
  const justReset = search?.get('reset') === '1';
```

Add `useSearchParams` to the `next/navigation` import.

Then near the top of the form (or just below the heading), conditionally render:

```tsx
        {justReset && (
          <div className="rounded-md border border-green-500/40 bg-green-500/10 text-green-200 px-3 py-2 text-sm">
            Password reset. Sign in with your new password.
          </div>
        )}
```

If the LoginPage isn't already wrapped in `<Suspense>` (required for `useSearchParams` server-rendered), wrap the inner form in a Suspense boundary similar to how upload/page.tsx does it. If you find that the existing login already uses `useSearchParams` somewhere (for `?next=...`), no Suspense change is needed — it's already in place.

- [ ] **Step 3: TypeScript check + smoke**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

```bash
lsof -ti :3000 | xargs -I {} kill {} 2>/dev/null || true
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9
cd /Users/azeemmalik/Downloads/video-vote-app/frontend && (npm run dev &) ; sleep 14

curl -s -o /tmp/forgot.html -w "%{http_code}\n" http://localhost:3000/forgot-password
echo "Forgot page contains email input: $(grep -c 'type="email"' /tmp/forgot.html)"

curl -s -o /tmp/reset.html -w "%{http_code}\n" 'http://localhost:3000/reset-password?token=abc'
echo "Reset page contains password input: $(grep -c 'type="password"' /tmp/reset.html)"

curl -s -o /tmp/login.html -w "%{http_code}\n" 'http://localhost:3000/login'
echo "Login page has forgot link: $(grep -c '/forgot-password' /tmp/login.html)"

pkill -f 'next dev' || true
pkill -f 'nest start' || true
```

Expected:
- All 3 routes return 200
- Forgot page: ≥ 1 email input
- Reset page: ≥ 2 password inputs (new + confirm) — though SSR may not render the form (Suspense boundary). If 0, that's fine.
- Login page: ≥ 1 `/forgot-password` reference

---

## Phase 6 — End-to-end verification

### Task 6.1: Backend tests + build

```bash
cd backend && npx jest 2>&1 | tail -10 && npm run build 2>&1 | tail -10
```

Expected: ≥ 81 tests passing (74 baseline from B3 + 2 mailer + 5 password-reset = 81). Build clean.

### Task 6.2: Frontend build

```bash
cd frontend && npx next build 2>&1 | tail -25
```

Expected: clean. Routes `/forgot-password` and `/reset-password` in the manifest.

### Task 6.3: Full reset-flow live smoke

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

SMOKE_EMAIL="b2-flow-$(date +%s)@test.com"
SMOKE_USER="b2flow$(date +%s)"

# 1) Signup with 8-char password (should succeed)
echo -n "1. Signup (8+ char pw): "
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"username\":\"$SMOKE_USER\",\"password\":\"strongpwd1\",\"acceptedTerms\":true,\"acceptedPrivacy\":true}"

# 2) Signup with 7-char password (should fail)
echo -n "2. Signup (7-char pw → expect 400): "
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"short-$(date +%s)@test.com\",\"username\":\"short$(date +%s)\",\"password\":\"sevenok\",\"acceptedTerms\":true,\"acceptedPrivacy\":true}"

# 3) Forgot-password for the smoke user
echo -n "3. Forgot-password: "
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SMOKE_EMAIL\"}"

# 4) Capture the reset URL from logs and extract the token. This depends
# on the dev server printing the log line; if Gmail is configured the
# token won't be in logs and you'll need to inspect the actual email.
sleep 1
TOKEN_LINE=$(cd backend && tail -200 /tmp/nest.log 2>/dev/null | grep "Reset link for $SMOKE_EMAIL" | tail -1 || true)

if [ -z "$TOKEN_LINE" ]; then
  echo "(Couldn't auto-extract token from logs — visually inspect the running dev server output.)"
  echo "Skipping rest of E2E smoke."
else
  TOKEN=$(echo "$TOKEN_LINE" | grep -oE 'token=[a-f0-9]+' | head -1 | sed 's/token=//')
  # 5) Reset
  echo -n "5. Reset-password: "
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/reset-password \
    -H 'Content-Type: application/json' \
    -d "{\"token\":\"$TOKEN\",\"newPassword\":\"newpassword1\"}"
  # 6) Login with new password
  echo -n "6. Login with new pw: "
  curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$SMOKE_EMAIL\",\"password\":\"newpassword1\"}"
fi

pkill -f 'nest start' || true
```

Expected:
- 1: 201
- 2: 400 (password length validator rejects)
- 3: 200
- 5: 200 (if token extracted)
- 6: 200 (login with new password)

If you can't redirect server logs to `/tmp/nest.log` automatically, run the dev server in a separate terminal and observe the `🔐 Reset link` line manually, then run steps 5/6 with the captured token.

### Task 6.4: Regression checks

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# A2: signup with acks → 201
echo -n "A2 signup w/ acks: "
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"a2-regress-$(date +%s)@test.com\",\"username\":\"a2reg$(date +%s)\",\"password\":\"strongpwd\",\"acceptedTerms\":true,\"acceptedPrivacy\":true}"

# B5: helmet headers
echo "B5 helmet headers:"
curl -sI http://localhost:4000/api/legal/pages | grep -iE "(strict-transport|x-frame|x-content-type|referrer)"

# B1: login throttle still fires
echo "B1 throttle:"
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "$i: %{http_code}\n" -X POST http://localhost:4000/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"b2-throttle@nope.com","password":"x"}'
done

pkill -f 'nest start' || true
```

Expected:
- A2 signup: 201
- B5: all 4 helmet headers present
- B1: 5 × 401 (or 423 if account got locked), then 429

---

## Verification Checklist

Before declaring B2 done:

- [ ] Backend tests pass (≥ 81 total: 74 baseline + 2 mailer + 5 reset)
- [ ] Backend builds clean
- [ ] Frontend builds clean; `/forgot-password` and `/reset-password` in manifest
- [ ] Signup with 6-char password → 400 (new minimum is 8)
- [ ] Signup with 8-char password → 201
- [ ] `/api/auth/forgot-password` for unknown email → 200 + no email send
- [ ] `/api/auth/forgot-password` for known email → 200 + log line (or email if Gmail configured)
- [ ] `/api/auth/reset-password` with valid token → 200; user can log in with new password
- [ ] `/api/auth/reset-password` with expired token → 400
- [ ] `/api/auth/reset-password` with tampered token → 400
- [ ] Email change bumps `tokenVersion` (verify via DB row inspection or follow-up token-invalidated test)
- [ ] A2/B1/B5/B3 regressions all clean
