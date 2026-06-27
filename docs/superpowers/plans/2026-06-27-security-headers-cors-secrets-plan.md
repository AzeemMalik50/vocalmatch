# Security Headers + CORS + Secrets Hygiene (B5) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply production-grade HTTP response headers via Helmet, gate Swagger UI behind an env flag in production, tighten CORS regex allowlists to non-production only, remove the hardcoded `JWT_SECRET` fallback, and overhaul `.env.example`.

**Architecture:** Single-file changes concentrated in `backend/src/main.ts` (Helmet + boot guard + Swagger gating + CORS scoping), with one auth-side cleanup (remove the hardcoded fallback in `auth.module.ts` and `jwt.strategy.ts`). New `main.guards.ts` extracts the env assertion so it's unit-testable. New `scripts/check-secrets.sh` provides a regression check. No runtime behavior changes for existing happy-path users — only stricter rejection of malformed environments.

**Tech Stack:** NestJS 10, Helmet 7, Jest.

**Spec:** [docs/superpowers/specs/2026-06-27-security-headers-cors-secrets-design.md](../specs/2026-06-27-security-headers-cors-secrets-design.md)

---

## File Structure

### Backend (new)
- `backend/src/main.guards.ts` — exports `assertRequiredEnv(env)` boot-time assertion
- `backend/src/main.guards.spec.ts` — 3 unit tests for the assertion
- `backend/scripts/check-secrets.sh` — grep guard, runnable via `npm run check:secrets`

### Backend (modified)
- `backend/package.json` — add `helmet` dep + `check:secrets` script
- `backend/src/main.ts` — call `assertRequiredEnv`, apply Helmet, scope CORS regex by NODE_ENV, gate Swagger by `ENABLE_DOCS` in production
- `backend/src/auth/auth.module.ts` — remove the hardcoded `JWT_SECRET` fallback; read `process.env.JWT_SECRET!` directly
- `backend/src/auth/jwt.strategy.ts` — same removal
- `backend/.env.example` — full template covering every env var the code reads

---

## Phase 1 — JWT secret hardening (highest priority)

This phase first, because the hardcoded fallback is a known string in git history. Every later phase benefits from the assertion being in place.

### Task 1.1: Create `main.guards.ts` with failing test

**Files:**
- Create: `backend/src/main.guards.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/main.guards.spec.ts
import { assertRequiredEnv } from './main.guards';

describe('assertRequiredEnv', () => {
  it('throws if JWT_SECRET is unset', () => {
    expect(() => assertRequiredEnv({} as any)).toThrow(/JWT_SECRET/);
  });

  it('throws if JWT_SECRET is empty string', () => {
    expect(() =>
      assertRequiredEnv({ JWT_SECRET: '' } as any),
    ).toThrow(/JWT_SECRET/);
  });

  it('passes if JWT_SECRET is set to a non-empty value', () => {
    expect(() =>
      assertRequiredEnv({ JWT_SECRET: 'something' } as any),
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run — confirm red**

```bash
cd backend && npx jest src/main.guards.spec.ts 2>&1 | tail -10
```

Expected: failure — `Cannot find module './main.guards'`.

### Task 1.2: Implement `assertRequiredEnv`

**Files:**
- Create: `backend/src/main.guards.ts`

- [ ] **Step 1: Write the guard**

```ts
// backend/src/main.guards.ts
/**
 * Boot-time assertion that required environment variables are present.
 * Called from main.ts before NestFactory.create — failure exits the
 * process before any HTTP listener binds.
 *
 * Accepts an env object explicitly so unit tests can pass synthetic envs
 * without mutating process.env.
 */
export function assertRequiredEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (!env.JWT_SECRET) {
    throw new Error(
      'JWT_SECRET environment variable is required. Set it in your .env file or hosting environment.',
    );
  }
}
```

- [ ] **Step 2: Run — confirm green**

```bash
cd backend && npx jest src/main.guards.spec.ts 2>&1 | tail -10
```

Expected: `Tests: 3 passed, 3 total`.

### Task 1.3: Wire the guard into `main.ts` and remove hardcoded fallbacks

**Files:**
- Modify: `backend/src/main.ts`
- Modify: `backend/src/auth/auth.module.ts`
- Modify: `backend/src/auth/jwt.strategy.ts`

- [ ] **Step 1: Call the guard before Nest boot in `main.ts`**

Add this import at the top of `backend/src/main.ts`:

```ts
import { assertRequiredEnv } from './main.guards';
```

In the `bootstrap()` function, BEFORE `const app = await NestFactory.create(AppModule);`, add:

```ts
  assertRequiredEnv();
