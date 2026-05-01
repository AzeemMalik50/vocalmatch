# VocalMatch — Phase 1

> One song. Two voices. One crown.

A continuous competition platform for vocal performance. This repository
contains **Phase 1** of the launch plan — the core foundation that everything
else builds on.

## What Phase 1 delivers

The user-facing surface is intentionally narrow:

- **Account creation & sign-in** — email + username + password, JWT-based
- **User profile pages** — at `/u/<username>`, with stats panel ready for Phase 2
- **Video upload** — direct-to-Cloudinary streaming with auto thumbnail and duration extraction
- **Performance feed** — newest-first grid on the home page
- **Single performance pages** — at `/v/<videoId>`, with full playback and uploader info
- **Performance deletion** — uploaders can remove their own work
- **Stage-themed UI** — dark velvet palette, spotlight accent, animated hero

## What Phase 1 sets up for Phase 2 (without shipping it)

The architecture is built so Phase 2 plugs in cleanly:

| Future feature | What's already in place |
| --- | --- |
| **Battles (1v1 same-song pairings)** | `videos.songTitle` field indexed; `videos.category` enum with `battle_entry` value defined |
| **Red Phone challenge queue** | `videos.category = challenge_entry` value defined; upload endpoint accepts category param |
| **Champion crowns** | `users.championTitle`, `users.winCount`, `users.battleCount`, `users.currentStreak` columns exist |
| **Voting system** | Auth, user identity, and JWT-protected mutation endpoints already wired |
| **Profile stats panel** | Already rendering on `/u/<username>` (currently shows zeros, will populate when battles ship) |
| **Champion badges in feed** | `PerformanceCard` already renders `uploader.championTitle` if present |

This means Phase 2 is mostly **adding new modules** (battles, votes, challenges)
rather than rewriting existing ones.

---

## Stack

- **Frontend:** Next.js 14 (App Router), React 18, TailwindCSS
- **Backend:** NestJS 10, TypeORM
- **Database:** Postgres in production (via `DATABASE_URL`), SQLite for local dev (auto-fallback)
- **Storage:** Cloudinary (video + auto-generated thumbnail + duration)
- **Auth:** JWT in `Authorization: Bearer` header

---

## Local setup

### Prerequisites
- Node.js 20+
- A Cloudinary account (free tier is fine) — get keys from the dashboard

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env: paste Cloudinary creds, change JWT_SECRET, leave DATABASE_URL empty for SQLite
npm run start:dev
```

Runs on `http://localhost:4000/api`. SQLite file `vocalmatch.sqlite` is
auto-created on first boot.

### Frontend

In a separate terminal:

```bash
cd frontend
npm install
cp .env.example .env.local
# Default points at localhost:4000/api — leave as-is
npm run dev
```

Runs on `http://localhost:3000`.

### Try it

1. Open `http://localhost:3000`
2. Click **Take the stage** → create an account
3. Click **Upload your performance** → pick a short video file, optionally tag the song, publish
4. The video appears in the feed with thumbnail and duration
5. Click into the video for the full playback page
6. Click your `@username` in the nav for your profile page

---

## Project structure

```
vocalmatch/
├── backend/                       NestJS API
│   ├── src/
│   │   ├── auth/                 signup/login, JWT strategy, guards
│   │   ├── users/                user entity (with Phase 2 stats), profile endpoints
│   │   ├── videos/               upload controller, Cloudinary service
│   │   └── app.module.ts         conditional Postgres/SQLite wiring
│   ├── Dockerfile                multi-stage build for Back4App
│   └── .env.example
└── frontend/                      Next.js app
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx           home: hero + battle teaser + feed
    │   │   ├── login/             sign in
    │   │   ├── signup/            create account
    │   │   ├── upload/            new performance form
    │   │   ├── v/[id]/            single video page
    │   │   └── u/[username]/      profile page
    │   ├── components/
    │   │   ├── Logo.tsx           VocalMatch wordmark with spotlight dot
    │   │   ├── Nav.tsx            top navigation
    │   │   ├── Footer.tsx         "what's coming" tease
    │   │   └── PerformanceCard.tsx  reusable feed card
    │   └── lib/
    │       ├── api.ts             typed API client, robust /api suffix handling
    │       └── auth-context.tsx   user state across app
    └── tailwind.config.js         stage palette: spotlight, gold, haze
```

---

## API reference (Phase 1)

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/signup` | — | Create account |
| POST | `/api/auth/login` | — | Sign in |
| GET | `/api/users/me` | ✅ | Current user's full profile |
| PATCH | `/api/users/me` | ✅ | Update bio / avatarUrl |
| GET | `/api/users/:username` | — | Public profile by username |
| GET | `/api/videos` | — | List performances (filter by `category`, `uploaderId`) |
| GET | `/api/videos/:id` | — | Single video (also increments view count) |
| POST | `/api/videos` | ✅ | Upload (multipart: `title`, `songTitle?`, `description?`, `video`, `category?`) |
| DELETE | `/api/videos/:id` | ✅ | Delete own video |

---

## Deployment

Same pattern as the prototype:

- **Backend:** Back4App Containers (free, no card) — uses the included `Dockerfile`
- **Database:** Neon free tier Postgres — set `DATABASE_URL` in Back4App env vars
- **Frontend:** Vercel (free, no card) — set `NEXT_PUBLIC_API_URL` to your Back4App URL
- **Videos:** Cloudinary free tier

Required environment variables on the **backend**:

```
JWT_SECRET=<long random string>
DATABASE_URL=<Neon connection string>
CLOUDINARY_CLOUD_NAME=…
CLOUDINARY_API_KEY=…
CLOUDINARY_API_SECRET=…
FRONTEND_URL=https://your-app.vercel.app
```

CORS is permissive about `*.vercel.app` subdomains, so preview deploys
work without extra config.

---

## Design notes

**Why a music-themed dark UI?** The platform is a stage. The deep velvet
backdrop with a single hot accent (`#ff2d55`) signals "spotlight on the
performer." Gold (`#f5c451`) is reserved for champions and reads as a
crown — it appears in Phase 1 only as a teaser, used once a battle is won.

**Why Fraunces for the display font?** It has the editorial weight of a
headline poster but the soft italic forms feel performative rather than
corporate. Pairs with Inter for body without competing.

**Why JWT in localStorage and not httpOnly cookies?** Simpler for a
prototype. Phase 3 hardening swaps to httpOnly cookies + CSRF tokens.

---

## Phase 2 preview (not in this repo)

When battles ship, you'll add:

- A `Battle` entity (champion `videoId` + challenger `videoId` + endsAt timestamp)
- A `Vote` entity with unique constraint on `(userId, battleId)` — one vote per battle, not per video
- A `Challenge` entity (queue of `challenge_entry` videos awaiting selection)
- A `BattleCard` component on the home hero (replaces current "First Battle" teaser)
- A countdown timer hook
- A "Send to break the tie" share trigger after voting
- An admin route to promote a queued challenge into a live battle
- A scheduled job to lock battles when `endsAt` passes and update `winCount`/`currentStreak`/`championTitle` on the winner

Everything above lands in *new* files. The Phase 1 code doesn't need rewrites.
