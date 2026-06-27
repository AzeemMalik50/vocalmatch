# Rate Limiting + Brute-Force Protection (B1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `@nestjs/throttler` global + per-endpoint rate limiting, and brute-force lockout on the User row (5 failed logins → 15-minute lock), with an admin unlock endpoint.

**Architecture:** `ThrottlerModule.forRoot([short, medium, long])` registers three named per-IP buckets globally via `APP_GUARD`. Sensitive routes get `@Throttle(...)` decorators with stricter overrides. Admin controllers get `@SkipThrottle()`. The User entity gains `failedLoginCount` (int) and `lockoutUntil` (timestamptz, nullable) — `AuthService.login` mutates them, and a new `POST /api/admin/users/:id/unlock` clears them.

**Tech Stack:** NestJS 10, `@nestjs/throttler@^5`, TypeORM, Jest.

**Spec:** [docs/superpowers/specs/2026-06-27-rate-limiting-and-brute-force-design.md](../specs/2026-06-27-rate-limiting-and-brute-force-design.md)

---

## File Structure

### Backend (modified)
- `backend/package.json` — add `@nestjs/throttler` dep
- `backend/src/app.module.ts` — `ThrottlerModule.forRoot(...)` + `APP_GUARD` registration
- `backend/src/users/user.entity.ts` — add `failedLoginCount`, `lockoutUntil` columns
- `backend/src/auth/auth.controller.ts` — `@Throttle(...)` on signup/login/password/email
- `backend/src/auth/auth.service.ts` — login lockout flow, plus `LockedException` import
- `backend/src/auth/auth.service.spec.ts` — extend with login lockout tests
- `backend/src/videos/videos.controller.ts` — `@Throttle(...)` on upload
- `backend/src/battles/battles.controller.ts` — `@Throttle(...)` on vote
- `backend/src/battles/challenges.controller.ts` — `@Throttle(...)` on challenge submission
- `backend/src/admin/admin.controller.ts` — `@SkipThrottle()` class-level + new `POST /admin/users/:id/unlock` endpoint

---

## Phase 1 — Install + global throttler

### Task 1.1: Install `@nestjs/throttler`

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install**

```bash
cd backend && npm install @nestjs/throttler@^5
```

Expected: installs cleanly. `@nestjs/throttler` appears in `dependencies`.

### Task 1.2: Wire `ThrottlerModule` into `AppModule`

**Files:**
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Add the imports**

In `backend/src/app.module.ts`, add near the other `@nestjs/*` imports at the top:

```ts
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
```

- [ ] **Step 2: Add `ThrottlerModule.forRoot([...])` to `imports`**

In the `@Module` decorator's `imports` array, ADD (alongside `ConfigModule.forRoot`, `ScheduleModule.forRoot`):

```ts
    ThrottlerModule.forRoot([
      { name: 'short',  ttl: 1_000,     limit: 10 },
      { name: 'medium', ttl: 60_000,    limit: 100 },
      { name: 'long',   ttl: 3_600_000, limit: 1000 },
    ]),
```

Order it just after `ScheduleModule.forRoot()` for grouping cleanliness.

- [ ] **Step 3: Register the guard globally**

The `@Module` decorator currently has no `providers`. Add a `providers` array:

```ts
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
```

Place this directly after the `imports` array within the `@Module` decorator.

- [ ] **Step 4: Verify boot + TypeScript**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && timeout 25 npm run start:dev 2>&1 | grep -iE "(throttler|error|started)" | head -10
```

Expected: `ThrottlerModule dependencies initialized` (or similar) + `Nest application successfully started`. No errors.

- [ ] **Step 5: Verify global limit fires under load**

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# 15 requests in <1s — must exceed the short bucket (10/s)
codes=$(for i in $(seq 1 15); do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/legal/pages &
done; wait)
echo "$codes" | sort | uniq -c

pkill -f 'nest start' || true
```

Expected: a mix of `200` and `429` (rate-limited responses). If everything is 200, the global guard didn't register.

---

## Phase 2 — Per-endpoint throttle decorators

### Task 2.1: Auth routes

**Files:**
- Modify: `backend/src/auth/auth.controller.ts`

- [ ] **Step 1: Add the import**