```

- [ ] **Step 2: Remove the hardcoded fallback in `auth.module.ts`**

In `backend/src/auth/auth.module.ts`, find line 14-17:

```ts
    JwtModule.register({
      secret: process.env.JWT_SECRET || '3zgdkjxV2Rz5egsadptUok25RQ1chrBuukzg0EWpUQNAekWxDU2gWP',
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '30d' },
    }),
```

Replace with:

```ts
    JwtModule.register({
      secret: process.env.JWT_SECRET!,
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '30d' },
    }),
```

The `!` is safe because `assertRequiredEnv()` runs first.

- [ ] **Step 3: Remove the hardcoded fallback in `jwt.strategy.ts`**

In `backend/src/auth/jwt.strategy.ts` (lines 25-27 of the file), find:

```ts
      secretOrKey:
        process.env.JWT_SECRET ||
        '3zgdkjxV2Rz5egsadptUok25RQ1chrBuukzg0EWpUQNAekWxDU2gWP',
```

Replace with:

```ts
      secretOrKey: process.env.JWT_SECRET!,
```

- [ ] **Step 4: Verify TypeScript + boot with JWT_SECRET set**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && timeout 25 npm run start:dev 2>&1 | grep -iE "(jwt_secret|error|started)" | head -10
```

Expected: `Nest application successfully started`. The boot guard does not fire because `JWT_SECRET` IS set in dev `.env`.

- [ ] **Step 5: Verify boot fails without JWT_SECRET**

```bash
cd backend && env -i PATH=$PATH NODE_ENV=test PORT=4099 node -e "require('./dist/main.guards').assertRequiredEnv({})" 2>&1 | head -3
```

If `dist/` doesn't exist yet:

```bash
cd backend && npm run build && env -i PATH=$PATH NODE_ENV=test PORT=4099 node -e "require('./dist/main.guards').assertRequiredEnv({})" 2>&1 | head -3
```

Expected: an error containing `JWT_SECRET environment variable is required`.

- [ ] **Step 6: Run the full backend test suite**

```bash
cd backend && npx jest 2>&1 | tail -10
```

Expected: `Tests: 59 passed, 59 total` (56 from A2 + 3 new from Phase 1).

---

## Phase 2 — Helmet middleware

### Task 2.1: Install Helmet

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install**

```bash
cd backend && npm install helmet@^7
```

Expected: installs cleanly, `helmet` appears in `dependencies`.

### Task 2.2: Apply Helmet in `main.ts`

**Files:**
- Modify: `backend/src/main.ts`

- [ ] **Step 1: Add the import**

At the top of `backend/src/main.ts`, add:

```ts
import helmet from 'helmet';
```

- [ ] **Step 2: Apply before `enableCors`**

In `bootstrap()`, AFTER `const app = await NestFactory.create(AppModule);` and BEFORE the existing `const allowedOrigins = ...` block, insert:

```ts
  // Helmet is intentionally minimal here. This server is a JSON API.
  // The frontend (Next.js on Vercel) sets its own CSP at the HTML layer;
  // enabling CSP here yields zero defensive value for JSON responses
  // and would break Swagger UI without an unsafe-inline allowance.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
      hsts: {
        maxAge: 63072000, // 2 years
        includeSubDomains: true,
        preload: true,
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      // Helmet defaults provide:
      //   X-Content-Type-Options: nosniff
      //   X-DNS-Prefetch-Control: off
      //   X-Download-Options: noopen
      //   X-Frame-Options: DENY
      //   X-Permitted-Cross-Domain-Policies: none
    }),
  );
```

- [ ] **Step 3: Verify boot + headers**

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9
curl -sI http://localhost:4000/api/legal/pages | grep -iE "(strict-transport|x-frame|x-content-type|referrer|x-dns-prefetch)"
pkill -f 'nest start' || true
```

Expected output (header order may vary):

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
X-DNS-Prefetch-Control: off
```

