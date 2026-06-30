# VOCALMATCH — Launch Plan

Prepared: 2026-06-16
Scope: Cutover from `phase3-a` branch + local dev environment to a hardened public launch on a custom domain, with `prod` and `dev` environments fully isolated.

Companion to:
- [`APP_FLOW.md`](./APP_FLOW.md) — end-to-end user journeys
- [`ERD.md`](./ERD.md) — database schema
- [`TRD.md`](./TRD.md) — architectural overview

---

## 1. Goals + non-goals

**Goals**
- Public production URL on a custom domain with TLS, HSTS, CSP, and DDoS protection.
- A separate, identical `dev` environment so the team can verify changes against a non-prod stack before promotion.
- Auto-deploy from the right branches; preview deploys on PRs; one-click rollback.
- Observability good enough that the team finds out about an outage from a tool, not a user.
- Run the launch on a single backend instance for now; document the upgrade path (Redis pub/sub) for when traffic outgrows it.

**Non-goals (deferred past launch)**
- Multi-region backends.
- Email notifications (still UI-only per `APP_FLOW.md` §14).
- Mobile native apps.
- Songwriter portal (Phase 2C+).

---

## 2. URL topology — three environments

| Surface | Production | Staging / Dev | Vercel preview (per-PR) |
|---|---|---|---|
| Frontend (Next.js) | `vocalmatch.com` (apex) + `www.vocalmatch.com` (308 → apex) | `dev.vocalmatch.com` | `vocalmatch-<branch>-<team>.vercel.app` (auto) |
| API (NestJS) | `api.vocalmatch.com` | `api-dev.vocalmatch.com` | Reuse `api-dev.vocalmatch.com` |
| Database | `vocalmatch-prod` (Neon branch) | `vocalmatch-dev` (Neon branch) | `vocalmatch-dev` (shared) |
| Cloudinary folder prefix | `vocalmatch/prod/*` | `vocalmatch/dev/*` | `vocalmatch/dev/*` |
| Status page (optional) | `status.vocalmatch.com` | — | — |

Both backends sit behind their own subdomain so we never bake the Vercel host into the API URL or vice versa.

---

## 3. Hosting choices

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Vercel** (Pro tier) | `next/font` already wired, instant rollback, branch previews, edge network — what the codebase is built for. |
| Backend | **Render** Web Service (Standard $25/mo) **or Railway** (your existing CORS regex suggests prior Railway testing — fine to stay). | The NestJS app needs a persistent Node process for the 1-minute `BattlesScheduler` and long-lived `/api/stream` SSE connections. Vercel Functions cap at 300s and don't fit. |
| Database | **Neon Postgres** (Launch $19/mo) | Branchable per env, point-in-time restore, fits TypeORM, drop-in `DATABASE_URL`. |
| Media | **Cloudinary** (Plus $99/mo at launch volume) | Already integrated; folder prefix per env. |
| Realtime | Keep current in-memory `RealtimeService` for now. **Upgrade to Redis pub/sub** the first time you scale the backend beyond a single instance — see §11. |
| DNS / proxy | **Cloudflare** (free tier) | Free DNS, automatic HTTPS, DDoS mitigation, edge caching for static assets. |
| Error monitoring | **Sentry** (Team $29/mo) | Frontend + backend SDKs, source maps. |
| Uptime | **BetterStack** or **UptimeRobot** (free) | 30s polls on `/api/health` + the homepage. |

---

## 4. DNS records (Cloudflare)

```
Type    Name           Value                          Proxy
A       @              <Vercel apex A record>         Proxied
CNAME   www            cname.vercel-dns.com           Proxied
CNAME   dev            cname.vercel-dns.com           Proxied
CNAME   api            <Render service URL>           Proxied (gray-cloud if WebSocket issues)
CNAME   api-dev        <Render dev service URL>       Proxied
CNAME   status         stats.uptimerobot.com          DNS only
TXT     @              v=spf1 -all                    (no email yet)
```

