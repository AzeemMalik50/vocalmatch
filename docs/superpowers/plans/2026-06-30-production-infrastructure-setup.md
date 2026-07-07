# Production Infrastructure Setup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **For the human running this:** Most steps here are **dashboard clicks in external services** (Cloudflare, Neon, Vercel, Railway). They are not code edits. Run each task in order — many depend on values produced by earlier tasks (DB URLs, project IDs, DNS records). Keep a scratch doc open and paste the values you generate as you go.

**Goal:** Move VOCALMATCH from the current single dev environment into three isolated environments — production (`vocalmatch.com`), QA (`qa.vocalmatch.com`), and dev (`dev.vocalmatch.com`) — each with its own Vercel frontend, Railway backend, and Neon database, with Cloudflare DNS in front.

**Architecture:**
- **DNS:** Cloudflare manages `vocalmatch.com` and all subdomains. Cloudflare orange-cloud (proxied) for `www`/apex; **grey-cloud** (DNS-only) for `api-*` and the frontend subdomains so Vercel and Railway can serve their own SSL certificates without Cloudflare interfering.
- **Frontend:** One Vercel project linked to this repo. Three Git branches (`main` → prod, `qa` → QA, `dev` → dev) each get their own custom domain via Vercel's branch-aliased domains feature. Env vars are scoped per Git branch.
- **Backend:** One Railway project with three **environments** (`production`, `qa`, `development`), each deploying a different branch. Each environment has its own env var set and a custom API domain.
- **Database:** Three separate Neon Postgres databases (one per environment) on the existing Neon project. The QA DB is bootstrapped first with `synchronize: true`; the prod schema is then created by restoring a `pg_dump --schema-only` snapshot of QA, after which prod stays locked to `synchronize: false`.
- **Auth:** Existing JWT-in-localStorage scheme has no cookie-domain concerns across subdomains — Bearer tokens travel in the Authorization header.

**Tech Stack:** Next.js 14 (Vercel), NestJS 10 + Dockerfile (Railway), TypeORM + Postgres (Neon), Cloudflare DNS, Cloudinary (media), Gmail SMTP, Cloudflare Turnstile.

---

## Assumptions — read this before starting

These are the choices baked into the plan. If any are wrong for you, **stop and tell me before executing** — they change the steps.

| Assumption | If different, do this |
|---|---|
| You own (or are about to register) `vocalmatch.com` and can change its nameservers. | If the domain lives at a registrar whose nameservers you can't change, you'll use Cloudflare as a secondary DNS provider — different Phase 3. |
| One Vercel project, three branches, branch-aliased custom domains. | If you want three separate Vercel projects for stronger isolation, you'll repeat Phase 5 three times instead of using branch-scoped env vars. |
| One Railway project with three environments — `production`, `qa`, `development`. | Same idea as above — three separate Railway projects is the alternative. |
| Git branches: `main` (prod), `qa` (QA), `dev` (dev). Current `final-mvp-launch` work is merged into `main` before this rollout begins. | Rename branches in Phase 1 to match whatever convention you actually use. |
| One Neon project, three databases on a single Postgres instance. | If you want fully isolated Neon projects per environment, create three projects in Phase 2 instead of three databases. |
| One shared Cloudinary account with per-env folders (`vocalmatch/<env>/videos`). | Three Cloudinary accounts is the harder, more isolated alternative — uses three free tiers but triples admin work. Either way, code change in Phase 6 is needed if you want per-env folders. |
| Shared `noreply.vocalmatch1@gmail.com` SMTP for now. | Move to a transactional email provider (Resend / Postmark / SES) post-launch — out of scope for this plan. |
| Schema bootstrap for prod is done by `pg_dump --schema-only` from QA after QA has been validated end-to-end. | If you want hand-written TypeORM migrations instead, insert a migration-authoring phase between Phase 2 and Phase 7. |

---

## Phase 0: Pre-flight inventory

**Goal:** Collect every credential and decision before you touch a dashboard. Trying to gather these mid-way wastes hours.

### Task 0.1: Open a scratch doc

- [ ] **Step 1: Create a private notes file** (NOT committed to git — put it in `~/Documents/vocalmatch-infra-secrets.md` or 1Password).

Headings to pre-fill:
```
Cloudflare account ID:
Domain registrar login:
Neon project ID:
  - dev DB URL:
  - qa DB URL:
  - prod DB URL:
Vercel team/project ID:
  - prod NEXT_PUBLIC_API_URL:
  - qa NEXT_PUBLIC_API_URL:
  - dev NEXT_PUBLIC_API_URL:
Railway project ID:
  - prod public domain:
  - qa public domain:
  - dev public domain:
JWT_SECRET (prod):
JWT_SECRET (qa):
JWT_SECRET (dev):
Turnstile site keys (per env):
Turnstile secret keys (per env):
Cloudinary credentials:
Gmail SMTP credentials:
```

- [ ] **Step 2: Confirm you own `vocalmatch.com`**

