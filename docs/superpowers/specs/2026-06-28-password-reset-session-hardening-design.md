# Password Reset Flow + Session/Token Hardening (Track B2)

**Status:** Design approved, awaiting implementation plan
**Scope:** Add a public forgot-password / reset-password flow with Gmail SMTP email delivery, bump bcrypt rounds to 12, raise password minimum length to 8, and tighten email-change to bump `tokenVersion` (defense in depth).

This is **sub-project B2** of the launch hardening effort. Independent of other B tracks.

---

## Goals

1. Allow users to recover from a forgotten password without operator intervention.
2. Don't leak whether an arbitrary email belongs to a real account (anti-enumeration).
3. Use a one-time, short-lived, cryptographically-secure reset token.
4. Send the reset link via real email (Gmail SMTP for launch; replace with transactional service later).
5. Increase password-hash work factor and password minimum length to match modern recommendations.
6. Add `tokenVersion` rotation to email change so all other sessions invalidate on the next request.

## Non-goals

- Real transactional email service (Resend/SendGrid/Mailgun) — Gmail SMTP is the launch stopgap; production-scale email moves to a separate track.
- HTML email templates — plain text only for v1.
- Refresh tokens / shortening the 30-day JWT — too risky to change for an already-deployed user base; revisit in a later track.
- Password complexity beyond minimum length (uppercase / digit / symbol requirements) — UX + accessibility tradeoff not justified at this stage.
- 2FA / TOTP — defer.
- Login throttling and account lockout — already shipped in **B1**.

---

## Architecture

### Data model

Two new columns on `User` (`backend/src/users/user.entity.ts`):

| Column | Type | Notes |
| --- | --- | --- |
| `passwordResetTokenHash` | `varchar(64)`, nullable | sha256-hex of the active token; raw token never stored |
| `passwordResetExpiresAt` | `timestamptz`, nullable | 1 hour after issuance |

Both cleared on successful reset OR overwritten by a subsequent `forgot-password` call (the most recent request invalidates any earlier outstanding token).

### `MailerService`

New module `backend/src/mailer/` containing:

- `MailerService` (`mailer.service.ts`) — wraps a single `nodemailer` transport, exposes `sendPasswordResetEmail(toEmail, resetUrl)`.
- `MailerModule` (`mailer.module.ts`) — exports `MailerService` so `AuthModule` can inject it.

Transport configuration:

```ts
nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
})
```

**Fallback behavior when Gmail credentials are unset:**

If `GMAIL_USER` is empty/unset on boot, `MailerService` doesn't construct a transport — it logs `📧 Mailer disabled (GMAIL_USER not set); using console fallback` once on init. `sendPasswordResetEmail` then writes the URL to `console.log` instead of sending. This preserves the developer workflow for anyone without Gmail credentials and acts as a graceful degradation if credentials become invalid in production.

**Plain-text email body:**

```
Subject: Reset your VOCALMATCH password
From: ${process.env.MAIL_FROM ?? `VOCALMATCH <${process.env.GMAIL_USER}>`}
To: <user's email>

Someone requested a password reset for this account.

If that was you, click here to set a new password (link expires in 1 hour):
<resetUrl>

If you didn't request this, ignore this email — your password won't change.

— VOCALMATCH
```