Note: Helmet 7's default `frameguard` is `SAMEORIGIN`, not `DENY`. That's fine for our purposes (it still rejects cross-origin framing).

- [ ] **Step 4: Backend tests still pass**

```bash
cd backend && npx jest 2>&1 | tail -10
```

Expected: 59 passing.

---

## Phase 3 — Swagger gated in production

### Task 3.1: Gate Swagger setup behind an env flag

**Files:**
- Modify: `backend/src/main.ts`

- [ ] **Step 1: Wrap the Swagger block**

In `backend/src/main.ts`, find the existing Swagger setup. It looks like:

```ts
  const swaggerConfig = new DocumentBuilder()
    .setTitle('VocalMatch API')
    .setDescription(/* ... */)
    .setVersion('0.2.0')
    .addBearerAuth(/* ... */, 'bearer')
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  const docsPath = 'api/docs';
  SwaggerModule.setup(docsPath, app, swaggerDocument, {
    swaggerOptions: { persistAuthorization: true },
  });
```

Wrap it in a conditional:

```ts
  const enableDocs =
    process.env.NODE_ENV !== 'production' ||
    process.env.ENABLE_DOCS === 'true';

  if (enableDocs) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('VocalMatch API')
      .setDescription(
        'REST endpoints and SSE streams powering the VocalMatch platform — ' +
          'auth, uploads, battles, voting, Red Phone challenges, and notifications.',
      )
      .setVersion('0.2.0')
      .addBearerAuth(
        { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        'bearer',
      )
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    const docsPath = 'api/docs';
    SwaggerModule.setup(docsPath, app, swaggerDocument, {
      swaggerOptions: { persistAuthorization: true },
    });
  }
```

This leaves `console.log('📚 API docs: …')` at the bottom — gate that too. Find:

```ts
  console.log(`📚 API docs: ${publicUrl}/${docsPath}`);
```

Replace with:

```ts
  if (enableDocs) {
    console.log(`📚 API docs: ${publicUrl}/api/docs`);
  }
```

Move the `enableDocs` definition above both the wrapped Swagger block AND the conditional `console.log` so both reference the same variable. The `docsPath` variable also moves inside the `if` — it's no longer needed at the bottom because we hardcoded `'api/docs'` in the log line (it's literal everywhere it's used).

- [ ] **Step 2: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Verify dev: docs still served**

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/docs
pkill -f 'nest start' || true
```

Expected: `200`. (Dev is `NODE_ENV=development`, so `enableDocs === true`.)

- [ ] **Step 4: Verify production-mode (with NODE_ENV=production) blocks docs**

```bash
cd backend && npm run build
lsof -ti :4099 | xargs -I {} kill {} 2>/dev/null || true
NODE_ENV=production JWT_SECRET=test-only-do-not-ship PORT=4099 ENABLE_DOCS= node dist/main.js &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4099/api/docs
kill %1 2>/dev/null || pkill -f 'node dist/main' || true
```

Expected: `404`.

- [ ] **Step 5: Verify production-mode WITH ENABLE_DOCS=true serves docs**

```bash
lsof -ti :4099 | xargs -I {} kill {} 2>/dev/null || true
NODE_ENV=production JWT_SECRET=test-only-do-not-ship PORT=4099 ENABLE_DOCS=true node dist/main.js &
sleep 6
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4099/api/docs
kill %1 2>/dev/null || pkill -f 'node dist/main' || true
```

Expected: `200`.

---

## Phase 4 — CORS allowlist scoped by NODE_ENV

### Task 4.1: Make the dev regex allowances production-blocked

**Files:**
- Modify: `backend/src/main.ts`

- [ ] **Step 1: Restructure the CORS handler**

Find the existing `app.enableCors({ origin: (origin, callback) => { ... } })` block. Replace with:

```ts
  const isProd = process.env.NODE_ENV === 'production';

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);

      if (!isProd) {
        // Dev / preview deployments: allow Vercel previews, Railway-hosted
        // Swagger UI, and local origins.
        if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) {
          return callback(null, true);
        }
        if (/^https:\/\/[a-z0-9-]+\.up\.railway\.app$/.test(origin)) {
          return callback(null, true);
        }
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
      }

      console.warn(`❌ CORS blocked: ${origin}`);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
  });