Check `whois vocalmatch.com` from your terminal. Confirm the registrar matches one you have a login for. If the domain isn't registered yet, register it first (Cloudflare Registrar, Namecheap, etc.) — the rest of the plan assumes you control DNS.

### Task 0.2: Lock the Git branch model

- [ ] **Step 1: Confirm `main` is the production branch** — `git log main --oneline -5` shows the work you intend to ship.

- [ ] **Step 2: Create `qa` and `dev` branches off `main`** if they don't exist.

```bash
cd /Users/azeemmalik/Downloads/video-vote-app
git fetch origin
git checkout main
git pull origin main
git checkout -b qa && git push -u origin qa
git checkout -b dev && git push -u origin dev
git checkout main
```

If `final-mvp-launch` has unmerged work meant for production, merge it to `main` first via PR before creating `qa`/`dev` — don't fork the branch model on top of unmerged work.

- [ ] **Step 3: Set branch protection rules on GitHub**

GitHub → repo → Settings → Branches → add rule for `main`:
- Require pull request before merging
- Require status checks (you can add CI checks later)
- Restrict who can push to `main`

Repeat for `qa` if you want gated QA promotions.

---

## Phase 1: Cloudinary per-environment folders (small code change)

**Goal:** Avoid dev/qa uploads polluting the production media library. Single Cloudinary account is fine; folders separate the assets.

**Files:**
- Modify: `backend/src/videos/cloudinary.service.ts`
- Modify: `backend/.env.example`

### Task 1.1: Add `CLOUDINARY_FOLDER_PREFIX` env var

- [ ] **Step 1: Read the current Cloudinary service**

Open `backend/src/videos/cloudinary.service.ts` and find the two hardcoded folder strings: `'vocalmatch/videos'` and `'vocalmatch/images'`.

- [ ] **Step 2: Replace hardcoded folders with an env-driven prefix**

Edit `backend/src/videos/cloudinary.service.ts`. At the top of the class body (after `cloudinary.config(...)`), add:

```typescript
private readonly folderPrefix =
  process.env.CLOUDINARY_FOLDER_PREFIX?.replace(/\/$/, '') || 'vocalmatch';
// `||` (not `??`) so an empty-string env var also falls back to the default.
```

Then change the upload calls to use it:
- `folder: 'vocalmatch/videos'` → `` folder: `${this.folderPrefix}/videos` ``
- `folder: 'vocalmatch/images'` → `` folder: `${this.folderPrefix}/images` ``

- [ ] **Step 3: Document the new var**

Append to `backend/.env.example`:
```
# Cloudinary folder prefix — set per environment to keep media isolated.
# Examples: vocalmatch/prod, vocalmatch/qa, vocalmatch/dev. Default: vocalmatch
CLOUDINARY_FOLDER_PREFIX=vocalmatch/dev
```

- [ ] **Step 4: Verify backend still compiles**

```bash
cd backend
npm run build
```
Expected: build succeeds, no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/videos/cloudinary.service.ts backend/.env.example
git commit -m "feat(uploads): make Cloudinary folder prefix env-driven for per-env isolation"
```

---

## Phase 2: Backend healthcheck endpoint (small code change)

**Goal:** Give Railway a stable URL to ping for liveness. Without it, Railway falls back to "did the port respond" which can keep a broken service marked healthy.

**Files:**
- Create: `backend/src/health/health.controller.ts`
- Modify: `backend/src/app.module.ts`

### Task 2.1: Add the controller

- [ ] **Step 1: Create `backend/src/health/health.controller.ts`**

```typescript
import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

// @SkipThrottle so Railway's startup-burst probes can't trip the
// global rate limit and falsely mark the container unhealthy.
@ApiTags('health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness probe — returns 200 if the process is up.' })
  check() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
```

- [ ] **Step 2: Register it in `app.module.ts`**

Open `backend/src/app.module.ts`. Add the import:
```typescript
import { HealthController } from './health/health.controller';
```
And add `HealthController` to the `controllers: [...]` array of the `@Module(...)` decorator.

- [ ] **Step 3: Verify locally**

```bash
cd backend
npm run start:dev
```
In another terminal:
```bash
curl http://localhost:4000/api/health
```
Expected: `{"status":"ok","uptime":...,"timestamp":"..."}` and HTTP 200.

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add backend/src/health/health.controller.ts backend/src/app.module.ts
git commit -m "feat(infra): add /api/health endpoint for Railway liveness checks"
```

---

## Phase 3: Frontend Vercel configuration file (small code change)

**Goal:** Lock the Vercel build to use `frontend/` as the root, set a sane region, and add a redirect from `www.vocalmatch.com` to the apex.

**Files:**
- Create: `vercel.json` (in repo root)

### Task 3.1: Add `vercel.json`

- [ ] **Step 1: Create `/Users/azeemmalik/Downloads/video-vote-app/vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "nextjs",
  "buildCommand": "cd frontend && npm run build",
  "installCommand": "cd frontend && npm install",
  "outputDirectory": "frontend/.next",
  "devCommand": "cd frontend && npm run dev"
}
```