At the top of the file, add:

```ts
import { Throttle } from '@nestjs/throttler';
```

- [ ] **Step 2: Decorate signup**

Find `@Post('signup')` (line 32). Add directly BEFORE it (after the `@ApiTags('Auth')`/`@Controller('auth')` class-level decorators, but immediately above the `@Post('signup')`):

```ts
  @Throttle({
    short: { limit: 1, ttl: 10_000 },
    long: { limit: 10, ttl: 3_600_000 },
  })
```

- [ ] **Step 3: Decorate login**

Find `@Post('login')` (line 45). Add above:

```ts
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
```

- [ ] **Step 4: Decorate email change**

Find `@Patch('email')` (line 59). Add above:

```ts
  @Throttle({ short: { limit: 3, ttl: 60_000 } })
```

- [ ] **Step 5: Decorate password change**

Find `@Patch('password')` (line 70). Add above:

```ts
  @Throttle({ short: { limit: 3, ttl: 60_000 } })
```

- [ ] **Step 6: Verify boot + smoke test login throttle**

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# 7 rapid login attempts from same IP — expect 5 × 401, then 429
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "$i: %{http_code}\n" \
    -X POST http://localhost:4000/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"throttle-test@nope.com","password":"x"}'
done

pkill -f 'nest start' || true
```

Expected: attempts 1–5 return `401`, attempts 6–7 return `429`.

### Task 2.2: Upload, vote, challenge routes

**Files:**
- Modify: `backend/src/videos/videos.controller.ts`
- Modify: `backend/src/battles/battles.controller.ts`
- Modify: `backend/src/battles/challenges.controller.ts`

- [ ] **Step 1: Import `Throttle` in each file**

In all three files, add to the imports:

```ts
import { Throttle } from '@nestjs/throttler';
```

- [ ] **Step 2: Decorate upload**

In `videos.controller.ts`, find `@Post()` for the upload (around line 160 — the one with `@UseInterceptors(FileInterceptor('video'))`). Add above the `@Post()`:

```ts
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
```

- [ ] **Step 3: Decorate vote**

In `battles.controller.ts`, find `@Post(':id/vote')` (line 157). Add above:

```ts
  @Throttle({ short: { limit: 30, ttl: 60_000 } })
```

- [ ] **Step 4: Decorate challenge submission**

In `challenges.controller.ts`, find `@Post('songs/:songId/challenges')` (line 30). Add above:

```ts
  @Throttle({ short: { limit: 5, ttl: 60_000 } })
```

- [ ] **Step 5: Verify boot**

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && timeout 25 npm run start:dev 2>&1 | grep -iE "(error|started)" | head -5
```

Expected: `Nest application successfully started`.

### Task 2.3: Skip throttling on admin routes

**Files:**
- Modify: `backend/src/admin/admin.controller.ts`

- [ ] **Step 1: Add the import + decorator**

