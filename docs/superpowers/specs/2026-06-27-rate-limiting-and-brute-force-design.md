# Rate Limiting + Brute-Force Protection (Track B1)

**Status:** Design approved, awaiting implementation plan
**Scope:** Apply `@nestjs/throttler` with per-endpoint policies for sensitive routes; track failed login attempts on the `User` row and auto-lock after 5 consecutive failures; add an admin unlock endpoint.

This is **sub-project B1** of the launch hardening effort. Independent of all other B tracks.

---

## Goals

1. Cap traffic to public mutation endpoints with sensible per-IP rate limits.
2. Catch login brute-force at two layers: per-IP throttling (wire) AND per-account lockout (deeper).
3. Give admins a way to clear a locked account.
4. Default throttling to in-memory storage suitable for a single-instance backend, with a clear upgrade path to Redis when we go multi-instance.

## Non-goals

- Distributed (Redis-backed) throttler — defer to when we run >1 backend instance.
- Captcha / bot-challenge gate after lockout — covered by **B6**.
- Frontend lockout UX beyond the raw 423 message — operator surfaces the lock via admin; user receives the server error.
- Logging throttler / lockout events to Sentry or similar — defer.
- IP-based blocklist / allowlist for admin endpoints — defer.
- Per-account upload throttling (the per-IP cap is sufficient pre-launch).

---

## Architecture

### `@nestjs/throttler` configuration

Install `@nestjs/throttler@^5` (matches NestJS 10). Wire into `AppModule`:

```ts
ThrottlerModule.forRoot([
  { name: 'short',  ttl: 1_000,     limit: 10 },
  { name: 'medium', ttl: 60_000,    limit: 100 },
  { name: 'long',   ttl: 3_600_000, limit: 1000 },
]),
```

These are global per-IP buckets that catch general abuse: burst (`short`), sustained per-minute (`medium`), per-hour (`long`).

Register `ThrottlerGuard` globally via `APP_GUARD` so every route is throttled by default unless decorated otherwise.

### Per-endpoint overrides

Each sensitive route gets a `@Throttle({...})` decorator with stricter limits:

| Route | Decorator | Effective limit |
| --- | --- | --- |
| `POST /api/auth/signup` | `@Throttle({ short: { limit: 1, ttl: 10_000 }, long: { limit: 10, ttl: 3_600_000 } })` | 1 per 10s burst, 10/hour/IP |
| `POST /api/auth/login` | `@Throttle({ short: { limit: 5, ttl: 60_000 } })` | 5/min/IP |
| `PATCH /api/auth/password` | `@Throttle({ short: { limit: 3, ttl: 60_000 } })` | 3/min/IP |
| `PATCH /api/auth/email` | `@Throttle({ short: { limit: 3, ttl: 60_000 } })` | 3/min/IP |
| `POST /api/videos` | `@Throttle({ short: { limit: 5, ttl: 60_000 } })` | 5/min/IP |
| `POST /api/battles/:id/vote` | `@Throttle({ short: { limit: 30, ttl: 60_000 } })` | 30/min/IP |
| `POST /api/songs/:songId/challenges` | `@Throttle({ short: { limit: 5, ttl: 60_000 } })` | 5/min/IP |

Admin controllers get `@SkipThrottle()` at the class level — admin actions are guard-protected and shouldn't be throttled by these consumer-grade limits.

Read endpoints (`GET`) inherit only the global buckets — no per-route override. Burst protection at 10/sec/IP is more than enough for normal browsing.

### Account lockout

Two new columns on `User` (`backend/src/users/user.entity.ts`):

| Column | Type | Notes |
| --- | --- | --- |
| `failedLoginCount` | `int`, default `0` | Resets to 0 on successful login |
| `lockoutUntil` | `timestamptz`, nullable | When set and in the future, account is locked |

`AuthService.login(dto)` flow becomes:

1. Lookup user by email-or-username (unchanged).
2. If `user.lockoutUntil && user.lockoutUntil > new Date()`, throw `LockedException` (HTTP 423) with message `"Account locked until ${user.lockoutUntil.toISOString()}. Try again later."` — even before checking the password. Don't reveal whether the password was correct.
3. `bcrypt.compare` the password (unchanged).
4. **On success:** if `failedLoginCount > 0` or `lockoutUntil !== null`, reset both and save. Then `return this.tokenize(user)`.
5. **On failure:**
   - `user.failedLoginCount += 1`
   - If `user.failedLoginCount >= 5`, set `user.lockoutUntil = new Date(Date.now() + 15 * 60_000)`. The counter does NOT reset on lockout — it keeps incrementing if attempts continue, and another lockout cycle starts when the previous expires (because step 2 only locks if `lockoutUntil > now()`).
   - Save.
   - Throw the existing `UnauthorizedException('Invalid credentials')` (preserve current behavior so the error surface doesn't change for legitimate-typo users).

Lockout is `15 minutes`. Hard-coded; reconsider if attack patterns warrant tuning.

Throttler (IP-based) + lockout (account-based) are complementary: the throttler stops a single IP from firing 100 login attempts; the lockout stops 100 IPs from each firing 1 attempt against the same account.

### Admin unlock endpoint

New route on the existing `AdminController` (`backend/src/admin/admin.controller.ts`):

```
POST /api/admin/users/:id/unlock
```

Guarded by `JwtAuthGuard + AdminGuard` (same as the rest of the admin routes). Body: none. Logic:

1. Load user by id.
2. If not found, 404.
3. Reset `failedLoginCount = 0`, `lockoutUntil = null`, save.
4. Return `{ unlocked: true, userId, at: new Date().toISOString() }`.

No admin UI work in this track — that's a follow-up. The endpoint is callable from Swagger or curl by any admin user.

---

## Error handling

| Scenario | Behavior |
| --- | --- |
| IP exceeds short bucket (10/s) | `ThrottlerGuard` returns 429 with the default Nest payload |
| IP exceeds login override (5/min) | 429 |
| User submits 5 wrong passwords | 5th attempt returns 401; on 5th increment, `lockoutUntil` set |
| Subsequent attempt against locked account (any password) | 423 with the locked-until message |
| User unlocked by admin, then succeeds | 200 + token; counters reset |
| `POST /api/admin/users/:id/unlock` from non-admin | 403 from `AdminGuard` |
| `POST /api/admin/users/:id/unlock` on missing user | 404 |

The throttler's 429 response uses Nest's default body. We don't customize the error message — the status code is the contract; the body is operator-readable.

## Testing

**Backend (Jest, extending existing `auth.service.spec.ts`):**

- `login` with valid credentials returns the token and resets `failedLoginCount` from a nonzero value.
- `login` with invalid credentials throws `UnauthorizedException` AND increments `failedLoginCount`.
- After the 5th failed `login`, the user row has `lockoutUntil` set ~15 min in the future.
- `login` with valid credentials against a locked account (lockoutUntil in the future) throws `LockedException` BEFORE bcrypt compare.
- `login` against a user whose `lockoutUntil` is in the PAST (expired) proceeds normally.

**Backend (new spec for admin unlock):**

- `AdminController.unlock` resets both fields on a real user row.
- Hitting the endpoint without admin role returns 403 (via the existing guard).

**Manual smoke:**

```bash
# 6 bad logins should produce: 5 × 401, then 423
for i in $(seq 1 6); do
  curl -s -o /dev/null -w "Attempt $i: %{http_code}\n" \
    -X POST http://localhost:4000/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"<known-user>","password":"definitely-wrong"}'
done
```

Expected: 5 × 401, 6th → 423.

Throttler smoke (rapid-fire login from same IP):

```bash
for i in $(seq 1 8); do
  curl -s -o /dev/null -w "%{http_code} " \
    -X POST http://localhost:4000/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"a@b.com","password":"x"}'
done
echo
```

Expected: 5 attempts return 401 (or 423 if account was already locked), then 429 for the rest of the minute.

---

## Operator notes

- **Existing user rows** have `failedLoginCount = 0` and `lockoutUntil = null` by default (column defaults). Nothing to backfill.
- **Switching to Redis throttler later:** install `@nest-lab/throttler-storage-redis` or similar, pass `storage: new ThrottlerStorageRedisService(redisClient)` into `ThrottlerModule.forRoot(...)`. No application-code changes elsewhere.
- **Pre-existing test users**: the smoke command above can target any seeded user (`seed:admin` produces one).

## Open questions

None remaining. Implementation can begin after approval and plan writing.