Why each line: `framework` tells Vercel to skip detection (the repo has `backend/` as a sibling which can confuse autodetect); the `cd frontend &&` prefix lets a single root-level Vercel project still build a subdir. We'll set redirects in the Vercel dashboard later — putting them here makes them invisible to Cloudflare which adds debugging cost.

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "feat(infra): add vercel.json pinning Next.js build to frontend/ subdirectory"
```

- [ ] **Step 3: Merge code changes to all three branches**

```bash
git push origin main
git checkout qa && git merge main && git push origin qa
git checkout dev && git merge main && git push origin dev
git checkout main
```

All three branches now contain the healthcheck, Cloudinary prefix, and `vercel.json`. Subsequent Vercel/Railway builds will pick them up.

---

## Phase 4: Neon — three databases

**Goal:** One Neon project, three separate databases. Same project means shared billing, shared roles, but isolated data.

### Task 4.1: Confirm the Neon project and existing dev DB

- [ ] **Step 1: Log in to https://console.neon.tech**

- [ ] **Step 2: Note the project ID** — the project that currently owns `vocal-match-dev` (the DB string is in your local `backend/.env`).

Paste the project ID into your scratch doc.

### Task 4.2: Create the QA database

- [ ] **Step 1: In the Neon console**, open the project → **Databases** tab → **New Database**.
- [ ] **Step 2: Name it `vocal-match-qa`**. Owner: `neondb_owner` (or whichever role the dev DB uses).
- [ ] **Step 3: Copy the pooled connection string** (the one labeled "Pooled" — it routes through PgBouncer and is what production should always use). It will look like:
  `postgresql://neondb_owner:***@ep-xxx-pooler.us-east-1.aws.neon.tech/vocal-match-qa?sslmode=require&channel_binding=require`
- [ ] **Step 4: Paste into scratch doc** under `qa DB URL`.

### Task 4.3: Create the prod database

- [ ] **Step 1: Repeat Task 4.2** but name it `vocal-match-prod`.
- [ ] **Step 2: Copy the pooled connection string** and paste under `prod DB URL`.
- [ ] **Step 3: Verify isolation**: in the Neon SQL editor, connect to `vocal-match-prod` and run `\dt`. Expected: zero tables. The prod DB is intentionally empty until Phase 9 schema bootstrap.

### Task 4.4: (Optional) Enable Neon point-in-time recovery for prod

- [ ] **Step 1: In the Neon console** → project → **Settings** → **History retention**. Set retention to at least 7 days for the prod branch. Free tier supports this.

---

## Phase 5: Cloudflare DNS setup

**Goal:** Point `vocalmatch.com` and the subdomains at Cloudflare. Add **placeholder** records for `vercel-dns` and Railway — we'll get the actual targets in Phases 6 and 7 and come back to update them.

### Task 5.1: Add the site to Cloudflare

- [ ] **Step 1: Log in to https://dash.cloudflare.com** → **Add a site** → enter `vocalmatch.com` → choose **Free** plan.
- [ ] **Step 2: Cloudflare scans current DNS records.** Review them; leave anything you intentionally have (e.g., MX records for email). If you've never set DNS before, the list will be empty or registrar defaults.
- [ ] **Step 3: Cloudflare shows two assigned nameservers** (e.g., `arya.ns.cloudflare.com`, `bert.ns.cloudflare.com`).

Paste them into your scratch doc.

### Task 5.2: Change nameservers at the registrar

- [ ] **Step 1: Log in to your domain registrar** (where you bought `vocalmatch.com`).
- [ ] **Step 2: Replace the existing nameservers with Cloudflare's two values.**
- [ ] **Step 3: Wait for propagation.** Cloudflare emails you when activation completes — usually 5 minutes to 24 hours. Check status with:
  ```bash
  dig NS vocalmatch.com +short
  ```
  Expected (eventually): the two Cloudflare nameservers.

**Do not proceed past Task 5.2 until Cloudflare confirms the site is "Active".**

### Task 5.3: Enable SSL/TLS — Full (strict)

- [ ] **Step 1: In Cloudflare dashboard for `vocalmatch.com`**, go to **SSL/TLS → Overview**.
- [ ] **Step 2: Set encryption mode to "Full (strict)".**

Why: Vercel and Railway both serve valid public certificates on their endpoints. "Full (strict)" forces Cloudflare to verify their certs, blocking MITM. Anything weaker is a downgrade.

- [ ] **Step 3: SSL/TLS → Edge Certificates → enable "Always Use HTTPS"** and **"Automatic HTTPS Rewrites"**.

### Task 5.4: Add placeholder DNS records (we'll fix targets in later phases)

Open **DNS → Records** in Cloudflare. Add the records below. Use placeholders (`192.0.2.1` for A, `placeholder.example.com` for CNAME) where Vercel/Railway hasn't given you a target yet — we update them in Phases 6 and 7.