In `backend/src/admin/admin.controller.ts`, add to the `@nestjs/throttler` import (creating it if there's no other throttler import in this file):

```ts
import { SkipThrottle } from '@nestjs/throttler';
```

Add `@SkipThrottle()` at the class level, immediately before `@Controller('admin/users')`:

```ts
@ApiTags('Admin – Users')
@ApiBearerAuth('bearer')
@SkipThrottle()
@Controller('admin/users')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
```

Repeat the same edit for these admin controllers (add the import + `@SkipThrottle()` class-level decorator):
- `backend/src/admin/admin-performances.controller.ts` (class `AdminPerformancesController`)
- `backend/src/battles/admin-challenges.controller.ts` (class `AdminChallengesController`)
- `backend/src/legal/admin-legal.controller.ts` (class `AdminLegalController`)

- [ ] **Step 2: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

---

## Phase 3 — User entity columns for lockout

### Task 3.1: Add `failedLoginCount` and `lockoutUntil`

**Files:**
- Modify: `backend/src/users/user.entity.ts`

- [ ] **Step 1: Add the columns**

In `backend/src/users/user.entity.ts`, after the existing `@CreateDateColumn createdAt: Date;` (around line 104) and before the closing `}`, add:

```ts
  // ─── Brute-force lockout (B1) ──────────────────────────────────
  // Incremented on every failed login. Reset to 0 on a successful
  // login. When it reaches 5, lockoutUntil is set to now + 15 min.
  @Column({ default: 0 })
  failedLoginCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockoutUntil: Date | null;
```

- [ ] **Step 2: Boot to apply schema**

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && timeout 25 npm run start:dev 2>&1 | grep -iE "(error|started)" | head -5
```

Expected: `Nest application successfully started`. TypeORM's `synchronize: true` (dev) adds the two columns to the Postgres `users` table.

- [ ] **Step 3: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

---

## Phase 4 — Login lockout (TDD)

### Task 4.1: Write failing tests for lockout behavior

**Files:**
- Modify: `backend/src/auth/auth.service.spec.ts`

- [ ] **Step 1: Add `LockedException` import + new tests**

The existing spec covers signup acceptance plumbing (2 tests). Append a new `describe('AuthService.login lockout', ...)` block at the end of the file (before the closing `});` of the outer `describe`, OR as a separate top-level `describe` — match the file's style).

At the top of the file, add to the existing imports:

```ts
import { LockedException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
```

(If `UnauthorizedException` is already imported, leave it.)

Then add this new `describe` block at the bottom of the file:

```ts
describe('AuthService.login lockout', () => {
  let service: AuthService;

  const usersState: any[] = [];

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
      terms: 'v-terms-1',
      privacy: 'v-privacy-1',
    })),
  };

  const seedUser = async (overrides: Partial<any> = {}) => {
    const hash = await bcrypt.hash('correct-password', 10);
    usersState.length = 0;
    usersState.push({
      id: 'u-1',
      email: 'a@b.com',
      username: 'tester',
      passwordHash: hash,
      failedLoginCount: 0,
      lockoutUntil: null,
      ...overrides,
    });
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: JwtService, useValue: jwt },
        { provide: LegalService, useValue: legal },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('increments failedLoginCount on a bad password', async () => {
    await seedUser();
    await expect(
      service.login({ email: 'a@b.com', password: 'wrong' } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersState[0].failedLoginCount).toBe(1);
    expect(usersState[0].lockoutUntil).toBeNull();
  });

  it('sets lockoutUntil after the 5th failure', async () => {
    await seedUser({ failedLoginCount: 4 });
    await expect(
      service.login({ email: 'a@b.com', password: 'wrong' } as any),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(usersState[0].failedLoginCount).toBe(5);
    expect(usersState[0].lockoutUntil).toBeInstanceOf(Date);
    const ms = usersState[0].lockoutUntil.getTime() - Date.now();
    // 15 minutes ± a few seconds
    expect(ms).toBeGreaterThan(14 * 60 * 1000);
    expect(ms).toBeLessThan(16 * 60 * 1000);
  });

  it('rejects login with the correct password while locked', async () => {
    const future = new Date(Date.now() + 10 * 60_000);
    await seedUser({ failedLoginCount: 5, lockoutUntil: future });
    await expect(
      service.login({ email: 'a@b.com', password: 'correct-password' } as any),
    ).rejects.toBeInstanceOf(LockedException);
  });

  it('proceeds past an expired lockoutUntil', async () => {
    const past = new Date(Date.now() - 1000);
    await seedUser({ failedLoginCount: 5, lockoutUntil: past });
    const out = await service.login({
      email: 'a@b.com',
      password: 'correct-password',
    } as any);
    expect(out.token).toBe('fake.jwt');
    expect(usersState[0].failedLoginCount).toBe(0);
    expect(usersState[0].lockoutUntil).toBeNull();
  });

  it('resets the counter on a successful login', async () => {
    await seedUser({ failedLoginCount: 3 });
    const out = await service.login({
      email: 'a@b.com',
      password: 'correct-password',
    } as any);
    expect(out.token).toBe('fake.jwt');
    expect(usersState[0].failedLoginCount).toBe(0);
    expect(usersState[0].lockoutUntil).toBeNull();
  });
});
```

- [ ] **Step 2: Run — confirm red**

```bash
cd backend && npx jest src/auth/auth.service.spec.ts -t "lockout" 2>&1 | tail -20
```

Expected: 5 failures. Reasons will vary by assertion (counter doesn't increment, `LockedException` not thrown, etc.).

### Task 4.2: Implement lockout in `AuthService.login`

**Files:**
- Modify: `backend/src/auth/auth.service.ts`

- [ ] **Step 1: Add `LockedException` import**

In `backend/src/auth/auth.service.ts`, find the existing `import { ... } from '@nestjs/common';` block (top of file). Add `LockedException` to it.

- [ ] **Step 2: Replace the `login` method body**

The current `login` method (around line 72) is:

```ts
  async login(dto: LoginDto) {
    const identifier = dto.email.trim().toLowerCase();
    const user = await this.users
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :identifier OR LOWER(u.username) = :identifier', {
        identifier,
      })
      .getOne();
    if (!user) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    return this.tokenize(user);
  }