HTML version deferred (plain text renders in every mail client, doesn't trip spam filters as aggressively).

### Backend endpoints

**`POST /api/auth/forgot-password`** — public, throttled.

```
Body: { email: string }
Response (always): 200 { sent: true }
Throttle: { short: { limit: 1, ttl: 60_000 }, long: { limit: 5, ttl: 3_600_000 } }
```

Service flow (`AuthService.forgotPassword`):

1. Look up user by lowercase email.
2. If found:
   a. `const token = crypto.randomBytes(32).toString('hex')` — 256 bits of entropy.
   b. `const hash = crypto.createHash('sha256').update(token).digest('hex')` — 64 chars.
   c. Store `passwordResetTokenHash = hash`, `passwordResetExpiresAt = now + 1h`.
   d. Construct `resetUrl = ${process.env.FRONTEND_RESET_URL}?token=${token}` (e.g. `https://vocalmatch.com/reset-password?token=...`).
   e. `await mailerService.sendPasswordResetEmail(user.email, resetUrl)`.
3. If NOT found: no DB writes, no email send.
4. Always return `{ sent: true }`.

The 1/min/IP throttle on the endpoint prevents anyone from enumerating addresses via timing differences between "send" and "no-op."

**`POST /api/auth/reset-password`** — public, throttled.

```
Body: { token: string, newPassword: string }
Response: 200 { reset: true } on success; 400 on invalid/expired token
Throttle: { short: { limit: 5, ttl: 60_000 } }
```

`ResetPasswordDto`:
- `token`: string, required, length 64 (hex of 32 bytes).
- `newPassword`: string, `@MinLength(8)`.

Service flow (`AuthService.resetPassword`):

1. Hash the supplied token with sha256.
2. Find user where `passwordResetTokenHash === hash` AND `passwordResetExpiresAt > now()`.
3. If no match, throw `BadRequestException('Invalid or expired reset link')`.
4. `user.passwordHash = await bcrypt.hash(newPassword, 12)`.
5. Clear `passwordResetTokenHash = null`, `passwordResetExpiresAt = null`.
6. `user.tokenVersion += 1` — invalidates all existing sessions, including the actor's, forcing fresh login with the new password.
7. Save.

### Other auth hardening (no new endpoints)

- **bcrypt rounds 10 → 12.** Update three call sites:
  - `AuthService.signup` line ~58: `bcrypt.hash(dto.password, 12)`
  - `AuthService.changePassword` (existing): `bcrypt.hash(dto.newPassword, 12)`
  - `AuthService.resetPassword` (new, above): `bcrypt.hash(newPassword, 12)`
  - bcrypt verify (`bcrypt.compare`) is unchanged and works across rounds.

- **Password minimum length 6 → 8.** Update `SignupDto.password.@MinLength(6)` and `ChangePasswordDto.newPassword.@MinLength(6)`. Add the same to the new `ResetPasswordDto`.

- **Email change bumps `tokenVersion`.** In `AuthService.changeEmail`, after the email update + before `save`, add `user.tokenVersion = (user.tokenVersion ?? 0) + 1`. A new JWT is reissued in the response (existing behavior) so the caller stays signed in, but every other session is invalidated.

### `.env.example` additions

Three new lines added to the existing `.env.example`:

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

### Frontend

Two new public pages and one login-page tweak.

**`/forgot-password`** (`frontend/src/app/forgot-password/page.tsx`):

Single form. Email field + submit. After submit, the form is replaced by a static success message:

> If your email is registered, we've sent a link to reset your password. Check your inbox (and spam folder). The link expires in 1 hour.

The message renders regardless of whether the email matched a user.

**`/reset-password`** (`frontend/src/app/reset-password/page.tsx`):

Reads `token` from the URL query (`useSearchParams`). Two-field form: new password + confirm. On submit, POSTs `{ token, newPassword }` to the API. On success, redirects to `/login?reset=1`. On failure, surfaces the API error inline (e.g. "Invalid or expired reset link").

**`/login` tweak:**

Add a small "Forgot password?" link below the password field, pointing to `/forgot-password`. The login page also reads `?reset=1` and shows a success banner: *"Password reset. Sign in with your new password."*

**API client additions** (`frontend/src/lib/api.ts`):

```ts
forgotPassword: (body: { email: string }) =>
  request<{ sent: boolean }>('/auth/forgot-password', { method: 'POST', body: JSON.stringify(body) }),

resetPassword: (body: { token: string; newPassword: string }) =>
  request<{ reset: boolean }>('/auth/reset-password', { method: 'POST', body: JSON.stringify(body) }),
```

---

## Error handling

| Scenario | Behavior |
| --- | --- |
| `forgot-password` for unknown email | 200 `{ sent: true }`; no DB write, no email send |
| `forgot-password` for known email | 200 `{ sent: true }`; reset row updated; email sent (or logged if Mailer disabled) |
| `forgot-password` exceeds 1/min/IP | 429 |
| `reset-password` with expired token | 400 `Invalid or expired reset link` |
| `reset-password` with tampered/unknown token | 400 same message |
| `reset-password` with valid token but password < 8 chars | 400 from DTO validator |
| `reset-password` success | 200 `{ reset: true }`; user.tokenVersion bumped; user must re-login |
| `reset-password` exceeds 5/min/IP | 429 |
| `signup` with password < 8 chars | 400 from DTO validator (was 400 before with min 6) |
| `changePassword` with new password < 8 chars | 400 |
| `changeEmail` success | tokenVersion bumped + new JWT in response (existing behavior) |
| Mailer transport throws at send time | `forgot-password` still returns 200; error is logged (don't punish the user for our infra failure) |

## Testing

**Backend (Jest):**

- New `mailer.service.spec.ts`:
  - When `GMAIL_USER` is unset: `sendPasswordResetEmail` falls back to console (verify via `jest.spyOn(console, 'log')`).
  - When `GMAIL_USER` is set: `sendPasswordResetEmail` calls a mocked `transporter.sendMail` with the right `to`, `subject`, `text` containing the URL.

- Extend `auth.service.spec.ts`:
  - `forgotPassword` for an existing user: writes `passwordResetTokenHash` (sha256 length 64) + `passwordResetExpiresAt` ~1 hour ahead, calls `mailer.sendPasswordResetEmail`.
  - `forgotPassword` for an unknown email: returns `{ sent: true }`, NO DB writes, NO mailer call.
  - `resetPassword` with valid token: updates `passwordHash`, clears reset fields, bumps `tokenVersion`.
  - `resetPassword` with expired token: throws `BadRequestException`.
  - `resetPassword` with unknown token: throws `BadRequestException`.
  - `changeEmail` bumps `tokenVersion` (extend existing test or add a new one).

**Manual smoke:**

```bash
# 1. Signup with 6-char password (should fail under new min-length 8)
curl -X POST http://localhost:4000/api/auth/signup -H 'Content-Type: application/json' \
  -d '{"email":"<unique>@test.com","username":"<unique>","password":"sixxxx","acceptedTerms":true,"acceptedPrivacy":true}'
# Expected: 400 with message about password length

# 2. Signup with 8-char password
curl -X POST http://localhost:4000/api/auth/signup -H 'Content-Type: application/json' \
  -d '{"email":"<unique>@test.com","username":"<unique>","password":"eight888","acceptedTerms":true,"acceptedPrivacy":true}'
# Expected: 201

# 3. Forgot-password — unknown email
curl -X POST http://localhost:4000/api/auth/forgot-password -H 'Content-Type: application/json' \
  -d '{"email":"definitely-not-real@nope.com"}'
# Expected: 200 { sent: true }; NO email sent (verify by reading server log — only the "Mailer disabled" message or no log at all)

# 4. Forgot-password — real email
curl -X POST http://localhost:4000/api/auth/forgot-password -H 'Content-Type: application/json' \
  -d '{"email":"<existing user email>"}'
# Expected: 200 { sent: true }. If Gmail configured: email arrives. If not: server log line "🔐 Reset link for...".

# 5. Reset with token (use the URL from log or email)
TOKEN="<token from the URL>"
curl -X POST http://localhost:4000/api/auth/reset-password -H 'Content-Type: application/json' \
  -d "{\"token\":\"$TOKEN\",\"newPassword\":\"newpass1234\"}"
# Expected: 200 { reset: true }

# 6. Login with new password
curl -X POST http://localhost:4000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"<existing user email>","password":"newpass1234"}'
# Expected: 200 + token
```

---

## Operator setup (one-time, before deploy)

1. Create a Gmail account for transactional sends (e.g. `vocalmatch.noreply@gmail.com`).
2. Enable 2-Step Verification on the account.
3. Generate an App Password under Google Account → Security → 2-Step Verification → App passwords. Choose "Mail" / "Other".
4. Set the 16-char password in `GMAIL_APP_PASSWORD` env var; set the address in `GMAIL_USER`.
5. Set `MAIL_FROM` to `"VOCALMATCH <vocalmatch.noreply@gmail.com>"` (or similar).
6. Set `FRONTEND_RESET_URL` to the production frontend's reset path (e.g. `https://vocalmatch.com/reset-password`).

## Operational caveats

- **Gmail free-tier limit:** ~500 emails/day. Adequate for launch; revisit when daily resets approach 100/day.
- **Deliverability:** Gmail → unrelated domains can land in spam, especially without SPF/DKIM for the recipient. Acceptable for an expected-by-the-user transactional email; monitor user reports.
- **This is a stopgap.** Real transactional email service (Resend, SendGrid, Mailgun) is the proper long-term answer and should be its own track.

## Open questions

None remaining. Implementation can begin after approval and plan writing.
