# VOCALMATCH — Technical Requirements Document (TRD)

Prepared: 2026-06-10
Scope: Phase 1 + Phase 2A + Phase 2B + Phase 3 (current shipped state)

This is the canonical technical reference for VOCALMATCH: stack, architecture, performance and security targets, deployment, and operational concerns. Companion to `ERD.md` (schema) and `APP_FLOW.md` (user journey).

---

## 1. System overview

VOCALMATCH is a song-anchored vocal competition platform. Users upload performances of curated Centerstage Songs, the audience votes head-to-head between two performers of the same song, and the winner becomes the "Official Voice" of that song until challenged and dethroned. The platform's emotional engine is *status under threat* — every crown is contestable in real time.

**Architecture style:** monolithic backend (NestJS) + statically rendered + dynamic Next.js frontend, with an in-process Server-Sent Events (SSE) pub/sub for real-time signal delivery.

---

## 2. Technology stack

### Backend
| Component | Choice | Notes |
|---|---|---|
| Runtime | Node.js 20 | LTS. |
| Framework | NestJS 10 | Module-per-feature, dependency-injection, decorator-driven. |
| Language | TypeScript 5 | Strict mode. |
| ORM | TypeORM 0.3 | With `@nestjs/typeorm`. Postgres in staging/prod, SQLite locally optional. |
| Database | PostgreSQL 15 | Managed by Railway. Partial unique indexes used heavily. |
| Auth | Passport JWT + bcryptjs | Stateless. Bearer header; `?token=` query for SSE. |
| Realtime | In-process SSE pub/sub | Single-instance today. Drop-in Redis adapter when horizontally scaled. |
| Validation | `class-validator` + `class-transformer` | `whitelist: true` + `forbidNonWhitelisted: true` (reject unknown body fields). |
| Storage | Cloudinary | Video + avatar uploads. |
| Scheduling | `@nestjs/schedule` | Battle close scheduler (1-minute tick). |
| API docs | `@nestjs/swagger` v7 | Live at `/api/docs`. Plugin auto-injects `@ApiProperty` from class-validator decorators. |
| Testing | Jest + ts-jest | Unit tests on service layer. |

### Frontend
| Component | Choice | Notes |
|---|---|---|
| Framework | Next.js 14 (App Router) | RSC + client components. |
| Language | TypeScript 5 | |
| Styling | Tailwind CSS 3 | CSS-variable-driven palette (`stage`, `spotlight`, `gold`, `haze`) + shadcn-style aliases (`background`, `card`, `muted`, `border`). |
| Icons | `lucide-react` | Replaced earlier emoji-as-icon placeholders during Phase 3 design port. |
| Auth state | Custom `AuthProvider` (React context) | JWT stored in `localStorage` as `vm_token`. |
| Realtime client | Native `EventSource` | Auto-reconnects on network blip. |
| Fonts | Bebas Neue (display) + Allura (script) + Inter (body) | Cinematic typography for the dark Battlefield brand. |
| Animation | Plain CSS keyframes + `prefers-reduced-motion` overrides | No Framer Motion in current build. |

### Infrastructure
| Component | Choice | Notes |
|---|---|---|
| Frontend host | Vercel | Preview deployments on every PR. |
| Backend host | Railway | Node + Postgres on a single dyno. |
| Media storage | Cloudinary | Free tier acceptable for dev. |
| API base URL (dev) | `https://awake-patience-dev.up.railway.app/api` | |
| Frontend URL (dev) | `https://vocalmatch-dev.vercel.app/` | |
| DNS | Vercel + Railway built-in domains | Custom domain reserved for production. |

---

## 3. Module architecture

```
backend/src/
├── auth/              # signup, login, JWT strategy, token-version revocation
├── users/             # profile, avatar upload, user-stakes (Phase 3 personalization)
├── videos/            # upload to Cloudinary, listing, soft-delete, view counting
├── songs/             # Centerstage Songs catalog, risk + featured-risk
├── battles/           # battles, voting, challenges (Red Phone), challenge promotion
├── notifications/     # bell feed + SSE write-through
├── admin/             # AdminGuard + admin-only users + performances triage
├── realtime/          # in-process SSE pub/sub
└── scripts/           # seed-admin, seed-sample, phase-2a-fixes (one-shot ops scripts)
```