> Cloudflare proxy for `api.*` needs to permit SSE. Verify by streaming `/api/stream` and watching the `cf-cache-status` header. If buffering, add a "Bypass Cache" rule for `/api/stream`.

---

## 5. Per-environment env var matrix

The backend `.env.example` already names every required var; only values change per env.

### Backend

| Var | dev | prod |
|---|---|---|
| `PORT` | (Render-injected) | (Render-injected) |
| `NODE_ENV` | `production` | `production` |
| `JWT_SECRET` | 64-byte random A | 64-byte random B |
| `JWT_EXPIRES_IN` | `30d` | `30d` |
| `DATABASE_URL` | Neon dev branch | Neon prod branch |
| `CLOUDINARY_CLOUD_NAME` | shared | shared |
| `CLOUDINARY_API_KEY` | shared | shared |
| `CLOUDINARY_API_SECRET` | shared | shared |
| `FRONTEND_URL` | `https://dev.vocalmatch.com` (the dynamic `*.vercel.app` regex in `main.ts` covers PR previews) | `https://vocalmatch.com,https://www.vocalmatch.com` |
| `PUBLIC_URL` | `https://api-dev.vocalmatch.com` | `https://api.vocalmatch.com` |

### Frontend (Vercel)

| Var | dev | prod |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api-dev.vocalmatch.com` | `https://api.vocalmatch.com` |
| `NEXT_PUBLIC_SITE_URL` | `https://dev.vocalmatch.com` | `https://vocalmatch.com` |
| `SENTRY_AUTH_TOKEN` | dev token | prod token |

Vercel's environment scoping handles this cleanly: set the prod values on **Production**, dev values on **Preview** + **Development**.

---

## 6. Phased timeline (10 working days, single engineer)