| Type | Name | Content | Proxy status | Notes |
|---|---|---|---|---|
| A | `@` | `192.0.2.1` (placeholder) | DNS only (grey) | Vercel will give the real value in Phase 6 |
| CNAME | `www` | `cname.vercel-dns.com.` | Proxied (orange) is OK | Or set up as redirect in Phase 6 |
| CNAME | `qa` | `cname.vercel-dns.com.` | **DNS only (grey)** | Vercel SSL needs grey-cloud |
| CNAME | `dev` | `cname.vercel-dns.com.` | **DNS only (grey)** | Vercel SSL needs grey-cloud |
| CNAME | `api` | `placeholder.up.railway.app.` | **DNS only (grey)** | Updated in Phase 7 |
| CNAME | `api-qa` | `placeholder.up.railway.app.` | **DNS only (grey)** | Updated in Phase 7 |
| CNAME | `api-dev` | `placeholder.up.railway.app.` | **DNS only (grey)** | Updated in Phase 7 |

- [ ] **Step 1: Add each row** via Cloudflare DNS → Add record.

**Critical:** Toggle the proxy status to **DNS only** (grey cloud) on every Vercel and Railway record. Cloudflare orange-cloud on top of Vercel/Railway breaks their SSL issuance and routing. Apex `vocalmatch.com` and `www` can be orange-clouded if you want Cloudflare caching/WAF on those, but the simpler choice is grey-cloud everywhere until launch is stable, then turn on the cloud later.

---

## Phase 6: Vercel — single project, three branch-aliased domains

**Goal:** Set up one Vercel project linked to the GitHub repo. Map each branch to a public domain. Configure env vars per branch.

### Task 6.1: Create the Vercel project

- [ ] **Step 1: Log in to https://vercel.com** → **Add New → Project**.
- [ ] **Step 2: Import the GitHub repo** for `video-vote-app`. Vercel will detect `vercel.json` and use `frontend/` as the build root.
- [ ] **Step 3: Configure project**:
  - Framework Preset: Next.js (auto)
  - Root Directory: leave as repo root (the `vercel.json` `buildCommand` handles `cd frontend`)
  - Production Branch: `main`
- [ ] **Step 4: Skip env vars for now — click Deploy.** First deploy will likely build but fail at runtime because env vars aren't set. That's expected.
- [ ] **Step 5: Note the project ID and team slug.** Paste into scratch doc.

### Task 6.2: Add per-branch env vars

For each variable below, go to **Project → Settings → Environment Variables → Add New**, then:
1. Enter the variable name.
2. Enter the value.
3. Under **Environment**, select **Preview**, and under **Branch** type the specific branch name (`qa` or `dev`). For production, select **Production** (no branch field needed).

| Variable | Production (`main`) | Preview/`qa` | Preview/`dev` |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.vocalmatch.com/api` | `https://api-qa.vocalmatch.com/api` | `https://api-dev.vocalmatch.com/api` |
| `NEXT_PUBLIC_SITE_URL` | `https://vocalmatch.com` | `https://qa.vocalmatch.com` | `https://dev.vocalmatch.com` |
| `NEXT_PUBLIC_FRONTEND_URL` | `https://vocalmatch.com` | `https://qa.vocalmatch.com` | `https://dev.vocalmatch.com` |

- [ ] **Step 1: Add all three vars × three environments = 9 entries.**

- [ ] **Step 2: Trigger a redeploy for each branch.** Either push an empty commit to each, or in the Vercel **Deployments** tab → find the latest deploy for that branch → ⋯ menu → Redeploy.

### Task 6.3: Attach custom domains

- [ ] **Step 1: Project → Settings → Domains → Add Domain**.
- [ ] **Step 2: Add `vocalmatch.com`** — Vercel assigns it to the production branch automatically. It will display the required A record (typically `76.76.21.21`).
- [ ] **Step 3: Update the Cloudflare DNS A record for `@`** with the value Vercel gives you. Keep proxy as **DNS only**.
- [ ] **Step 4: Add `www.vocalmatch.com`** — Vercel will offer to set it up as a 308 redirect to the apex. Accept that. Update the Cloudflare CNAME if Vercel asks for a different target than `cname.vercel-dns.com.`.
- [ ] **Step 5: Add `qa.vocalmatch.com`** — when prompted, set **Git Branch** to `qa`. Vercel will give you a CNAME target. Update Cloudflare's `qa` record to match.
- [ ] **Step 6: Add `dev.vocalmatch.com`** — Git Branch `dev`. Update Cloudflare's `dev` record.
- [ ] **Step 7: Wait for SSL issuance** — Vercel polls DNS and issues a Let's Encrypt cert automatically. Each domain shows a green "Valid configuration" check when ready (usually <5 min once DNS is correct).

### Task 6.4: Verify frontend deploys

- [ ] **Step 1: Open each URL in an incognito window:**
  - https://vocalmatch.com
  - https://qa.vocalmatch.com
  - https://dev.vocalmatch.com

Each should serve the Next.js app. They will currently fail at any API call because the backend isn't deployed yet — that's the next phase. Just confirm the page itself loads and SSL is valid (green padlock).

- [ ] **Step 2: View page source on each** and confirm the API URL embedded in the build matches the per-branch env var (search for `api.vocalmatch.com`, `api-qa.vocalmatch.com`, `api-dev.vocalmatch.com` respectively).