Each module exposes its service to others via `exports: [Service]` in the `@Module()` decorator. Cross-module dependencies use `forwardRef()` only where there's a true cycle (notifications ↔ realtime, battles ↔ realtime, users ↔ battles).

---

## 4. Authentication & authorization

### JWT
- Issued on signup + login. Stored on the client as `vm_token` in `localStorage`.
- Payload: `{ sub: userId, username, tv: tokenVersion, iat, exp }`.
- Expiry: 30 days.
- Bearer header (`Authorization: Bearer …`) for REST.
- `?token=…` query param for SSE (`EventSource` cannot set custom headers).

### Token-version revocation
- `users.tokenVersion` is bumped by **password change** and **sign-out-everywhere**.
- Every authenticated request re-checks `payload.tv === user.tokenVersion` and returns 401 on mismatch — invalidating every other live session for that user.

### Roles
| Role | Flag | Functional gates |
|---|---|---|
| Admin | `isAdmin = true` | `AdminGuard` on all `/admin/*` endpoints + battle CRUD + Red Phone triage. |
| Songwriter | `isSongwriter = true` | None today. Reserved for Phase 2C song-submission flow. |
| Regular user | both false | Default. Upload, vote, challenge, receive notifications. |
| Champion | derived | Not a flag — derived from `songs.currentChampionUserId`. Gates self-challenge (409). |

### Guards
- `JwtAuthGuard` — extracts JWT from `Authorization` header **or** `?token=` query; sets `req.user = { userId, username, isAdmin }`.
- `OptionalJwtAuthGuard` — same as above but allows anonymous; `req.user` may be undefined.
- `AdminGuard` — re-fetches the user from DB and asserts `isAdmin === true` at request time (defense in depth — the JWT claim alone is not trusted for elevated actions).

---

## 5. Real-time architecture (SSE)

### Why SSE (not WebSocket)
- One-way push from server → client (notifications + vote counts) is all we need.
- Free re-connect, free heartbeating, free HTTP/2 multiplexing.
- No socket server to operate.

### Channels
- `user:<userId>` — the requester's private channel. Always subscribed when streaming.
- `battle:<battleId>` — battle vote-count stream. Subscribed only when the caller has voted on the battle (or is admin).

### Frame types
| Event | Sent on | Payload |
|---|---|---|
| `ready` | Initial connect | `{ channels: [...] }` |
| `notification` | `NotificationsService.create()` | `{ notification, unreadCount }` |
| `vote` | `BattlesService.castVote()` | `{ battleId, voteCountA, voteCountB, percentA, percentB, currentLeader, totalVotes, status }` |
| `status` | Battle close, tie, dethronement | Battle final state |
| Heartbeat | Every 25s | `: ping` SSE comment |

### Scaling note
The pub/sub is **in-process** (`Map<channelKey, Set<Response>>`). Acceptable for a single Railway dyno. When horizontal scaling lands, swap the in-memory map for a Redis adapter — the publish/subscribe surface stays identical, only the transport changes.

---

## 6. Battle close scheduler

`BattlesScheduler` polls every minute via `@Cron(CronExpression.EVERY_MINUTE)`:

1. Find all `battles WHERE status='live' AND votingClosesAt < now`.
2. Wrap in a transaction:
   - Re-read counts.
   - If equal → `status='needs_decision'`.
   - Else → `status='completed'`, set `winnerPerformanceId` / `winnerUserId`, update song champion fields, increment winner's `currentStreak` or reset to 1.
3. Publish a `status` event to the battle channel.
4. Write `battle_result` notifications (reserved — wire-up is Phase 2C).

**Worst-case drift:** ~60 s between actual `votingClosesAt` and finalization. Documented and acceptable for vote integrity.

---

## 7. Validation & error contract