| Day | Phase | Outcomes |
|---|---|---|
| **1** | **Procure** | Domain (`vocalmatch.com`) and Cloudflare account already in place — confirm registrar + Cloudflare control, lock the domain, enable DNSSEC. Render, Neon, Sentry accounts created. Cloudinary plan upgraded. Secrets vault chosen (1Password / Doppler / Vercel + Render env panes). |
| **2** | **Backend live (dev)** | NestJS deployed to Render dev service. Neon dev branch wired. `https://api-dev.vocalmatch.com` returning healthy. CORS verified from a curl against `dev.vocalmatch.com`. |
| **3** | **Frontend live (dev)** | Vercel project linked to repo (root = `frontend/`). Preview deploys on PRs. `dev.vocalmatch.com` aliased to the `phase3-a` branch deployment. |
| **4** | **CI/CD** | GitHub Actions: type-check + lint on PR, Vercel preview auto, Render auto-deploy from `phase3-a` (dev) and `main` (prod). Branch protection on `main`. |
| **5** | **Hardening pass** | `helmet`, rate-limit with `nestjs-throttler`, Cloudflare Turnstile on auth, brute-force lockout, forgot-password flow, magic-byte upload validation, virus scanning, admin audit log, security headers in `next.config.js` (HSTS, X-Frame-Options, Referrer-Policy), Sentry on both apps with source maps, CSP behind a feature flag. See full list in §8. |
| **5b** | **Legal & branding pass** | All legal public pages live (`/terms`, `/privacy`, `/dmca`, `/community-standards`, `/contact`, `/rules`); ToS clauses for age, governing law, limitation of liability, termination, repeat-infringer; signup + upload consent capture with timestamp persistence; footer legal links + trademark notice; cookie banner. See §8 Legal subsection. |
| **6** | **Backend live (prod)** | Render prod service + Neon prod branch. Secrets generated separately. Backend migrated off TypeORM `synchronize: true` to real migrations. One-shot `seed:admin` after first deploy. |
| **7** | **Frontend live (prod)** | Vercel custom domain on `vocalmatch.com` + `www`. Redirect `www` → apex. OG/Twitter previews verified. `sitemap.xml` + `robots.txt` generated. Plausible/PostHog analytics wired. |
| **8** | **Pre-launch testing** | Smoke checklist (§9) against `dev`; then against `prod` with feature-flagged anonymous traffic. k6 load test on `/api/stream` for 1k concurrent SSE. Mobile real-device pass for the still-open mobile bugs (#21 / #30 / #31 / #36 from QA list). |
| **9** | **Launch eve** | Status page live. On-call rotation. Runbook published. Cutover dry-run. Admin seed accounts created. |
| **10** | **Cutover + monitor** | Flip Cloudflare proxy on apex. Watch logs, Sentry, web vitals, vote-vs-load metrics for 24h. Hotfix branch ready. |

---

## 7. CI/CD wiring (GitHub Actions)

```
.github/workflows/
  ci.yml         — typecheck + lint + unit test on every PR + push
  preview.yml    — Vercel preview comment on PR; Render preview env on main-repo PRs
```

Render auto-deploy hooks:
- `phase3-a` → `api-dev.vocalmatch.com`
- `main` → `api.vocalmatch.com`

Vercel auto-deploy:
- `phase3-a` → `dev.vocalmatch.com`
- `main` → `vocalmatch.com`
- Any PR → preview URL with a sticky comment from `vercel-bot`

Branch protection on `main`: required status checks (typecheck + lint + test), 1 reviewer minimum, no force-pushes.

---

## 8. Hardening checklist (Day 5)

### Backend — core hardening

- [ ] `helmet()` global middleware
- [ ] `@nestjs/throttler` on auth + vote endpoints (e.g. 5–10 attempts/min on `/api/auth/login`, `/api/auth/register`; 60 req/min on other `/api/auth/*`; 600 req/min global)
- [ ] Migrate to TypeORM migrations; disable `synchronize`
- [ ] Sentry init in `main.ts`; source-map upload in CI
- [ ] Health check at `/api/health` (no auth, no DB query — cached)
- [ ] Background scheduler protected by an advisory lock (`pg_advisory_lock`) so a future second instance can't double-close battles
- [ ] Cloudinary signed-upload tightening + folder prefix per env

### Backend — authentication & abuse protection

- [ ] Remove hardcoded JWT_SECRET fallback in [`backend/src/auth/auth.module.ts`](../backend/src/auth/auth.module.ts) — fail-fast if env var missing
- [ ] Generate independent 64-byte random `JWT_SECRET` per environment (dev / prod)
- [ ] Bot protection: integrate **Cloudflare Turnstile** on `/auth/register` and `/auth/login` (free, low-friction)
- [ ] Brute-force login protection: track failed-attempt count per username+IP; progressive backoff + temporary lockout after N failures (e.g. 5 in 15 min)
- [ ] Forgot-password flow: `POST /auth/forgot-password` (rate-limited, always 200 to prevent user enumeration) + `POST /auth/reset-password` with single-use, time-limited token (1-hour expiry)
- [ ] Account closure endpoint surfaced to users (soft-delete already exists in backend — wire the user-facing action)
- [ ] Admin audit log entity: record every privileged admin action (role changes, content removals, account suspensions, song promotions, battle promotions/cancellations) with admin ID, timestamp, target entity, action type, before/after snapshot. Viewable only by super-admins
- [ ] Repeat copyright infringer enforcement: schema flag on user (`copyrightStrikes`) + admin action to record strike + auto-suspend at threshold (per DMCA policy)

### Backend — file upload hardening

- [ ] Magic-byte (file-signature) verification on all uploads — videos, avatars, future audio/lyrics — so disguised file extensions are rejected
- [ ] Re-verify MIME + size limits per upload endpoint (video 100 MB, avatar 5 MB) and document
- [ ] Virus / malware scanning on every upload before the asset becomes visible. Two viable paths — choose based on expected upload volume:
  - **ClamAV** sidecar (free, self-hosted; ~512MB RAM overhead)
  - **VirusTotal** or **Cloudmersive** scanning API (paid, no infra)
- [ ] Upload-time license & ownership acknowledgement persisted (see Legal section below)

### Frontend

- [ ] Sentry init with `NEXT_PUBLIC_SENTRY_DSN`
- [ ] `next.config.js` security headers (HSTS 1y, X-Content-Type-Options, Referrer-Policy `strict-origin-when-cross-origin`, Permissions-Policy minimal)
- [ ] CSP iterated under `report-only` first; flip to enforce after a week of clean reports
- [ ] OG/Twitter image audit (dynamic OG endpoint already shipped — re-verify the prod URL)
- [ ] `sitemap.xml` + `robots.txt` at the edge
- [ ] Web Vitals reporting → Sentry or Vercel Analytics
- [ ] Cookie banner / consent framework — lightweight v1 (no third-party tracking today); extendable when analytics/ads added

### Legal — public pages

- [ ] `/terms` — Terms of Service (see required clauses below)
- [ ] `/privacy` — Privacy Policy
- [ ] `/dmca` — Copyright & DMCA Policy (includes repeat-infringer language)
- [ ] `/community-standards` — Community Standards
- [ ] `/contact` — Contact page
- [ ] `/rules` — Official Competition Rules
- [ ] Footer legal links across the platform (currently only copyright line exists in [`frontend/src/components/Footer.tsx`](../frontend/src/components/Footer.tsx))

### Legal — Terms of Service required clauses

- [ ] **Age requirement** — users must be at least 13 years old, or the minimum age required by their jurisdiction
- [ ] **Governing Law** — VOCALMATCH is governed by the laws of the State of Connecticut (arbitration clause deferred pending legal counsel review)
- [ ] **Limitation of Liability** — standard language disclaiming indirect, incidental, consequential, special, and punitive damages to the fullest extent permitted by law
- [ ] **Account Termination** — users may close accounts at any time; VOCALMATCH reserves the right to suspend or terminate accounts that violate platform rules
- [ ] **Repeat Copyright Infringer Policy** — termination policy in accordance with DMCA requirements (cross-referenced in DMCA page)
- [ ] **Prize & Promotion Rules** — placeholder noted in legal framework; full section to be added if/when VOCALMATCH offers cash prizes, sponsorships, merchandise, travel, or recording opportunities

### Legal — consent capture & data rights

- [ ] User entity: add `tosAcceptedAt`, `tosVersion`, `privacyAcceptedAt`, `privacyVersion` columns
- [ ] Signup form: required ToS + Privacy checkboxes; persist acceptance timestamp + version on register
- [ ] Upload form: required content-ownership + license acknowledgement checkbox; persist on `Performance` / `Video` row
- [ ] DPIA + DSAR endpoint review — delete-account already exists; data export is a 1-day add
- [ ] Re-prompt for re-acceptance flow when ToS or Privacy version is bumped post-launch

### Branding & trademark

- [ ] Trademark notice in footer — `VOCALMATCH®` (if registered) or `VOCALMATCH™` (unregistered); confirm filing status before adding

---

## 8b. Email infrastructure (Day 1 alongside DNS)

Required aliases before launch:

- [ ] `support@vocalmatch.com`
- [ ] `legal@vocalmatch.com`
- [ ] `copyright@vocalmatch.com` (target for DMCA notices)
- [ ] `info@vocalmatch.com`

**Provisioning options** (pick one before Day 1):

- **Cloudflare Email Routing** (free) — forwards all four aliases into a single existing inbox. Best for low-volume contact addresses, no full mailbox needed.
- **Google Workspace** (~$6/user/mo) — real mailboxes per alias, calendar/Drive included. Best if any address is staffed.

Outbound deliverability (sender authentication):

- [ ] SPF record published (currently `v=spf1 -all` placeholder — update once outbound provider chosen)
- [ ] DKIM keys published for transactional email provider
- [ ] DMARC policy: start at `p=none; rua=mailto:...`, ratchet to `p=quarantine` after 30 days of clean reports

---

## 8c. Backup & disaster recovery

### Database (Neon Postgres)

- [ ] Neon point-in-time recovery enabled on prod branch (included in Launch tier — up to 7 days of continuous restore points)
- [ ] Independent nightly export to encrypted off-platform storage (S3 or R2) — guards against a Neon-side incident
- [ ] Quarterly restore drill: spin up a throwaway branch from a backup, verify schema + row counts

### Media (Cloudinary)

- [ ] Confirm Cloudinary Plus tier covers multi-region redundancy + delivery CDN (default behavior)
- [ ] Optional second-line mirror to S3 / R2 for catastrophic-failure recovery (sync via Cloudinary webhook → backup bucket)
- [ ] Document restore procedure: how to repopulate Cloudinary from mirror if needed

### Recovery objectives

- [ ] **RTO** (recovery time objective): < 1 hour for application + database; < 4 hours for full media restore
- [ ] **RPO** (recovery point objective): < 5 minutes for database (Neon PITR); < 24 hours for media (worst case from mirror)

### Runbook contents (published before Day 9)

- [ ] Rollback of a bad deployment (Vercel previous-deployment promote + backend redeploy)
- [ ] Database point-in-time restore (step-by-step Neon console + CLI)
- [ ] Media restore from backup
- [ ] DNS failover (Cloudflare proxy bypass)
- [ ] Who runs each procedure, escalation path, expected time to recovery

---

## 9. Smoke / load test checklist

Run against `dev` (Day 8 morning) and `prod` (Day 8 afternoon):

| Flow | Pass criteria |
|---|---|
| Signup → onboarding → first upload | New user lands on homepage with profile-completed banner cleared |
| Vote on a live battle | Counts unlock immediately, SSE delivers update to a second tab within 1s |
| Admin promotes a Red Phone challenge | Battle auto-titled, notifications fire to both performers, no "Untitled" in admin list |
| Battle close (scheduler) | A test battle with `votingClosesAt` 2 min in the future closes within 60s, winner crowned, both performers notified |
| Cancelled upload | Server-side row + Cloudinary asset both removed; performance does not appear in feed |
| Centerstage-song change attempt during active battle | API returns 409 with the active-battle id |
| Trending filter on homepage | No 500 — performances sorted by views |
| Private (Only You) upload | Visible on uploader's own profile, hidden from other users |
| Mobile (real device) — Notifications popup | Fits inside viewport with internal scroll |

Load test (k6):
- 1,000 concurrent SSE listeners on a single live battle
- 100 concurrent votes/sec for 30s
- Target: p95 vote response < 250ms, p95 SSE event delivery < 500ms

---

## 10. Launch-day runbook

**T-24h**
- Freeze `main`. Tag `v1.0.0`.
- Run full smoke checklist on `prod` (still un-proxied apex).

**T-2h**
- Verify Sentry receiving events from prod.
- Verify scheduler is closing test battles (insert one expiring in 5 min).
- Verify SSE: open battle page in two browsers, vote, watch counts.

**T-0**
- Flip Cloudflare apex A record to proxied.
- Announce internally + push the launch tweet from a personal account.
- Watch:
  - Sentry frontend error rate (target < 0.5%)
  - Render CPU + memory
  - Neon connections (target < 50% of pool)
  - Vercel function duration (LCP < 2.5s)

**T+1h, T+6h, T+24h check-ins.**

**Rollback plan**: previous Vercel deployment promoted via dashboard (~30s); previous Render image redeployed via service settings (~2 min). Database rollback: Neon point-in-time restore to T-1h.

---

## 11. Scaling notes (for after launch)

These are post-launch concerns, not launch blockers. Capturing here so the path is obvious when traffic warrants it.

- **Beyond one backend instance.** `RealtimeService` currently publishes to in-process EventEmitter channels. The first time you horizontally scale, replace the publish/subscribe layer with Redis (or Upstash Redis on Vercel Marketplace). The `BattlesScheduler` already needs an advisory lock from Day 5; same pattern.
- **Read-heavy homepage stats.** `/api/stats`, `/api/battles/dethronements/recent`, and `/api/songs/featured-risk` are good candidates for a 30s cache layer (Vercel Edge Config or KV).
- **Cloudinary egress.** Switch on the AVIF/WebP eager-transform pipeline + use Cloudinary's `f_auto,q_auto` for thumbnails. Saves ~40% bandwidth.
- **Background email pipeline.** When email notifications ship (Phase 2C), add a worker dyno on Render reading from a `notification_deliveries` queue rather than blocking the web process.

---

## 12. Cost (monthly, post-launch)

| Service | Tier | Cost |
|---|---|---|
| Domain | annual amortized | ~$1.25 |
| Vercel | Pro | $20 |
| Render | Standard backend × 2 envs | $50 |
| Neon Postgres | Launch | $19 |
| Cloudinary | Plus | $99 |
| Sentry | Team | $29 |
| Cloudflare | Free | $0 |
| UptimeRobot | Free | $0 |
| **Total** | | **~$218/mo** |

Bargain mode (~$165/mo): collapse dev backend onto a Render Starter ($7) and skip Sentry until 10k MAU.

---

## 13. Decisions to nail down before Day 1

1. **Domain confirmed**: `vocalmatch.com` on Cloudflare. The placeholder fallback in [`frontend/src/app/layout.tsx`](../frontend/src/app/layout.tsx) and the share URL fallback in [`frontend/src/app/page.tsx`](../frontend/src/app/page.tsx) still point to `https://vocalmatch.app` — both should be updated to `.com` (one-line change each) before Day 1 so any SSR / pre-hydration render emits the correct origin.
2. **Backend host: Render or Railway?** Both work. CORS already lets Railway through. Render has a cleaner Postgres + cron story.
3. **Migration strategy.** Going from TypeORM `synchronize: true` to real migrations needs one baseline migration generated from the current schema. ~2 hours.
4. **GDPR posture.** EU launch → cookie banner + DPA with subprocessors (Cloudinary, Sentry, Vercel, Neon) is a Day-7 task, not a launch blocker — but be honest about timing.
5. **Anonymous vote opt-in.** SSE currently only delivers vote counts to authenticated users who have voted. Confirm that's launch intent or relax for marketing pages.
6. **Pre-launch staging traffic.** Decide whether to invite a private beta to `dev.vocalmatch.com` for 1–2 weeks before public launch, or go straight to production.

---

## 14. Open follow-ups from QA backlog (not launch-blocking but worth surfacing)

These are the 7 QA items still open at the time this plan was written:

- **#5** "Sign up to vote" shown to logged-in users — needs codebase search with the exact screenshot to locate.
- **#9** Admin battle page real-time vote counts — wire EventSource on the admin detail page.
- **#14** Challenge section visible before champion decided — guard the upload-version CTA on `currentChampionUserId`.
- **#21** Mobile SSE reconnect after network drop — needs real-iPhone verification.
- **#25** Challenge Upload section auto-appears after battle completion — listen to SSE `status` event and refetch the song's champion.
- **#26** Battle page stuck loading when video deleted — fix applied to the detail page; verify the same pattern at the homepage Featured-battle level.
- **#36** Mobile login "Failed to fetch" — almost certainly a CORS / mixed-content config at the deployed layer; will be retested against the live `api.vocalmatch.com`.

None of these block the launch, but they should be triaged within the first week post-launch.