```

Replace with:

```ts
  async login(dto: LoginDto) {
    const identifier = dto.email.trim().toLowerCase();
    const user = await this.users
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :identifier OR LOWER(u.username) = :identifier', {
        identifier,
      })
      .getOne();
    if (!user) throw new UnauthorizedException('Invalid credentials');

    // Check lockout BEFORE bcrypt — don't leak whether the password is
    // correct via a slow vs fast response. Throws 423.
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      throw new LockedException(
        `Account locked until ${user.lockoutUntil.toISOString()}. Try again later.`,
      );
    }

    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      user.failedLoginCount = (user.failedLoginCount ?? 0) + 1;
      if (user.failedLoginCount >= 5) {
        user.lockoutUntil = new Date(Date.now() + 15 * 60_000);
      }
      await this.users.save(user);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Success — reset both fields if they're nonzero / set.
    if (user.failedLoginCount > 0 || user.lockoutUntil !== null) {
      user.failedLoginCount = 0;
      user.lockoutUntil = null;
      await this.users.save(user);
    }

    return this.tokenize(user);
  }
```

- [ ] **Step 3: Run — confirm green**

```bash
cd backend && npx jest src/auth/auth.service.spec.ts 2>&1 | tail -15
```

Expected: all 7 auth.service tests pass (2 signup acceptance + 5 lockout).

- [ ] **Step 4: Run full backend suite**

```bash
cd backend && npx jest 2>&1 | tail -10
```

Expected: ≥ 64 passing (59 from B5 + 5 new lockout tests).

---

## Phase 5 — Admin unlock endpoint

### Task 5.1: Add `POST /api/admin/users/:id/unlock`

**Files:**
- Modify: `backend/src/admin/admin.controller.ts`

- [ ] **Step 1: Add `Post`, `IsNull` (if not already), `NotFoundException` to imports**

The file currently imports `Body, Controller, Get, Param, Patch, Query, UseGuards`. Add `NotFoundException` and `Post`:

```ts
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
```

- [ ] **Step 2: Add the endpoint method**

Inside the `AdminController` class (the same file), add this method. Place it at the end of the class, after the last existing method:

```ts
  @Post(':id/unlock')
  @ApiOperation({
    summary: 'Admin — clear brute-force lockout for a user',
    description:
      'Resets failedLoginCount to 0 and clears lockoutUntil. ' +
      'Allows the user to log in immediately.',
  })
  async unlock(@Param('id') id: string) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    user.failedLoginCount = 0;
    user.lockoutUntil = null;
    await this.users.save(user);
    return {
      unlocked: true,
      userId: user.id,
      at: new Date().toISOString(),
    };
  }
```

- [ ] **Step 3: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Smoke test the endpoint**

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# Need an admin token. Use the seeded admin user if available, else create one fresh
# and promote via seed:admin.
ADMIN_TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"azeema@ohzsecurity.com","password":"<admin-password>"}' \
  | grep -oE '"token":"[^"]+"' | sed 's/"token":"//; s/"$//')

# If you don't know the admin password, skip this block and only verify that
# the route is registered (it shows in the boot logs).

# Endpoint should require admin
echo -n "Unauth: "
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST http://localhost:4000/api/admin/users/some-uuid/unlock

# With admin token, hitting a fake UUID should 404
if [ -n "$ADMIN_TOKEN" ] && [ ${#ADMIN_TOKEN} -gt 20 ]; then
  echo -n "Admin + missing user: "
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:4000/api/admin/users/00000000-0000-0000-0000-000000000000/unlock \
    -H "Authorization: Bearer $ADMIN_TOKEN"
fi

pkill -f 'nest start' || true
```

