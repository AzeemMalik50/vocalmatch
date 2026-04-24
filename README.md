# Reelvote — Video Voting Prototype

A full-stack video upload and voting platform. Users sign up, upload short
videos to Cloudinary, watch each other's content in a feed, and cast exactly
**one vote per video**.

**Stack:** Next.js 14 (App Router) frontend · NestJS backend · SQLite (swappable
for Postgres) · Cloudinary for video storage · JWT auth.

---

## How the system works

**Auth.** On signup, passwords are hashed with bcrypt and a JWT is issued. The
frontend stores the token in `localStorage` and attaches it as
`Authorization: Bearer <token>` on every authenticated request. Protected
routes use a `JwtAuthGuard`; the feed endpoint uses an *optional* guard so
guests can browse but can't vote.

**Uploads.** The frontend posts `multipart/form-data` to `POST /api/videos`.
The NestJS controller validates the file (type + 100 MB ceiling) and streams
the buffer directly to Cloudinary using `upload_stream` — the file never
touches the backend disk. Cloudinary returns a `secure_url` plus a generated
thumbnail URL, which we persist alongside the `cloudinary_public_id` (so we
can clean up later) and the uploader's user ID.

**Voting.** The rule "one vote per user per video" is enforced at two layers:

1. A **unique composite constraint** on `(userId, videoId)` in the `votes`
   table. This guarantees correctness even under concurrent requests — a
   double-click or duplicate request will fail at the DB layer, not just the
   application layer.
2. A service-level check that toggles: if a vote row exists for this
   (user, video), delete it; otherwise insert one. The endpoint returns
   `{ hasVoted, voteCount }` so the UI can update instantly.

**Real-time-ish counts.** Rather than add websockets for a prototype, each
`VideoCard` polls `GET /api/videos/:id/votes/count` every 5 seconds. The
voting action itself is optimistic: the UI flips state before the network
call and rolls back if the server rejects it.

---

## Project structure

```
video-vote-app/
├── backend/               NestJS API
│   ├── src/
│   │   ├── auth/          signup/login, JWT strategy, user entity
│   │   ├── videos/        upload controller, Cloudinary service
│   │   └── votes/         toggle endpoint, unique-constraint entity
│   ├── .env.example
│   └── package.json
└── frontend/              Next.js app
    ├── src/
    │   ├── app/           pages: /, /login, /signup, /upload
    │   ├── components/    Nav, VideoCard
    │   └── lib/           api client, auth context
    ├── .env.example
    └── package.json
```

---

## Local setup

### 1. Prerequisites

- Node.js 20+
- A free Cloudinary account → https://cloudinary.com/users/register_free
  (grab `cloud_name`, `api_key`, `api_secret` from the dashboard)

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
# edit .env and paste your Cloudinary credentials + change JWT_SECRET
npm run start:dev
```

Backend runs on `http://localhost:4000/api`. A `database.sqlite` file is
auto-created on first boot with all tables.

### 3. Frontend

In a **separate terminal**:

```bash
cd frontend
npm install
cp .env.example .env.local   # default points at localhost:4000 — leave as-is
npm run dev
```

Frontend runs on `http://localhost:3000`.

### 4. Try it

1. Open `http://localhost:3000`
2. Click **Join**, create an account
3. Click **Upload**, pick a short video file, publish
4. Open an **incognito window**, sign up as a second user, vote on the first
   user's video
5. Watch the count update on the original tab within ~5 seconds (polling)
6. Try voting twice from the same account — the button toggles; you can't
   stack votes

---

## API reference

| Method | Path                            | Auth    | Body                                    |
| ------ | ------------------------------- | ------- | --------------------------------------- |
| POST   | `/api/auth/signup`              | —       | `{ email, username, password }`         |
| POST   | `/api/auth/login`               | —       | `{ email, password }`                   |
| GET    | `/api/videos`                   | opt     | —                                       |
| POST   | `/api/videos`                   | ✅      | `multipart` (`title`, `description`, `video`) |
| POST   | `/api/videos/:id/votes`         | ✅      | — (toggles)                             |
| GET    | `/api/videos/:id/votes/count`   | —       | —                                       |

Auth tokens are sent as `Authorization: Bearer <jwt>`.

---

## Deployment

The project is structured as two independently deployable apps.

### Backend → Railway / Render / Fly.io

1. Push this repo to GitHub
2. Create a new service pointing at the `backend/` directory
3. Set these env vars in the dashboard:
   - `JWT_SECRET` — a long random string
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`
   - `FRONTEND_URL` — your Vercel URL (for CORS)
   - `PORT` — usually set by the platform; NestJS respects `process.env.PORT`
4. Build command: `npm install && npm run build`
5. Start command: `npm run start:prod`

For production, swap SQLite → Postgres in `backend/src/app.module.ts`:

```ts
TypeOrmModule.forRoot({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, Video, Vote],
  synchronize: false,           // use migrations in prod
  ssl: { rejectUnauthorized: false },
}),
```

### Frontend → Vercel

1. Import the repo in Vercel, set the **root directory** to `frontend/`
2. Add env var: `NEXT_PUBLIC_API_URL=https://your-backend-url/api`
3. Deploy — Vercel auto-detects Next.js and you get a live URL

---

## Design choices & tradeoffs

- **SQLite by default.** Zero config for running the prototype locally.
  Swap one module import for Postgres in production.
- **JWT in localStorage.** Simpler than httpOnly cookies for a prototype. For
  production, move to httpOnly cookies to mitigate XSS.
- **Polling instead of websockets.** Adds ~1 line of code, good enough for
  "near-real-time" on a feed of ~dozens of videos. Swap for `socket.io` or
  SSE once scale demands it.
- **Toggle semantics for voting.** Clicking Vote a second time un-votes. This
  matches user intuition better than a one-shot "you already voted" error,
  while still enforcing exactly one vote per user at any moment.
- **Unique constraint in the DB.** The application-layer check is a guard;
  the DB constraint is the guarantee. A race condition cannot produce two
  vote rows.
- **Cloudinary for storage.** Offloads video storage, CDN delivery, and
  thumbnail generation. The backend stays stateless.

---

## What's deliberately out of scope

- Video deletion / moderation UI
- Password reset flows
- Email verification
- Video transcoding options (Cloudinary handles defaults)
- Comments, follows, feeds-by-popularity

These are straightforward extensions — the data model and auth layer already
support them.
