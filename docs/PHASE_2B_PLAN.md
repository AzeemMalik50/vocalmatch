# Phase 2B — Plan

The schema doc has the canonical list — this is a working plan structured so we can plan sprints, estimate, and share with the client.

---

## What Phase 2B unlocks

Phase 2A delivered the battle engine — admins create matchups, users vote, winners are declared. **Phase 2B closes the loop**: completed battles produce a defending champion, the platform shows that champion publicly, and users can challenge them. This is the retention layer — it turns a one-off vote into a recurring conversation around each song.

It also writes the first real in-app notification (challenger-selected) and adds two homepage modules (Recent Winners, Active Battles) that give returning visitors something fresh to land on.

---

## Schema additions

**New table — `challenge_submissions`**
- `id`, `songId`, `userId`, `videoId`, `status` ('pending' | 'selected' | 'rejected'), `createdAt`, `decidedAt`, `decidedByAdminId`
- Partial unique index `one_active_challenger_per_song` on `(songId) WHERE status IN ('pending','selected')` — Postgres native, SQLite fallback via app-layer check.

**Songs table — already in place from 2A** (no migration needed):
- `currentChampionUserId`, `currentChampionPerformanceId`, `currentChampionStreak` are written on every battle close.

---

## Backend tasks

| # | Task | Notes |
|---|---|---|
| B1 | `POST /songs/:songId/challenges` | User submits a challenge entry. Reuses Phase 1 upload, sets `category = 'challenge_entry'` and `songId`. Returns 409 if `pending`/`selected` already exists for the song. |
| B2 | `GET /admin/challenges` | Filter by `songId` and `status`. Paginated like the rest of the admin endpoints. |
| B3 | `POST /admin/challenges/:id/select` | Marks the submission `selected`. Idempotent. |
| B4 | `POST /admin/challenges/:id/reject` | Marks the submission `rejected`. |
| B5 | `POST /admin/battles/from-challenge/:id` | Creates the next battle pre-filled with the current champion's performance as A and the selected challenger as B. Closes the loop into the existing battles flow. |
| B6 | Champion-streak writeback on battle close | Already happens in `finalizeWinner`; verify it correctly bumps on same-champion wins and resets to 1 on a new champion. |
| B7 | `challenger_selected` notification | Writes a notification (in-app only, no email) to the challenger on `select`. Reuses the existing notifications table from 2A. |
| B8 | Unit tests | Duplicate challenge → 409; battle-from-challenge creates the correct pairing; streak math under same vs new champion. |

---

## Frontend tasks

| # | Task | Notes |
|---|---|---|
| F1 | **"Challenge this / Upload your version"** button | On every battle page (live and completed) where the song has a current champion. Routes signed-in users into the challenge upload; signed-out → `/login?next=…`. |
| F2 | Challenge upload form | Lightweight wrapper over the Phase 1 upload that prefills the song and posts to `/songs/:songId/challenges` instead of `/videos`. |
| F3 | **Winner badge** on completed battle pages | Already partially there in admin detail; replicate for public. |
| F4 | **Defending Champion** label | On the champion's performance card + song page + profile. |
| F5 | **Win streak chip** | "2 wins in a row" badge on profile + battle page when `currentStreak ≥ 2`. |
| F6 | **My pending challenges** profile section | List the user's `pending` / `selected` submissions with status. |
| F7 | Engagement prompts after voting | "Think you can beat this?" → links to challenge upload; "Come back and check the winner" → calendar prompt. |
| F8 | Homepage — **Recent winners** | 3–5 most recent completed battles, with winner avatar and song. |
| F9 | Homepage — **Active battles** | All `status = 'live'` with countdown. Today only the single FeaturedBattle hero shows; this surfaces the rest. |
| F10 | `/admin/challenges` tab | Paginated queue with inline watch, select, reject. Pattern matches `/admin/performances`. |
| F11 | `/admin/champions` tab | Per-song current-champion overview with streak counts. |

---

## Open decisions to lock in before kickoff

1. **Voting window default for challenger battles** — same 48h as 2A, or shorter (24h) to keep momentum?
2. **Can the champion themselves submit a counter-challenge** with a fresh performance? *(Recommended: yes — the streak follows the user, not the video.)*
3. **Reject = soft or hard?** Recommend soft (keep the row with `status = 'rejected'` for audit). Rejected uploads still soft-delete from the public feed.
4. **Auto-suggest songs on the homepage** based on what the visitor has voted on, or keep the queue admin-only? *(Recommend admin-only for 2B; personalization is a 3.x concern.)*

---

## Out of scope (Phase 2C — explicitly deferred)

- **Email delivery** — notification infra exists; transactional email is 2C.
- **Songwriter portal** — `song_submissions` table and approval flow.
- **Public leaderboards** — stats are being written; rendering them is a separate sprint when we have enough data.

---

## Walkthrough deliverable for client sign-off

Loom (3–4 min) demonstrating:
1. Completed battle declares a winner → champion + streak visible on song page
2. Signed-in user hits the battle page, clicks **Challenge this**, uploads → lands in `/admin/challenges`
3. Admin selects challenger → next battle is auto-created and live
4. Challenger gets the in-app notification

---

## Rough estimate

| Section | Effort |
|---|---|
| Backend (B1–B8) | ~3 days |
| Frontend (F1–F11) | ~5 days |
| Testing + Loom + client review | ~1 day |
| **Total** | **~9 days** (1.5–2 weeks calendar with buffer) |