Expected:
- Unauth: `401` (no JWT)
- Admin + missing user: `404`

If the admin token can't be obtained (unknown password), just verify the route appears in the boot log:

```bash
cd backend && timeout 12 npm run start:dev 2>&1 | grep "users/:id/unlock"
```

Expected: a line like `Mapped {/api/admin/users/:id/unlock, POST} route`.

---

## Phase 6 — End-to-end verification

### Task 6.1: Backend tests

```bash
cd backend && npx jest 2>&1 | tail -10
```

Expected: ≥ 64 passing.

### Task 6.2: Backend build

```bash
cd backend && npm run build 2>&1 | tail -10
```

Expected: clean.

### Task 6.3: Live lockout smoke

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# Seed a fresh user to lock out
SEED_EMAIL="b1-lockout-$(date +%s)@test.com"
SEED_USER="b1lockout$(date +%s)"
curl -s -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SEED_EMAIL\",\"username\":\"$SEED_USER\",\"password\":\"realpass123\",\"acceptedTerms\":true,\"acceptedPrivacy\":true}" > /dev/null

# 5 bad logins → expect 401 each
echo "=== 5 bad attempts ==="
for i in $(seq 1 5); do
  sleep 0.3
  curl -s -o /dev/null -w "$i: %{http_code}\n" \
    -X POST http://localhost:4000/api/auth/login \
    -H 'Content-Type: application/json' \
    -d "{\"email\":\"$SEED_EMAIL\",\"password\":\"wrong\"}"
done

# 6th attempt with correct password → expect 423 (locked)
echo "=== 6th attempt with correct password ==="
sleep 0.3
curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SEED_EMAIL\",\"password\":\"realpass123\"}"

pkill -f 'nest start' || true
```

Expected:
- Attempts 1–5: `401`
- 6th attempt: `423`

If attempts 1–5 hit `429` instead of `401`, the throttler is firing before the lockout logic — that means the throttle limit (5/min/IP) is exactly at the boundary. The `sleep 0.3` between attempts spreads them across ~1.5s; if Throttler 5/60s still triggers, lower the limit pace or pass `-H 'X-Forwarded-For: 1.2.3.X'` with different X values to simulate different IPs. The correct behavior either way is: the 6th attempt returns 423 because the account is locked.

### Task 6.4: Regression checks

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# Legal page still serves (no rate limit on GET)
echo -n "/api/legal/pages/terms: "
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/legal/pages/terms

# Signup still works with acks
SIGNUP_EMAIL="b1-regress-$(date +%s)@test.com"
SIGNUP_USER="b1reg$(date +%s)"
echo -n "Signup with acks: "
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SIGNUP_EMAIL\",\"username\":\"$SIGNUP_USER\",\"password\":\"smoketest\",\"acceptedTerms\":true,\"acceptedPrivacy\":true}"

pkill -f 'nest start' || true
```

Expected:
- `/api/legal/pages/terms`: `200`
- Signup: `201`

### Task 6.5: Frontend builds clean (A1/A2/B5 not regressed)

```bash
cd frontend && npx next build 2>&1 | tail -15
```

Expected: clean build.

---

## Verification Checklist

Before declaring B1 done:

- [ ] Backend tests pass (≥ 64 total: 59 baseline + 5 new lockout)
- [ ] Backend builds clean
- [ ] Global throttler returns 429 under burst load
- [ ] `POST /api/auth/login` is throttled to 5/min/IP
- [ ] 5 consecutive failed logins for the same account → 6th attempt with correct password returns 423
- [ ] Lockout is 15 minutes
- [ ] Successful login resets `failedLoginCount` + `lockoutUntil`
- [ ] `POST /api/admin/users/:id/unlock` clears both fields; requires admin
- [ ] Admin controllers carry `@SkipThrottle()` and remain usable under load
- [ ] Public GET endpoints (legal pages, video feed, battle detail) still serve normally
- [ ] Signup with acks still 201 (A2 regression check)