All endpoints use `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })`:
- Unknown fields → HTTP 400 with `property X should not exist`.
- Type mismatches → HTTP 400 with field-level error array.

Standard non-2xx codes the API uses:
| Code | Meaning |
|---|---|
| 400 | Validation / business rule violation (out-of-window vote, tag-mismatch, etc.) |
| 401 | Missing / bad / stale JWT |
| 403 | Authorized but not authorized for *this* resource (private profile, not-the-uploader) |
| 404 | Resource doesn't exist |
| 409 | Conflict — duplicate vote, duplicate challenge, self-challenge, race condition |

---

## 8. Performance targets

| Surface | Target | Notes |
|---|---|---|
| Homepage Lighthouse mobile | ≥ 85 | Phase 3 polish target. Current ~88. |
| Time to first byte (TTFB) | < 600 ms | Vercel edge cache. |
| Battle detail page TTI | < 2.5 s | Includes the SSE handshake. |
| SSE event latency (publish → client receive) | < 500 ms | Single-instance LAN-ish path. |
| Backend response p95 | < 250 ms | Excluding upload endpoints. |
| Upload throughput | up to 100 MB / video | Cloudinary direct upload chunks. |
| Background battle close | within 60 s of `votingClosesAt` | Scheduler tick interval. |

### Caching
- Public-listing endpoints (`/songs`, `/videos`) — Vercel CDN cache on the frontend `revalidate`, no backend caching beyond Postgres connection pool.
- Aggregate stats endpoint (`/songs/featured/risk`, etc.) — TODO: 60 s in-process cache (Phase 3 polish).

### Indexes
See `ERD.md` §Index summary. The hot path queries are:
- `listVideos` — composite filter on `category`, `songId`, `voiceType`, `genre`, `deletedAt`. Indexed individually; query planner picks.
- `findRecentDethronements` — `status='completed' ORDER BY closedAt DESC LIMIT 50`, walked pairwise in code. ~10 ms for 50 rows.
- `hasUserVoted` — `(battleId, userId)` unique index hit. Sub-ms.

---

## 9. Security

### Authentication
- bcrypt cost 10 for password hashing.
- JWT signed with HS256 against `JWT_SECRET` env. Fallback constant exists in code — **must** be overridden in production.
- Token-version field invalidates all sessions on password change.

### Authorization
- Defense in depth — admin endpoints re-check `isAdmin` from the DB at request time, not just the JWT claim.
- Profile-private resources check ownership against `req.user.userId`.