If the wrong API URL is embedded, the branch-scoped env var didn't apply. Recheck the env var's Branch field in Vercel and redeploy.

---

## Phase 7: Railway — one project, three environments

**Goal:** Set up Railway to build the existing `backend/Dockerfile` once per environment. Each environment gets its own env var set, its own deploy branch, and its own custom API domain.

### Task 7.1: Create the Railway project

- [ ] **Step 1: Log in to https://railway.app** → **New Project → Deploy from GitHub repo**.
- [ ] **Step 2: Select the `video-vote-app` repo.**
- [ ] **Step 3: When Railway asks which path**, set **Root Directory** to `backend`. Railway will detect the `Dockerfile`.
- [ ] **Step 4: Configure the service:**
  - Build: Dockerfile (auto-detected)
  - Start Command: leave blank (Dockerfile `CMD` handles it)
  - **Healthcheck Path:** `/api/health`
  - **Healthcheck Timeout:** 30 seconds
- [ ] **Step 5: Set the default environment's branch to `main`.** This is the `production` environment.

### Task 7.2: Create QA and dev environments

Railway environments share the same project but have independent env var sets and deploy from different branches.

- [ ] **Step 1: Top-right dropdown → New Environment → Name: `qa`** → Source: duplicate from `production` (this copies the service config but you'll override env vars next).
- [ ] **Step 2: In the `qa` environment**, open the service → **Settings → Source** → change **Branch** to `qa`. Disable "Wait for CI" if you have no CI yet.
- [ ] **Step 3: Repeat for `development`** → Branch: `dev`.

### Task 7.3: Set env vars per environment

For each environment (`production`, `qa`, `development`), open the service → **Variables** and add the following. **`JWT_SECRET` must be a freshly-generated value per environment** — never share secrets across environments.

Generate three secrets first:
```bash
echo "PROD JWT_SECRET: $(openssl rand -base64 48)"
echo "QA   JWT_SECRET: $(openssl rand -base64 48)"
echo "DEV  JWT_SECRET: $(openssl rand -base64 48)"
```
Paste them into your scratch doc.

#### Production environment variables

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `4000` (Railway provides this; explicit is fine) |
| `JWT_SECRET` | (prod value from openssl above) |
| `JWT_EXPIRES_IN` | `30d` |
| `DATABASE_URL` | (prod Neon pooled URL from Task 4.3) |
| `FRONTEND_URL` | `https://vocalmatch.com,https://www.vocalmatch.com` |
| `PUBLIC_URL` | `https://api.vocalmatch.com` |
| `ENABLE_DOCS` | `false` |
| `CLOUDINARY_CLOUD_NAME` | (existing value) |
| `CLOUDINARY_API_KEY` | (existing value) |
| `CLOUDINARY_API_SECRET` | (existing value) |
| `CLOUDINARY_FOLDER_PREFIX` | `vocalmatch/prod` |
| `GMAIL_USER` | (existing) |
| `GMAIL_APP_PASSWORD` | (existing) |
| `MAIL_FROM` | `VOCALMATCH <noreply.vocalmatch1@gmail.com>` |
| `FRONTEND_RESET_URL` | `https://vocalmatch.com/reset-password` |
| `TURNSTILE_SITE_KEY` | (prod site key from Cloudflare Turnstile dashboard — generate a new widget for `vocalmatch.com`) |
| `TURNSTILE_SECRET_KEY` | (matching prod secret) |

#### QA environment variables

Same shape, with these differences:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` (yes — we want prod-like behavior in QA; the only thing this changes is TypeORM `synchronize` which we'll override below in Phase 9 for the bootstrap) |
| `JWT_SECRET` | (qa value) |
| `DATABASE_URL` | (qa Neon URL from Task 4.2) |
| `FRONTEND_URL` | `https://qa.vocalmatch.com` |
| `PUBLIC_URL` | `https://api-qa.vocalmatch.com` |
| `ENABLE_DOCS` | `true` (QA gets Swagger) |
| `CLOUDINARY_FOLDER_PREFIX` | `vocalmatch/qa` |
| `FRONTEND_RESET_URL` | `https://qa.vocalmatch.com/reset-password` |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Separate Turnstile widget for `qa.vocalmatch.com` |

#### Development environment variables

Same as QA but with `dev` substituted for `qa` everywhere, and:

| Variable | Value |
|---|---|
| `NODE_ENV` | `development` (lets TypeORM `synchronize: true` keep schema in sync as you iterate) |
| `JWT_SECRET` | (dev value) |
| `DATABASE_URL` | (dev Neon URL — the existing `vocal-match-dev`) |
| `FRONTEND_URL` | `https://dev.vocalmatch.com` |
| `PUBLIC_URL` | `https://api-dev.vocalmatch.com` |
| `CLOUDINARY_FOLDER_PREFIX` | `vocalmatch/dev` |

- [ ] **Step 1: Fill all three env var sets.** Triple-check `DATABASE_URL` and `JWT_SECRET` — wrong values here are the #1 source of post-launch incidents.

### Task 7.4: Trigger first deploy for each environment

- [ ] **Step 1: In each environment**, click **Deploy** (or push an empty commit to the corresponding branch):
  ```bash
  git checkout main && git commit --allow-empty -m "chore: trigger initial Railway deploy" && git push
  git checkout qa   && git commit --allow-empty -m "chore: trigger initial Railway deploy" && git push
  git checkout dev  && git commit --allow-empty -m "chore: trigger initial Railway deploy" && git push
  git checkout main
  ```
- [ ] **Step 2: Watch each deploy log.**
  - **QA and dev should deploy successfully** — the QA DB will be empty but `synchronize: true` (in dev) or our bootstrap (Phase 9, for QA) creates the schema.
  - **Production will deploy but `/api/health` will return 200 while every real query 500s** because the prod DB is empty. That's the expected pre-bootstrap state.
- [ ] **Step 3: For QA**, since we set `NODE_ENV=production` but need the schema to bootstrap, temporarily change `NODE_ENV` to `development` for QA's first deploy, let it build the schema, then change it back to `production` and redeploy. (Or use the alternate approach in Phase 9 — your choice.)

### Task 7.5: Attach Railway custom domains

- [ ] **Step 1: In each environment**, open the service → **Settings → Networking → Custom Domain**.
- [ ] **Step 2: Production**: add `api.vocalmatch.com`. Railway returns a CNAME target (e.g., `xxxxx.up.railway.app`).
- [ ] **Step 3: Update Cloudflare DNS** — change the `api` CNAME content to Railway's target. Keep proxy **DNS only**.
- [ ] **Step 4: Wait for Railway to verify DNS** — green check appears within a few minutes. SSL is auto-issued.
- [ ] **Step 5: Repeat for `api-qa.vocalmatch.com`** (qa environment) and `api-dev.vocalmatch.com` (development environment).

### Task 7.6: Smoke-test each API

- [ ] **Step 1: From your terminal:**
  ```bash
  curl -sS https://api.vocalmatch.com/api/health
  curl -sS https://api-qa.vocalmatch.com/api/health
  curl -sS https://api-dev.vocalmatch.com/api/health
  ```
  Expected for all three: HTTP 200 JSON `{"status":"ok",...}`.

- [ ] **Step 2: Verify CORS:**
  ```bash
  curl -i -X OPTIONS https://api.vocalmatch.com/api/health \
    -H "Origin: https://vocalmatch.com" \
    -H "Access-Control-Request-Method: GET"
  ```
  Expected: HTTP 204 with `Access-Control-Allow-Origin: https://vocalmatch.com` in the response headers.

  Repeat for qa/dev pairings. If you get `403` or no `Access-Control-Allow-Origin` header, the `FRONTEND_URL` env var in Railway doesn't include the calling origin — fix it and redeploy.

---

## Phase 8: Cloudflare Turnstile per-environment widgets

**Goal:** Each environment gets its own Turnstile widget so blocked challenges don't poison the others' analytics, and revoking a key is environment-scoped.

### Task 8.1: Create three widgets

- [ ] **Step 1: https://dash.cloudflare.com → Turnstile → Add Site.**
- [ ] **Step 2: Widget 1**: name `vocalmatch-prod`, domain `vocalmatch.com,www.vocalmatch.com`, widget mode "Managed". Copy site key + secret.
- [ ] **Step 3: Widget 2**: name `vocalmatch-qa`, domain `qa.vocalmatch.com`. Copy keys.
- [ ] **Step 4: Widget 3**: name `vocalmatch-dev`, domain `dev.vocalmatch.com`. Copy keys.

### Task 8.2: Replace the placeholder Turnstile env vars in Railway

- [ ] **Step 1: Update `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in each Railway environment** with the matching pair from Task 8.1.
- [ ] **Step 2: Trigger a redeploy** in each environment so the new keys take effect.

### Task 8.3: Verify Turnstile in browser

- [ ] **Step 1: Open https://dev.vocalmatch.com/signup in an incognito window.**
- [ ] **Step 2: Confirm the Turnstile widget renders** and a checkmark appears. Submit signup — should succeed.
- [ ] **Step 3: Repeat for `qa.vocalmatch.com/signup` and `vocalmatch.com/signup`.**

---

## Phase 9: Prod database schema bootstrap

**Goal:** Get the schema into the empty prod DB without enabling `synchronize: true` on production. This is a one-time operation done after QA is fully validated.

### Task 9.1: Validate QA schema

- [ ] **Step 1: Smoke-test QA end-to-end** by going through the user flows you care about on `https://qa.vocalmatch.com`: signup, login, upload a video, create a battle, vote. Fix any bugs that surface; merge fixes to `qa` and redeploy until QA is green.

- [ ] **Step 2: Connect to QA DB and confirm tables exist:**

```bash
# Use the QA DATABASE_URL from your scratch doc.
psql "<QA_DATABASE_URL>" -c "\dt"
```

Expected: ~11 tables (`user`, `video`, `video_view`, `song`, `battle`, `vote`, `challenge_submission`, `notification`, `legal_page`, `legal_page_version`, `admin_audit_log`).

### Task 9.2: Dump QA schema (no data)

- [ ] **Step 1: From your local machine** (psql/pg_dump 16+ recommended — Neon runs Postgres 16):

```bash
pg_dump "<QA_DATABASE_URL>" \
  --schema-only \
  --no-owner \
  --no-acl \
  --file=/tmp/vocalmatch-prod-bootstrap.sql
```

`--no-owner` and `--no-acl` strip role grants so the file applies cleanly to the prod role.

- [ ] **Step 2: Review the dump:**

```bash
grep -c "CREATE TABLE" /tmp/vocalmatch-prod-bootstrap.sql
```

Expected: ≥ 11. If the count is zero, `pg_dump` failed silently — usually means the URL is wrong or the role lacks read perms.

### Task 9.3: Apply schema to prod

- [ ] **Step 1: Confirm prod DB is empty** (last check before destructive write):

```bash
psql "<PROD_DATABASE_URL>" -c "\dt"
```

Expected: `Did not find any relations.` If you see tables, **stop** — someone already bootstrapped, and you'd be conflicting.

- [ ] **Step 2: Apply the dump:**

```bash
psql "<PROD_DATABASE_URL>" --file=/tmp/vocalmatch-prod-bootstrap.sql
```

Watch for errors. Some `CREATE INDEX CONCURRENTLY` lines may warn — those are fine. Hard errors mean stop and investigate.

- [ ] **Step 3: Verify prod tables exist and are empty:**

```bash
psql "<PROD_DATABASE_URL>" -c "\dt"
psql "<PROD_DATABASE_URL>" -c "SELECT COUNT(*) FROM \"user\";"
```

Expected: all tables present, all counts are 0.

- [ ] **Step 4: Delete the dump file:**

```bash
rm /tmp/vocalmatch-prod-bootstrap.sql
```

The dump contains no row data, but disposing of it removes any future accidental re-apply.

### Task 9.4: Seed any required reference data

If your app needs seed rows (legal pages, an initial admin user, default song catalog), insert them now via direct SQL or by hitting admin endpoints with a freshly-created admin account. **Do not skip this** — first-time signups should not be greeted by missing legal pages or an empty song list.

- [ ] **Step 1: Create the first admin user** via the production signup flow, then promote them in the DB:

```bash
psql "<PROD_DATABASE_URL>" -c "UPDATE \"user\" SET role='admin' WHERE email='<your-admin-email>';"
```

- [ ] **Step 2: Seed legal pages** by logging into `https://vocalmatch.com/admin/legal` as the admin and creating Terms, Privacy, and Cookie pages (or via the admin API if you have an import script).

---

## Phase 10: End-to-end production validation

**Goal:** Walk every critical user path on production while watching logs in both Vercel and Railway. Any 5xx or unexpected behavior gets fixed before announcing launch.

### Task 10.1: Watch the logs

- [ ] **Step 1: Open three tabs:**
  - Vercel → project → Deployments → latest production → **Runtime Logs**
  - Railway → production environment → service → **Logs**
  - Cloudflare → vocalmatch.com → Analytics & Logs → **HTTP Traffic**

Keep all three visible during Task 10.2.

### Task 10.2: Run the production smoke flow

In an incognito window on `https://vocalmatch.com`:

- [ ] **Step 1: Sign up** with a real email address. Complete Turnstile. Expected: account created, you land on the home page logged in.
- [ ] **Step 2: Check the email inbox** — confirmation email arrived (if you have one configured).
- [ ] **Step 3: Upload a video** following the normal performance flow. Expected: video lands in `vocalmatch/prod/videos/` in Cloudinary (verify in Cloudinary console).
- [ ] **Step 4: View the video in the feed.** Expected: thumbnail loads, video plays.
- [ ] **Step 5: Create a battle** (if you have an admin account) or vote on an existing battle. Expected: vote count increments.
- [ ] **Step 6: Log out and log back in.** Expected: session persists across reload.
- [ ] **Step 7: Trigger a password reset.** Expected: reset email arrives with a link pointing at `https://vocalmatch.com/reset-password?token=...`.
- [ ] **Step 8: Open browser DevTools → Network tab** during the above. Confirm every XHR request goes to `https://api.vocalmatch.com/api/...` and returns 200 with `Access-Control-Allow-Origin: https://vocalmatch.com`. No CORS errors in console.

### Task 10.3: Stress the boundaries

- [ ] **Step 1: Hit the API directly with the wrong origin:**
  ```bash
  curl -i -X OPTIONS https://api.vocalmatch.com/api/health \
    -H "Origin: https://evil.example.com" \
    -H "Access-Control-Request-Method: GET"
  ```
  Expected: HTTP 500 or no `Access-Control-Allow-Origin` header — the request must be CORS-rejected.

- [ ] **Step 2: Confirm Swagger is OFF in production:**
  ```bash
  curl -i https://api.vocalmatch.com/api/docs
  ```
  Expected: HTTP 404. If you see Swagger UI, `ENABLE_DOCS=true` was set in prod by mistake — fix it.

- [ ] **Step 3: Confirm HSTS is set:**
  ```bash
  curl -sI https://vocalmatch.com | grep -i strict-transport
  curl -sI https://api.vocalmatch.com | grep -i strict-transport
  ```
  Expected: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` on both.

- [ ] **Step 4: Confirm HTTP redirects to HTTPS:**
  ```bash
  curl -sI http://vocalmatch.com | grep -i location
  ```
  Expected: `Location: https://vocalmatch.com/` and a 301/308.

- [ ] **Step 5: Confirm www redirects to apex:**
  ```bash
  curl -sIL https://www.vocalmatch.com | grep -i location
  ```
  Expected: redirect to `https://vocalmatch.com/`.

### Task 10.4: Validate database isolation

- [ ] **Step 1: Create a test user on `dev.vocalmatch.com` with a unique email** (e.g., `iso-test+dev@yourdomain.com`).
- [ ] **Step 2: Try to log in with that email on `vocalmatch.com`.** Expected: login fails, user not found. Confirms dev DB is not leaking into prod.
- [ ] **Step 3: Repeat with a `qa.vocalmatch.com` user** trying to log in on `vocalmatch.com`. Expected: same failure.

### Task 10.5: Confirm rollback works

- [ ] **Step 1: In Vercel deployments**, find the previous production deploy → ⋯ → **Promote to Production**. Confirm `vocalmatch.com` rolls back instantly.
- [ ] **Step 2: Roll forward** by promoting the latest deploy again.
- [ ] **Step 3: In Railway → production → Deployments**, click an earlier deploy → **Redeploy**. Confirm the API rolls back. Then redeploy the latest.

Rehearsing rollback once now means you've done it before the night it matters.

---

## Phase 11: Post-launch hygiene

These are quick wins to run after the first stable hour in production.

- [ ] **Step 1: Rotate the dev `JWT_SECRET` you've been using locally** — it's been in `.env` for months. Generate a fresh one for both your local machine and the Railway `development` environment.

- [ ] **Step 2: Restrict the Neon prod DB role** to only what NestJS needs. In Neon SQL editor on the prod DB:
  ```sql
  REVOKE CREATE ON SCHEMA public FROM neondb_owner;
  GRANT USAGE ON SCHEMA public TO neondb_owner;
  -- Re-grant CREATE only when running migrations.
  ```
  (Skip this if you're about to add a migrations runner — it'll need CREATE.)

- [ ] **Step 3: Enable Vercel and Railway log drains** to a long-term store (Logtail, Axiom, Better Stack) so you can search post-mortem. Free tiers exist.

- [ ] **Step 4: Add status page monitoring** for `vocalmatch.com` and `api.vocalmatch.com` — Better Stack / UptimeRobot / Cloudflare Health Checks. Configure alerting to your phone.

- [ ] **Step 5: Write a 5-line runbook** in `docs/runbooks/incident-response.md` answering: how do I roll back? where are the logs? who do I call? This is the doc you read at 3 AM.

---

## Done condition

All of these are true:

- [ ] `https://vocalmatch.com`, `https://qa.vocalmatch.com`, `https://dev.vocalmatch.com` all serve the Next.js app with valid SSL.
- [ ] `https://api.vocalmatch.com/api/health`, `https://api-qa.vocalmatch.com/api/health`, `https://api-dev.vocalmatch.com/api/health` all return 200.
- [ ] Each frontend calls only its matching backend (verified in DevTools Network tab).
- [ ] A real user can sign up, upload, vote, and reset password on production end-to-end.
- [ ] Production DB has the full schema and seed data; tables are populated by real user actions, not from dev or QA.
- [ ] Swagger is disabled in production; HSTS is set on both apex and api domains; HTTP → HTTPS redirect works; www → apex redirect works.
- [ ] You have rolled back at least one production deploy and rolled it forward again in rehearsal.
- [ ] Secrets — `JWT_SECRET`, `DATABASE_URL`, `TURNSTILE_SECRET_KEY` — are distinct per environment.

---

## Notes for the executor

- **Do not skip Phase 9 validation.** Empty prod DB + first-time signup = data loss when you discover a missing column. The pg_dump path is short but mandatory.
- **Cloudflare proxy (orange cloud) on API or Vercel subdomains breaks SSL issuance.** If you ever see "certificate pending" stuck for >15 min in Vercel/Railway, the first thing to check is whether the record is orange-clouded.
- **Branch-scoped env vars in Vercel apply at build time, not request time.** If you change a `NEXT_PUBLIC_*` var, you must redeploy the branch — the running deploy doesn't pick it up.
- **Railway sets `PORT` automatically.** Our `main.ts` reads `process.env.PORT ?? 4000`, so leaving the env var unset (or matching Railway's value) is fine.
- **The current dev Neon DB is being reused as `vocal-match-dev`.** If you'd rather start clean, create a new DB in Task 4.2 and update the dev env var.