```

- [ ] **Step 2: Smoke test — dev wildcard still works**

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9
curl -s -o /dev/null -w "preview-vercel: %{http_code}\n" -H "Origin: https://my-feature-preview.vercel.app" http://localhost:4000/api/legal/pages
curl -s -o /dev/null -w "blocked-evil: %{http_code}\n" -H "Origin: https://evil.example.com" http://localhost:4000/api/legal/pages
pkill -f 'nest start' || true
```

Expected:
- `preview-vercel: 200` (dev allowance passes the wildcard)
- `blocked-evil: 500` (the callback rejection surfaces as a 500 from the Nest layer — that's CORS denial)

The second curl may return `200` if the server still RESPONDS to the request (CORS is enforced by the browser, not the server, for simple GETs). The important verification is that the warning log appears:

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9
curl -s -o /dev/null -H "Origin: https://evil.example.com" http://localhost:4000/api/legal/pages
sleep 1
pkill -f 'nest start' || true
```

Check the dev server log captured the `❌ CORS blocked: https://evil.example.com` warning line. If you can capture the log to a file, grep for it. If not, observe in the running terminal.

- [ ] **Step 3: Smoke test — prod mode rejects vercel preview wildcard**

```bash
cd backend && npm run build
lsof -ti :4099 | xargs -I {} kill {} 2>/dev/null || true
NODE_ENV=production JWT_SECRET=test-only-do-not-ship PORT=4099 FRONTEND_URL=https://vocalmatch.com node dist/main.js &
sleep 6

curl -s -o /dev/null -w "prod-listed-origin: %{http_code}\n" -H "Origin: https://vocalmatch.com" http://localhost:4099/api/legal/pages
curl -s -o /dev/null -H "Origin: https://random-preview.vercel.app" http://localhost:4099/api/legal/pages
sleep 1
kill %1 2>/dev/null || pkill -f 'node dist/main' || true
```

Expected:
- `prod-listed-origin: 200`
- Log line for the second curl: `❌ CORS blocked: https://random-preview.vercel.app`

---

## Phase 5 — `.env.example` overhaul

### Task 5.1: Replace `.env.example`

**Files:**
- Modify: `backend/.env.example`

- [ ] **Step 1: Write the full template**

Replace the entire contents of `backend/.env.example` with:

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

# CORS — comma-separated origins. In production, ONLY origins listed here
# are allowed (the dev wildcards for *.vercel.app, *.up.railway.app, and
# localhost are disabled when NODE_ENV=production).
FRONTEND_URL=http://localhost:3000

# Optional public URL the API advertises in logs (Swagger banner etc.)
PUBLIC_URL=

# Swagger UI exposure in production. Defaults off in prod; set to "true"
# to opt in. In non-production builds Swagger is always available at /api/docs.
ENABLE_DOCS=
```

- [ ] **Step 2: Verify no other env var is read**

Spot-check by grepping for `process.env.` in the backend:

```bash
grep -rn "process\.env\." backend/src --include="*.ts" | grep -oE "process\.env\.[A-Z_]+" | sort -u
```

Expected: every variable in the grep output is also in `.env.example`. If any are missing, add them. Known set we expect to see: `JWT_SECRET`, `JWT_EXPIRES_IN`, `DATABASE_URL`, `FRONTEND_URL`, `PUBLIC_URL`, `PORT`, `NODE_ENV`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `ENABLE_DOCS`.

If the grep surfaces an env var not in the template, add it to `.env.example` with an empty or sensible default value.

---

## Phase 6 — Secrets-leak grep script

### Task 6.1: Create the script

**Files:**
- Create: `backend/scripts/check-secrets.sh`

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Sanity check that no real secret values are baked into source.
# Returns nonzero if any match is found.
set -euo pipefail

PATTERN='(JWT_SECRET|api_secret|API_KEY|API_SECRET|PASSWORD|SECRET)[[:space:]]*[:=][[:space:]]*['"'"'"][^'"'"'"]{8,}['"'"'"]'

if grep -rEn "$PATTERN" backend/src 2>/dev/null; then
  echo "❌ Possible secret literal found in backend/src — move to .env"
  exit 1
fi

echo "✅ No literal-looking secrets in backend/src"
```

- [ ] **Step 2: Make it executable**

```bash
chmod +x backend/scripts/check-secrets.sh
```

- [ ] **Step 3: Run it**

```bash
cd /Users/azeemmalik/Downloads/video-vote-app && bash backend/scripts/check-secrets.sh
```

Expected: `✅ No literal-looking secrets in backend/src` (Phase 1 already removed the JWT fallback).

If the script reports a match, investigate — it may be a legitimate test fixture, in which case adjust the pattern to exclude `*.spec.ts` files.

### Task 6.2: Wire into npm scripts

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Add the script**

In `backend/package.json` `scripts` block, add (place it after `test`):

```json
"check:secrets": "bash scripts/check-secrets.sh"
```

- [ ] **Step 2: Run via npm**

```bash
cd backend && npm run check:secrets
```

Expected: `✅ No literal-looking secrets in backend/src`.

---

## Phase 7 — End-to-end verification

### Task 7.1: Full backend test suite

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && npx jest 2>&1 | tail -10
```

Expected: `Tests: 59 passed, 59 total` (56 baseline + 3 new from Phase 1).

### Task 7.2: Backend build

```bash
cd backend && npm run build 2>&1 | tail -10
```

Expected: clean.

### Task 7.3: Dev boot smoke

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# Headers present
echo "=== Helmet headers ==="
curl -sI http://localhost:4000/api/legal/pages | grep -iE "(strict-transport|x-frame|x-content-type|referrer)"

# Swagger UI available in dev
echo -n "Dev /api/docs: "
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/docs

# Public legal API still works
echo -n "/api/legal/pages: "
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/legal/pages

# Signup still works (A2 regression check)
echo -n "Signup with acks: "
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"b5-smoke-$(date +%s)@test.com\",\"username\":\"b5smoke$(date +%s)\",\"password\":\"smoketest\",\"acceptedTerms\":true,\"acceptedPrivacy\":true}"

pkill -f 'nest start' || true
```

Expected:
- All 4 Helmet headers present
- Dev `/api/docs`: `200`
- `/api/legal/pages`: `200`
- Signup: `201`

### Task 7.4: Production-mode boot smoke

```bash
cd backend && npm run build
lsof -ti :4099 | xargs -I {} kill {} 2>/dev/null || true
NODE_ENV=production JWT_SECRET=test-only-do-not-ship PORT=4099 FRONTEND_URL=https://vocalmatch.com node dist/main.js &
sleep 6

echo -n "Prod /api/docs (ENABLE_DOCS unset): "
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4099/api/docs

echo -n "Prod /api/legal/pages: "
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4099/api/legal/pages

echo "Prod Helmet headers:"
curl -sI http://localhost:4099/api/legal/pages | grep -iE "(strict-transport|x-frame|x-content-type|referrer)"

kill %1 2>/dev/null || pkill -f 'node dist/main' || true
```

Expected:
- Prod docs: `404`
- Prod legal endpoint: `200`
- Headers all present

### Task 7.5: Boot guard fires when JWT_SECRET missing

```bash
cd backend && npm run build
NODE_ENV=production JWT_SECRET= PORT=4098 node dist/main.js 2>&1 | head -5
```

Expected output includes: `JWT_SECRET environment variable is required`.

### Task 7.6: Secrets check passes

```bash
cd backend && npm run check:secrets
```

Expected: `✅ No literal-looking secrets in backend/src`.

---

## Verification Checklist

Before declaring B5 done:

- [ ] All 59 backend tests pass (56 baseline + 3 new)
- [ ] Backend builds clean
- [ ] Helmet headers present on every API response
- [ ] Dev `/api/docs` returns 200; prod `/api/docs` returns 404 (unless `ENABLE_DOCS=true`)
- [ ] Production CORS rejects non-listed origins (log line `❌ CORS blocked`)
- [ ] Production boot WITHOUT `JWT_SECRET` exits before binding the port, with the operator-readable error
- [ ] Production boot WITH `JWT_SECRET` and a listed `FRONTEND_URL` serves normally
- [ ] `.env.example` lists every env var the code reads
- [ ] `npm run check:secrets` reports no leaks
- [ ] A2 regression check passes (signup with acks → 201)