### Input validation
- `forbidNonWhitelisted: true` on the global `ValidationPipe` (added after John's QA found a silently-dropped field).
- File upload: MIME type validation via `FileTypeValidator`, size via `MaxFileSizeValidator` (100 MB videos, 5 MB avatars).
- `class-validator` decorators on every DTO (length, regex, enum, UUID).

### Transport
- Production frontend, backend, and Cloudinary all HTTPS.
- CORS: explicit allow-list (`FRONTEND_URL` env), plus regex passes for `*.vercel.app`, `*.up.railway.app`, and `localhost`. Anything else returns the CORS error.

### Known sensitive areas (from QA)
- Tie resolution is admin-driven and hasn't been heavily exercised in production.
- SSE reconnect on mobile background/foreground transitions can lag the bell badge briefly; refreshing resyncs.
- Vote percentages hidden pre-vote is intentional product behavior (anti-bandwagon), not a bug.

### Not yet implemented (deferred Phase 2C+)
- Rate limiting per IP / per user.
- Account lockout on N failed logins.
- 2FA / MFA.
- Email-based password reset.
- Audit log of admin actions.

---

## 10. Data lifecycle

| Event | Effect |
|---|---|
| User signup | Insert into `users`, default flags false. |
| Password change / sign-out-everywhere | Bump `tokenVersion`. |
| Account delete | Hard-delete `users` row. Videos cascade-delete from the FK. Battles + votes retain the dangling reference (audit). |
| Video upload | Cloudinary upload → insert into `videos`. |
| Video delete (user) | Soft-delete (`deletedAt = now()`) if video has participated in a battle; otherwise hard-delete from Cloudinary + DB. |
| Video delete (admin) | Soft-delete unconditionally. |
| Vote | Insert into `votes` inside a transaction that also increments the denormalized count on `battles`. |
| Battle close | Scheduler tick. Updates battle row + song's champion fields + winner's user counters. |
| Challenge submit | Insert into `challenge_submissions`. Partial unique index gates duplicates. |
| Challenge select/reject/promote | Status mutation + notification write + SSE push. |
| Notification create | DB insert + SSE push to user channel. |

### Backups & retention
- Postgres daily snapshots on Railway (default).
- Cloudinary lifetime retention for media; manual cleanup of soft-deleted videos > 30 days is a future ops task.
- Notifications never expire; `mark-all-read` only flips the boolean.

---

## 11. Observability

- Application logs via NestJS `Logger`. Stdout → Railway log stream.
- No external APM today (Datadog / Sentry deferred).
- Health endpoint: `GET /api/health` (returns version + SSE channel count).
- Swagger spec at `/api/docs` + raw at `/api/docs-json`.

### Future
- Sentry for unhandled exceptions on both ends.
- PostHog or Plausible for product analytics (event-by-event homepage CTA tracking).

---

## 12. Deployment

### CI/CD
- Frontend: Vercel auto-deploy on push to any branch (preview), promote to prod on push to `main`.
- Backend: Railway auto-deploy on push to the configured branch.

### Environment variables
| Var | Purpose | Where |
|---|---|---|
| `DATABASE_URL` | Postgres connection string | Backend |
| `JWT_SECRET` | HS256 signing secret | Backend (must override fallback in prod) |
| `FRONTEND_URL` | CORS allow-list (comma-separated) | Backend |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | Cloudinary credentials | Backend |
| `PUBLIC_URL` | Used in Swagger boot log line | Backend (optional) |
| `NEXT_PUBLIC_API_URL` | Frontend → API base | Frontend (`.env.production`) |

### Local development
- Backend: `npm run start:dev` (port 4000 by default). SQLite fallback supported.
- Frontend: `npm run dev` (port 3000). Hot reload on every save.
- Seed admin: `npm run seed:admin` from `backend/`.

---

## 13. Phase status (delivery layer)

| Phase | Status | Scope |
|---|---|---|
| Phase 1 — foundation | ✅ Stable | Auth, signup, profile, upload, songs catalog, basic feed. |
| Phase 2A — battle engine | ✅ Stable | Battle CRUD, voting, scheduler-driven close, tie resolution, admin tooling. |
| Phase 2B — champion/challenger | ✅ Shipped | Red Phone queue, admin triage, promote-to-battle, streaks, defending-champion badge, winner banner, SSE notifications, live vote counts. |
| Phase 3 — UX / emotional polish | 🟡 In progress | M1+M2 shipped (design system + cinematic homepage). Personalization (at-risk crowns + dethronements) just landed. Crown at Risk algorithm + Dethronement Moments + share cards in flight. |
| Phase 2C / 3.5 — deferred | ⏸️ Backlog | Email delivery, global leaderboards, songwriter portal, viral moments feed, multi-variant share cards, standalone `/about` page. |

---

## 14. Open technical risks

1. **Single-instance SSE** — when scaled horizontally, the in-memory pub/sub won't fan out across dynos. Plan: Redis adapter behind the same `RealtimeService` interface.
2. **Validation pipe `forbidNonWhitelisted: true`** — was added late. Any prior client that silently relied on dropping unknown fields will now 400. No known regressions, but worth a QA pass next release.
3. **Cloudinary key exposure** — backend-only today. If we ever need direct browser → Cloudinary uploads (signed), the signature generation belongs in a dedicated endpoint, not the bare key.
4. **No rate limiting** — vote flooding from a single IP is theoretically possible. Phase 2C concern.
5. **`tokenVersion` JWT invalidation depends on DB roundtrip** — every request hits `users` to compare `tv`. Acceptable today; consider caching once user count grows.
