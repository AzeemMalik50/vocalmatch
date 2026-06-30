# Security Headers, CORS Lockdown & Secrets Hygiene (Track B5)

**Status:** Design approved, awaiting implementation plan
**Scope:** Add production security response headers via Helmet, gate Swagger UI behind an env flag in production, tighten CORS regex allowlists for production builds, eliminate the hardcoded JWT secret fallback, and audit `.env` hygiene.

This is **sub-project B5** of the launch hardening effort. Lowest-risk, highest-immediate-value security win. Independent of all other B tracks.

---

## Goals

1. Send a standard set of production-grade response headers from the API (HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, etc.).
2. Stop serving Swagger UI publicly in production unless explicitly opted in.
3. Tighten CORS so the broad `*.vercel.app` / `*.up.railway.app` / `localhost` allowances apply only outside production.
4. Force the app to refuse to start in production without a `JWT_SECRET`. Remove the hardcoded fallback (which is a known string baked into git history).
5. Make `.env.example` a faithful and complete template for every env var the code reads.
6. Add a one-line secrets-leak grep so the team can sanity-check before a commit.

## Non-goals

- Rotating the live Cloudinary keys (out-of-band operator task; flagged in the spec as a follow-up).
- CSP on the Next.js frontend — that's a frontend concern, not a backend track.
- Refresh-token / token-rotation logic (B2).
- Per-endpoint rate limiting (B1).
- Audit logging (B4).
- Bot challenge / Turnstile (B6).

---

## Architecture

### Helmet middleware

Install `helmet@^7` and apply globally in [backend/src/main.ts](backend/src/main.ts) **before** `app.enableCors`. Helmet writes its headers from the response side, so order matters only relative to other middleware that also writes headers; placing it first is the conventional choice.

```ts
app.use(helmet({
  // This server is a JSON API. The frontend (Next.js on Vercel) sets its
  // own CSP at the HTML layer; enabling CSP here without unsafe-inline
  // breaks Swagger UI and yields zero defensive value for JSON responses.
  contentSecurityPolicy: false,

  // Allow embedding Cloudinary thumbnails on the frontend.
  crossOriginResourcePolicy: { policy: 'cross-origin' },

  // We don't need cross-origin isolation; turning COEP on would break
  // image embeds without measurable benefit for a JSON API.
  crossOriginEmbedderPolicy: false,

  // 2 years, with subdomains and preload list eligibility.
  hsts: {
    maxAge: 63072000,
    includeSubDomains: true,
    preload: true,
  },

  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

  // Helmet defaults supply the rest:
  // - X-Content-Type-Options: nosniff
  // - X-DNS-Prefetch-Control: off
  // - X-Download-Options: noopen
  // - X-Frame-Options: DENY (Helmet calls this `frameguard`)
  // - X-Permitted-Cross-Domain-Policies: none
}));
```

### JWT secret hardening

Two changes:

1. **Remove the hardcoded fallback** in [backend/src/auth/auth.module.ts](backend/src/auth/auth.module.ts) line 16 (`'3zgdkjxV2Rz5egsadptUok25RQ1chrBuukzg0EWpUQNAekWxDU2gWP'`) and in [backend/src/auth/jwt.strategy.ts](backend/src/auth/jwt.strategy.ts) line 26.
2. **Startup assertion** in `main.ts`, before `NestFactory.create`:

```ts
if (!process.env.JWT_SECRET) {
  throw new Error(
    'JWT_SECRET environment variable is required. Set it in your .env file or hosting environment.',
  );
}
```

Both `auth.module.ts` and `jwt.strategy.ts` then read `process.env.JWT_SECRET!` directly (the `!` is safe because of the boot assertion). Dev users must populate `.env` from `.env.example`.

### Swagger UI gated in production

In `main.ts`, gate the Swagger setup:

```ts
const enableDocs =
  process.env.NODE_ENV !== 'production' || process.env.ENABLE_DOCS === 'true';

if (enableDocs) {
  // existing SwaggerModule.createDocument + setup block
}
```

In production deploys, `ENABLE_DOCS=true` is opt-in. Operators wanting to inspect a deployed API can flip it on temporarily.

### CORS allowlist scoped by NODE_ENV

The existing CORS handler in `main.ts` runs four regex checks: explicit `FRONTEND_URL`, `*.vercel.app`, `*.up.railway.app`, `localhost`. In production we keep only the explicit `FRONTEND_URL` match plus a single Vercel-production pattern matching the actual deployed origin. The wildcards are kept for non-production builds.

Concretely, restructure the handler:

```ts
const isProd = process.env.NODE_ENV === 'production';

app.enableCors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);

    if (!isProd) {
      // Dev/preview: allow Vercel previews, Railway, and localhost.
      if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return callback(null, true);
      if (/^https:\/\/[a-z0-9-]+\.up\.railway\.app$/.test(origin)) return callback(null, true);
      if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
    }

    console.warn(`❌ CORS blocked: ${origin}`);
    callback(new Error(`Origin ${origin} not allowed by CORS`));
  },
  credentials: true,
});
```

Effect: in prod, only origins listed in `FRONTEND_URL` (comma-separated) pass.

### `.env.example` overhaul

Replace the existing partial template with the full surface the code reads:

```env
# Server
PORT=4000
NODE_ENV=development

# JWT — REQUIRED. Generate with: openssl rand -base64 48
JWT_SECRET=
JWT_EXPIRES_IN=30d

# Cloudinary (uploads)
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Database — leave empty to fall back to SQLite for local dev
DATABASE_URL=

# CORS — comma-separated origins. In production, only origins listed here
# (plus none of the dev wildcards) are allowed.
FRONTEND_URL=http://localhost:3000

# Optional public URL the API advertises in logs (Swagger banner etc.)
PUBLIC_URL=

# Swagger UI exposure in production. Defaults off in prod; set to "true"
# to opt in. In non-production builds Swagger is always available.
ENABLE_DOCS=
```

`JWT_SECRET=` is intentionally empty in the template — a leftover placeholder string is worse than empty because copy-paste deploys would silently land in production with the placeholder.

### Secrets-leak grep script

`backend/scripts/check-secrets.sh` (new), executable, single-purpose:

```sh
#!/usr/bin/env bash
# Sanity check that no real secret values are baked into source.
# Returns nonzero if any match is found.
set -euo pipefail
PATTERN='(JWT_SECRET|api_secret|API_KEY|API_SECRET|PASSWORD|SECRET)[[:space:]]*[:=][[:space:]]*['\''"][^'\''"]{8,}['\''"]'
if grep -rEn "$PATTERN" backend/src 2>/dev/null; then
  echo "❌ Possible secret literal found in backend/src — move to .env"
  exit 1
fi
echo "✅ No literal-looking secrets in backend/src"
```

Add to `backend/package.json` scripts:

```json
"check:secrets": "bash scripts/check-secrets.sh"
```

The pattern is intentionally narrow — it matches assignments of 8+ char string literals to common secret-named identifiers. It will catch the hardcoded JWT fallback that this track removes, and would catch future regressions.

---

## Error handling

| Scenario | Behavior |
| --- | --- |
| Boot with `JWT_SECRET` unset | Process exits with the operator-readable error message before Nest starts |
| Boot with `JWT_SECRET=""` (empty string) | Same as unset — the `!process.env.JWT_SECRET` check rejects both |
| Production request from unlisted origin | CORS rejects with `Origin X not allowed by CORS`; backend log captures the blocked origin |
| Production request hitting `/api/docs` without `ENABLE_DOCS=true` | Returns 404 (Swagger never mounted) |
| Helmet header set on every response | Verifiable via `curl -I` |
| `check:secrets` script catches a leaked secret | Exit nonzero, printed match |

## Testing

**Backend:**

Helmet, CORS, and Swagger gating are middleware/config — verified via integration smoke (curl). The JWT_SECRET boot guard gets a unit test because it's pure logic worth pinning. Extract it into `backend/src/main.guards.ts` so `main.ts` can call it and `main.guards.spec.ts` can test it without booting the whole app:

```ts
// backend/src/main.guards.ts
export function assertRequiredEnv(env: NodeJS.ProcessEnv = process.env) {
  if (!env.JWT_SECRET) {
    throw new Error(
      'JWT_SECRET environment variable is required. Set it in your .env file or hosting environment.',
    );
  }
}
```

```ts
// backend/src/main.guards.spec.ts
describe('assertRequiredEnv', () => {
  it('throws if JWT_SECRET is unset', () => {
    expect(() => assertRequiredEnv({} as any)).toThrow(/JWT_SECRET/);
  });
  it('throws if JWT_SECRET is empty string', () => {
    expect(() => assertRequiredEnv({ JWT_SECRET: '' } as any)).toThrow(/JWT_SECRET/);
  });
  it('passes if JWT_SECRET is set', () => {
    expect(() =>
      assertRequiredEnv({ JWT_SECRET: 'present' } as any),
    ).not.toThrow();
  });
});
```

**Manual verification:**

```bash
curl -sI http://localhost:4000/api/legal/pages | grep -iE "(strict-transport|x-frame|x-content-type|referrer)"
```

Expected: each header present.

```bash
# Production-mode boot with no JWT_SECRET should fail
NODE_ENV=production JWT_SECRET= node dist/main.js 2>&1 | head -3
```

Expected: throws and exits.

```bash
# Production-mode boot serves no Swagger
NODE_ENV=production JWT_SECRET=anything-nonempty PORT=4001 ENABLE_DOCS= node dist/main.js &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4001/api/docs
kill %1
```

Expected: 404.

```bash
# Secrets check passes after the hardcoded JWT removal
cd backend && npm run check:secrets
```

Expected: `✅ No literal-looking secrets in backend/src`.

---

## Follow-up actions (NOT part of this track — operator tasks)

- **Rotate JWT_SECRET in production.** The previous hardcoded fallback (`'3zgdkjxV2Rz5egsadptUok25RQ1chrBuukzg0EWpUQNAekWxDU2gWP'`) is in git history forever. If any prod deploy ever ran without `JWT_SECRET` set, that string was used to sign live tokens. Rotate the secret AND invalidate existing tokens (bump `User.tokenVersion` for everyone, or just accept the 30-day TTL drains naturally).
- **Audit Cloudinary credentials.** Current `.env` contains live keys. If those values were ever shared in chat/email/screenshots, rotate via the Cloudinary console.
- **Validate the `FRONTEND_URL` prod value** before the next prod deploy. After this track lands, prod will reject anything not listed.

---

## Open questions

None remaining. Implementation can begin once approved and the plan is written.
