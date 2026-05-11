# VocalMatch — Functional Blueprint (Phase 2A & 2B)

The complete functional blueprint for VocalMatch before Phase 2A development begins. Covers the full product loop, every actor, every flow, the data model that supports it, and a clean Phase 2A / Phase 2B task split at the end.

> **Revision (post-review by John):** five technical refinements applied —
> (1) `role` enum replaced with boolean flags `isAdmin` / `isSongwriter`,
> (2) new `needs_decision` battle state for tied results,
> (3) one-live-battle-per-song now enforced by a partial unique index in the DB,
> (4) `isChallengeEntry` boolean dropped — the existing `category = 'challenge_entry'` enum is the single source of truth,
> (5) email notifications deferred to Phase 2C — Phase 2A and 2B use in-app notifications only.
>
> **Locked-in by Vincent — Phase 2A is approved to start with these four product decisions:**
> (A) **First battle is manually seeded** — admin handpicks both performances from existing uploads (no Defending Champion or challenge queue exists yet).
> (B) **One active challenger per song at a time** — partial unique index on `challenge_submissions(songId) WHERE status IN ('pending','selected')`. New submissions are rejected at the API while a slot is occupied.
> (C) **Vote percentages are gated per user** — hidden until *the viewing user* has voted on this battle. Logged-out / not-yet-voted users see "Vote to see the leader" instead.
> (D) **Performances used in any battle are not hard-deletable** — soft-delete only (sets `deletedAt`); battle history retains the reference.

---

## 1. The Core Loop

```
Songwriter submits song
        │
        ▼
Admin approves → Centerstage Song
        │
        ▼
Admin creates Battle (1 vs 1) ──────────────────────┐
        │                                           │
        ▼                                           │
Users WATCH → VOTE → SHARE                          │
        │                                           │
        ▼                                           │
Timer ends → Winner declared                        │
        │                                           │
        ▼                                           │
Winner = Defending Champion of the song             │
        │                                           │
        ▼                                           │
Users submit Challenges (Red Phone)                 │
        │                                           │
        ▼                                           │
Admin picks Challenger from queue ──────────────────┘
        │                                           
        ▼                                           
   Next Battle (Champion vs Challenger)             
```

---

## 2. System actors

| Actor | Role on the platform | Phase introduced |
|---|---|---|
| **Songwriter** | Submits original songs to the Centerstage Song pool | Phase 2C (deferred — schema designed now) |
| **Singer / Voter** | Uploads performances, votes in battles, submits challenges | Phase 1 (uploads), Phase 2A (votes), Phase 2B (challenges) |
| **Admin** | Curates songs, creates battles, manages the challenge queue | Phase 2A |

A single `users` table holds all three. **Boolean flags** (`isAdmin`, `isSongwriter`) distinguish the special roles — a person can be both a Singer and a Songwriter (and even an Admin) without needing two accounts. Singer/Voter is the default state for every user, so it has no flag.

---

## 3. End-to-end app flow

This is the full lifecycle of one Centerstage Song from submission to a recurring battle loop.

### Step 1 — Song submission *(Phase 2C, schema ready in 2A)*
A user with `isSongwriter = true` (or any user — TBD per Open Question A1) submits a song:
- Title, artist, optional backing track upload, optional notes
- Submission lands in the **Song Submission Queue** with status `pending`

### Step 2 — Admin reviews & approves the song
Admin opens the dashboard → Song Submissions:
- Reviews each pending song
- **Approves** → song moves into the public Centerstage Songs library, ready to be used in a battle
- **Rejects** → submission marked `rejected`, songwriter can re-submit with changes

### Step 3 — Admin creates the first battle for a Centerstage Song
Admin opens the dashboard → Battles → New:
- Picks the Centerstage Song
- Picks **two performances** of that song (1v1 pairing) — sourced from existing user uploads
- Sets battle title (optional framing line)
- Sets voting window (24h or 48h — admin choice)
- Publishes → battle goes `live`, voting opens immediately

### Step 4 — Users watch the battle
Any visitor lands on the battle page and sees:
- Two videos side-by-side (desktop) / stacked (mobile)
- Battle title, song name, both performers' names
- Live countdown timer
- One CTA: pick A or B
- A **"Vote to see the leader"** placeholder where percentages would appear — vote counts and "Current Leader" are **only revealed after the viewing user has voted on this specific battle**. Logged-out and not-yet-voted users never see the standings.

### Step 5 — Users vote
A signed-in user clicks A or B:
- Their vote is recorded — **one vote per user per battle**, DB-enforced
- The button they clicked is disabled and visually highlighted
- **Vote percentages and the "Current Leader" indicator are revealed for the first time** (per-user gate — see decision C)
- A post-vote message appears: *"You've voted. Share this battle to see who wins."*
- A "Share this battle" button is shown

Logged-out visitors see the videos but neither the percentages nor the leader. The vote buttons prompt them to sign in.

### Step 6 — Users share
"Share this battle" copies the battle URL or opens a native share sheet:
- Shared link goes to the same public battle page
- Phase 2A keeps this basic (URL share); Phase 2B adds copy variants

### Step 7 — Battle closes
When the countdown reaches zero (or admin closes manually):
- Voting is locked — no more votes accepted
- **If clear winner** → battle status → `completed`, winner = performance with most votes
- **If tie** → battle status → `needs_decision`, surfaces in admin dashboard for manual resolution; admin picks the winner, then status → `completed`
- Once `completed`:
  - Winner's user gains a win, `winCount++`, `currentStreak++`
  - Loser's `currentStreak` resets to 0
  - Both performers' `battleCount++`
  - The winner's performance becomes the **Defending Champion** of the Centerstage Song

### Step 8 — Defending Champion is recognized
On the battle page (now closed) and on the Centerstage Song page:
- Winner shown with a **"Winner"** badge and **"Defending Champion"** label
- Win streak displayed if ≥2 ("2 wins in a row")
- Loser still visible with vote count, no negative framing

### Step 9 — Red Phone challenge submission *(Phase 2B)*
On any battle page (live or completed) for a Centerstage Song with a current champion, a "Challenge this / Upload your version" button is shown to signed-in users:
- Opens a simple upload form (reuses Phase 1 video upload)
- User records and uploads their version of the same song
- Submission lands in the **Challenge Queue** for that song with status `pending`

### Step 10 — Admin selects challenger
Admin opens the dashboard → Challenge Queue → filters by song:
- Reviews pending challenges
- Picks one → marks `selected`, the rest stay `pending`
- Creates the **next battle**: Defending Champion's performance vs the selected challenger's performance
- Loop returns to Step 3 — voting opens, the cycle repeats

If the Defending Champion loses, their successor becomes the new Defending Champion of that song.

---

## 4. User stories

### As a Songwriter *(Phase 2C)*
- I can submit a song with title, artist, and an optional backing track
- I can see the status of my submissions (pending / approved / rejected)
- I can re-submit a rejected song with changes
- When my song is used in a battle, I'm credited on the battle page

### As a Singer / Voter
**Uploading (Phase 1, exists):**
- I can upload a performance with title, song name, optional description
- I can delete my own uploads

**Voting (Phase 2A):**
- I can browse active battles
- I can watch both performances side-by-side
- I can vote for the one I prefer — once, final
- I can see who's currently leading and by how much
- I can share a battle after voting
- I can see when a battle ends via a live countdown

**Challenging (Phase 2B):**
- I can challenge a Defending Champion by uploading my version of the song
- I can see my submissions in my profile
- I get an in-app notification if I'm selected for the next battle (email notifications deferred to Phase 2C)

### As an Admin
**Songs:**
- I can review and approve/reject songwriter submissions
- I can create Centerstage Songs directly
- I can edit a Centerstage Song (cover art, backing track, retire it)

**Battles:**
- I can create a new battle by picking a song + 2 performances + voting window
- I can see all battles by status (live, completed, cancelled)
- I can manually close a battle early
- I can cancel a battle if needed (e.g., bad submissions)

**Challenges:**
- I can see all pending challenge submissions per song
- I can select one to face the Defending Champion
- I can reject submissions with optional notes

**Oversight:**
- I can see vote counts and per-user vote audit on any battle (moderation)
- I can see champion lineage per song
- I can promote/demote users to admin

---

## 5. User journeys (screen-by-screen)

### 5A. Voter journey (Phase 2A — primary flow)

```
1. Land on homepage
   → sees featured live battle with countdown
2. Click "Watch & Vote"
   → battle page loads with both videos
3. Watch performance A, watch performance B
4. Click vote on preferred performance
   → instant feedback: button highlighted, disabled
   → percentages animate in
   → "You've voted. Share this battle to see who wins."
5. Click "Share this battle"
   → URL copied to clipboard / native share sheet
6. Return later
   → battle now shows "Completed" with Winner badge
```

### 5B. Singer-as-Challenger journey (Phase 2B)

```
1. View a completed battle with Defending Champion
2. See "Think you can take the crown?" prompt + "Upload your version" CTA
3. Click → upload form (reuses Phase 1)
4. Submit performance for the same song
5. Confirmation: "Your challenge is in the queue."
6. Profile shows: 1 pending challenge for "Hallelujah"
7. (Later) Selected by admin → in-app notification (email notifications deferred to 2C)
8. New battle goes live featuring their performance vs the champion
```

### 5C. Admin journey — running a battle (Phase 2A)

```
1. Sign in → /admin
2. Songs tab → confirm "Hallelujah" is approved & active
3. Battles tab → click "New Battle"
4. Pick song "Hallelujah"
5. Pick performance A from list of "Hallelujah" uploads
6. Pick performance B from list of "Hallelujah" uploads
7. Set voting window: 48 hours
8. Publish → battle goes live, public URL is shareable
9. Monitor live vote counts
10. (48h later) Battle auto-closes, winner recorded, champion crowned
```

### 5D. Admin journey — promoting a challenger (Phase 2B)

```
1. /admin → Challenge Queue
2. Filter by song "Hallelujah" → see 7 pending challenges
3. Watch a few, pick best fit
4. Click "Select for next battle" → status: selected
5. Click "Create battle from this challenge"
6. Battle is pre-filled: Defending Champion vs selected challenger
7. Set window, publish → loop restarts
```

---

## 6. Admin dashboard layout

A single `/admin` route with five tabs. Functional, not pretty.

| Tab | Phase | Contents |
|---|---|---|
| **Songs** | 2A (basic) / 2C (full) | List of Centerstage Songs (active/retired). Phase 2C adds the Song Submission Queue from songwriters. |
| **Battles** | 2A | List of all battles by status. Create / edit / close / cancel. View vote counts per battle. |
| **Challenge Queue** | 2B | Per-song list of pending challenge submissions. Watch, select, reject. |
| **Champions** | 2B | Current champion per song. Reign length. Full lineage history. |
| **Users** | 2A | List of users. Promote/demote admin. Phase 2A only needs basic view + role toggle. |

Auth: every admin endpoint checks `req.user.isAdmin === true` via the existing JWT guard.

---

## 7. Database schema

### Existing tables (Phase 1)
- `users` — extended (see below)
- `videos` (= performances) — extended (see below)

### New tables (Phase 2A)
- `songs` — Centerstage Song pool
- `battles` — 1v1 battle records
- `votes` — per-user-per-battle vote rows

### New tables (Phase 2B)
- `challenge_submissions` — Red Phone queue

### Deferred (Phase 2C)
- `song_submissions` — songwriter submission queue *(schema designed now, table created when 2C ships)*

---

### Table: `users` *(extend existing)*

| Field | Type | Phase | Notes |
|---|---|---|---|
| `id` | uuid | 1 | PK |
| `email`, `username`, `passwordHash` | — | 1 | existing |
| profile fields (`displayName`, `bio`, `avatarUrl`, `voiceType`, `genres`) | — | 1 | existing |
| `winCount`, `battleCount`, `currentStreak`, `championTitle` | int / text | 1 | existing — populated by battle close logic in 2A |
| **`isAdmin`** | bool, default `false` | **2A** | gates the admin dashboard |
| **`isSongwriter`** | bool, default `false` | **2A** | unlocks the songwriter submission portal in 2C |

**Why flags instead of an enum or `user_roles` table?** A user can hold multiple non-exclusive special roles (e.g., admin + songwriter, or songwriter + voter). A single enum forbids that. Boolean flags keep queries simple (`WHERE isAdmin = true`) without the join overhead of a separate `user_roles` table — and Singer/Voter is the *default* state, not a role, so it needs no flag. Easy to migrate to a join table later if we add 5+ roles.

---

### Table: `songs` — Centerstage Songs *(new in 2A)*

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `title` | text | "Hallelujah" |
| `artist` | text | "Leonard Cohen" |
| `trackUrl` | text? | downloadable backing track |
| `coverArtUrl` | text? | for UI |
| `status` | `'active' \| 'retired'` | only `active` shown publicly |
| `currentChampionUserId` | uuid? → `users.id` | denormalized, updated on battle close |
| `currentChampionPerformanceId` | uuid? → `performances.id` | the winning performance currently defending |
| `currentChampionStreak` | int | how many battles in a row the champion has held this song |
| `submittedBySongwriterId` | uuid? → `users.id` | nullable — if approved from a songwriter submission |
| `createdByAdminId` | uuid → `users.id` | audit |
| `createdAt` | timestamp | |

---

### Table: `performances` *(= existing `videos` table, extended)*

| Field | Type | Phase | Notes |
|---|---|---|---|
| existing fields (id, title, url, thumbnailUrl, durationSeconds, uploaderId, etc.) | — | 1 | unchanged |
| `category` | enum | 1 | existing: `'solo' \| 'battle_entry' \| 'challenge_entry'` — single source of truth for whether a video is a Red Phone challenge submission |
| **`songId`** | uuid? → `songs.id` | **2A** | optional — links a performance to a Centerstage Song |
| **`deletedAt`** | timestamp? | **2A** | nullable — set when the user soft-deletes a performance that's been used in a battle. `null` = active. Battles continue to reference it; the feed and profile filter it out. |

Phase 2A note: `battleId` is **not** a column on performances. A performance can appear in many battles (the Defending Champion's performance is reused). The relationship lives on the `battles` table via `performanceAId` / `performanceBId`.

**Why no separate `isChallengeEntry` boolean?** The existing `category` enum already encodes this — `category = 'challenge_entry'` is the one and only marker. Adding a parallel boolean would create two sources of truth that could drift apart.

---

### Table: `battles` *(new in 2A)*

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `songId` | uuid → `songs.id` | both performances must share this song |
| `title` | text? | optional admin-set framing line |
| `performanceAId` | uuid → `performances.id` | side A (typically the Defending Champion's performance) |
| `performanceBId` | uuid → `performances.id` | side B (typically the challenger's performance) |
| `votingOpensAt` | timestamp | when voting opens (battle goes live) |
| `votingClosesAt` | timestamp | when the timer hits zero |
| `status` | `'live' \| 'needs_decision' \| 'completed' \| 'cancelled'` | state machine — see §8 |
| `winnerPerformanceId` | uuid? → `performances.id` | set on close (after admin decision if tied) |
| `winnerUserId` | uuid? → `users.id` | set on close |
| `voteCountA`, `voteCountB` | int | denormalized counts; incremented on each vote — fast reads |
| `createdByAdminId` | uuid → `users.id` | audit |
| `tieResolvedByAdminId` | uuid? → `users.id` | audit — set only when a tie is admin-resolved |
| `createdAt`, `closedAt` | timestamp | |

**Battle History** = `SELECT * FROM battles WHERE status = 'completed' ORDER BY closedAt DESC`. No separate table.

**Database constraint — one live battle per song:**
```sql
CREATE UNIQUE INDEX one_live_battle_per_song
  ON battles (songId)
  WHERE status IN ('live', 'needs_decision');
```
This is a partial unique index (Postgres native). It guarantees at the storage layer that no song can have two open battles concurrently — the rule isn't relying on UI or app-layer checks. SQLite (local dev) doesn't support partial unique indexes natively, so an app-layer check serves as a fallback there.

---

### Table: `votes` *(new in 2A)*

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `battleId` | uuid → `battles.id` | |
| `userId` | uuid → `users.id` | |
| `performanceId` | uuid → `performances.id` | which side they voted for (A or B) |
| `createdAt` | timestamp | |

**UNIQUE (`battleId`, `userId`)** — one vote per user per battle, DB-enforced. Second vote returns 409 (matches Phase 1's existing reject-second-vote pattern).

---

### Table: `challenge_submissions` *(new in 2B)*

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `songId` | uuid → `songs.id` | which song the user is challenging for |
| `performanceId` | uuid → `performances.id` | the challenge video |
| `challengerUserId` | uuid → `users.id` | |
| `status` | `'pending' \| 'selected' \| 'rejected' \| 'used'` | lifecycle |
| `selectedForBattleId` | uuid? → `battles.id` | set when admin pairs them |
| `adminNotes` | text? | private |
| `createdAt`, `decidedAt` | timestamp | |
| `decidedByAdminId` | uuid? → `users.id` | audit |

**Database constraint — one active challenger per song (Vincent's decision B):**
```sql
CREATE UNIQUE INDEX one_active_challenger_per_song
  ON challenge_submissions (songId)
  WHERE status IN ('pending', 'selected');
```
This guarantees at the storage layer that a song can never have two active challengers competing for the slot. New submission attempts return 409 with the message "There's already an active challenger for this song. Try again later." SQLite local-dev fallback uses an app-layer check.

---

### Table: `song_submissions` *(deferred to 2C — schema designed now)*

| Field | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `submitterUserId` | uuid → `users.id` | the songwriter |
| `title`, `artist` | text | proposed song |
| `trackUrl` | text? | optional uploaded backing track |
| `notes` | text? | songwriter notes for admin |
| `status` | `'pending' \| 'approved' \| 'rejected'` | lifecycle |
| `approvedSongId` | uuid? → `songs.id` | set when approved into the songs table |
| `decidedByAdminId` | uuid? → `users.id` | audit |
| `decidedAt`, `createdAt` | timestamp | |

---

## 8. Battle state machine

```
admin creates battle ──▶ live ──┬──(timer expires, clear winner)──▶ completed
                                │                                       │
                                │                                       ├─ winner → Defending Champion
                                │                                       ├─ winCount, battleCount, streak updated
                                │                                       └─ permanent battle history record
                                │
                                ├──(timer expires, tie)──▶ needs_decision ──(admin picks winner)──▶ completed
                                │
                                └──(admin cancels)──▶ cancelled (no stat changes)
```

`needs_decision` is a real, queryable state — the admin dashboard surfaces these so ties can't fall through the cracks. Stats and champion writeback only happen on transition to `completed`.

---

## 9. Core system validation — does the loop hold?

A check that every loop transition has a real piece of data backing it:

| Loop step | Data backing it | Verified by |
|---|---|---|
| Centerstage Song exists | `songs` row, `status = 'active'` | admin approval flow |
| Battle starts | `battles` row, `status = 'live'`, `votingOpensAt <= now < votingClosesAt` | timer + DB constraint |
| Only one live battle per song | partial unique index on `battles(songId) WHERE status IN ('live','needs_decision')` | DB-enforced |
| Vote is one-per-user | UNIQUE (`battleId`, `userId`) on `votes` | DB-enforced (returns 409) |
| Winner determination | `voteCountA` vs `voteCountB` on close — tie → `needs_decision` for admin | atomic on battle close |
| Defending Champion exists | `songs.currentChampionUserId` set | updated on every battle close |
| Challenger queue is real | `challenge_submissions` rows, `status = 'pending'` | admin reviews |
| Only one active challenger per song | partial unique index on `challenge_submissions(songId) WHERE status IN ('pending','selected')` | DB-enforced |
| Vote percentages gated per user | `GET /battles/:id` returns counts only if requester has voted on this battle | API-enforced |
| Performances in battles are soft-delete only | `DELETE /videos/:id` returns 409 if the video has any `battles` reference; otherwise sets `deletedAt` | API + DB check |
| Next battle pairing | new `battles` row with `performanceAId` = champion's perf, `performanceBId` = selected challenger's perf | admin "Create battle from this challenge" action |

**Conclusion:** every transition in the core loop maps to one DB write or one DB query. No magic, no untracked state.

---

## 10. Phase 2A — task list

The minimum viable battle + voting experience.

### Backend (Phase 2A)
- [ ] Migrate: add `isAdmin` and `isSongwriter` boolean columns to `users` (default false)
- [ ] Migrate: add `songId` and `deletedAt` columns to `videos` (performances)
- [ ] Update `DELETE /videos/:id`: return 409 if video is referenced by any `battles` row (as A or B); otherwise set `deletedAt` instead of removing the row
- [ ] All read endpoints (feed, profile, search) filter out `deletedAt IS NOT NULL` — battle pages still resolve them
- [ ] Create `songs` table + admin CRUD endpoints
- [ ] Create `battles` table with `status` enum including `needs_decision` + admin create/close/cancel/resolve-tie endpoints
- [ ] Create partial unique index `one_live_battle_per_song` on `battles(songId) WHERE status IN ('live','needs_decision')` — Postgres
- [ ] App-layer fallback check for the same constraint when running on SQLite (local dev)
- [ ] Create `votes` table with UNIQUE (`battleId`, `userId`)
- [ ] `POST /battles/:id/vote` endpoint with auth + DB constraint enforcement
- [ ] `GET /battles/:id` — vote counts, percentages, and "Current Leader" are returned **only if** the requesting user has voted on this battle (per Vincent's decision C). Anonymous and not-yet-voted users get a sanitized response without standings.
- [ ] `GET /battles?status=live` for homepage feature
- [ ] Cron / scheduled job: every minute, close expired battles — clear winner → `completed`; tied → `needs_decision`
- [ ] `POST /admin/battles/:id/resolve-tie` — admin picks winner from a tied battle, transitions `needs_decision → completed`
- [ ] Admin guard: middleware checking `req.user.isAdmin === true`
- [ ] Admin endpoints: list users, toggle `isAdmin` / `isSongwriter` flags
- [ ] In-app notification table + minimal write/read endpoints (foundation for 2B challenger-selected notifications; **no email** — deferred to 2C)

### Frontend (Phase 2A)
- [ ] `/admin` dashboard skeleton (Songs / Battles / Users tabs) — including a "Needs decision" bucket for tied battles
- [ ] `/admin/battles/new` form (pick song, pick 2 performances, set window)
- [ ] `/battle/:id` public battle page:
  - [ ] Two videos side-by-side (desktop) / stacked (mobile)
  - [ ] Battle title, performer names, song name
  - [ ] Live countdown timer
  - [ ] Vote A / Vote B buttons (logged-in only)
  - [ ] Pre-vote state: "Vote to see the leader" placeholder where percentages will appear
  - [ ] Post-vote state: highlighted button, disabled controls, **"Current Leader" indicator and percentages revealed for the first time** (per-user gate)
  - [ ] "You've voted. Share this battle." message
  - [ ] Share button (basic URL copy)
- [ ] Homepage update: feature one live battle
- [ ] "Completed" state on battle page when timer expires
- [ ] Mobile-first responsive — primary priority

### Walkthrough deliverable
- Live testable URL
- 3-min Loom showing: admin creates battle → user votes → timer expires → winner declared

---

## 11. Phase 2B — task list

Adds the engagement/retention layer on top of 2A.

### Backend (Phase 2B)
- [ ] Migrate: add `currentChampionStreak` column to `songs` (if not added in 2A) — *no `isChallengeEntry` boolean; existing `category = 'challenge_entry'` enum is the single source of truth*
- [ ] Create `challenge_submissions` table with partial unique index `one_active_challenger_per_song` on `(songId) WHERE status IN ('pending','selected')` — Postgres native; SQLite fallback via app-layer check (per Vincent's decision B)
- [ ] `POST /songs/:songId/challenges` — user submits a challenge (uploads video tied to song). Returns 409 if a `pending` or `selected` challenge already exists for this song.
- [ ] `GET /admin/challenges?songId=...&status=pending` — list pending
- [ ] `POST /admin/challenges/:id/select` — mark selected
- [ ] `POST /admin/challenges/:id/reject` — mark rejected
- [ ] `POST /admin/battles/from-challenge/:id` — create the next battle pre-filled with champion vs selected challenger
- [ ] On battle close: update `currentChampionStreak` (increment if same champion, reset to 1 if new)
- [ ] Write an in-app notification to the selected challenger when their submission is picked (reuses notification table from 2A; **no email**)

### Frontend (Phase 2B)
- [ ] **Winner badge** on completed battle page (prominent)
- [ ] **Defending Champion** label on champion's performance + song page
- [ ] Win streak chip ("2 wins in a row") on profile + battle page when ≥2
- [ ] **"Challenge this / Upload your version"** button on every battle page for the song's defending champion
- [ ] Challenge upload form (reuses Phase 1 upload, prefills song)
- [ ] Profile section: "My pending challenges"
- [ ] Engagement prompts after voting:
  - [ ] "Think you can beat this?"
  - [ ] "Upload your version"
  - [ ] "Come back and check the winner"
- [ ] Homepage section: Recent winners (3-5 most recent completed battles)
- [ ] Homepage section: Active battles (all `status = 'live'` battles)
- [ ] `/admin` Challenge Queue tab with watch / select / reject
- [ ] `/admin` Champions tab showing current champion + streak per song

### Walkthrough deliverable
- Updated live URL
- 3-min Loom showing: champion declared → user uploads challenge → admin selects → next battle goes live

---

## 12. Phase 2C — deferred (Songwriter portal + email)

Schema is designed now (`song_submissions` table above), but build is deferred. When 2C ships:
- Songwriter signup flow (or `isSongwriter` flag toggle on existing user)
- `/songwriter/submit` form
- `/songwriter/submissions` status page
- Admin `Song Submissions` tab in `/admin` (separate from manually-created songs)
- Approval flow that promotes a `song_submission` into a `song`
- **Email infrastructure** (Resend or similar) — wire transactional email for: challenger-selected, battle-starting-soon, battle-results, password reset. Until 2C ships, all notifications are in-app only.

---

## 13. Open questions — please confirm before 2A development starts

Each has my recommended default. Quick yes / override is fine.

### A. Roles & access
1. **Can any user submit songs (Phase 2C), or do they need the `isSongwriter` flag applied by admin first?** *Recommend: any user can submit; the `isSongwriter` flag just unlocks a richer submitter dashboard with submission history.*
2. **Can `isAdmin` be toggled in-app**, or only by direct DB edit? *Recommend: in-app, by an existing admin.*

### B. Battle creation (Phase 2A)
3. **For the very first battle of a song (no champion yet), can admin pick any 2 performances, or must they pick from a specific pool?** *Resolved (Vincent): the first battle for any song is **manually seeded** by admin from existing user uploads. Admin handpicks both performances since there's no Defending Champion yet and no challenge queue.*
4. **Voting window default — 24h or 48h?** *Recommend: 48h, admin can shorten per battle.*
5. **Can multiple battles run simultaneously?** *Recommend: yes, but only one "featured" on the homepage.*
6. **Can the same song have two concurrent battles?** *Recommend: no — keeps the champion lineage clean.*

### C. Voting (Phase 2A)
7. **Can a participant vote in their own battle?** *Recommend: no — feels rigged. Block at API.*
8. **Can logged-out visitors see vote percentages?** *Resolved (Vincent): no. Percentages are gated behind voting — see #9.*
9. **Vote percentages — when are they revealed?** *Resolved (Vincent): hidden until **the viewing user** has cast their vote on this battle. Per-user gate, not a global "first vote" gate. This pushes voting before peeking and keeps the experience honest. Logged-out and not-yet-voted users see "Vote to see the leader" instead of percentages.*
10. **Tie at close — what happens?** *Resolved: admin decides. Tied battles transition to a real `needs_decision` state, surfaced in the admin dashboard. Stats and champion writeback only fire after admin picks a winner.*
11. **Vote is final — confirmed?** *Per client message, yes. No vote changes allowed (matches Phase 1's 409 pattern).*

### D. Champion logic (Phase 2B)
12. **If the champion's performance "wins" a second battle (vs a different challenger), does the same performance keep defending, or does the champion need to upload a new performance for each battle?** *Recommend: same performance keeps defending — simpler, and the win streak is on the user, not the video.*
13. **What if the champion is the same user but uploads a fresh performance and the admin uses that one?** *Recommend: allowed; streak continues because it's tied to the user.*
14. **Win streak — does it reset on a loss only, or also on a long inactivity gap?** *Recommend: resets on loss only. Inactivity doesn't kill the streak.*

### E. Challenges (Phase 2B)
15. **Challenge queue depth per song?** *Resolved (Vincent): only **one active challenger per song at a time** (across all users). The queue holds at most one submission in `pending` or `selected` state per song. New submissions are rejected at the API while one is already active — keeps the system clean. Once admin processes the current challenger (selects → battle runs → completes, OR rejects), the slot opens up for the next submission. Enforced via partial unique index at the DB level.*
16. **Auto-rejection of stale challenges** — e.g., if a challenge sits in queue for 30+ days, auto-reject? *Recommend: defer to Phase 2C; admin reviews manually for now.*
17. **Can the Defending Champion submit a challenge for their own song?** *Recommend: no — they're already the champion.*

### F. Sharing (Phase 2A)
18. **Share = URL copy (basic), or native Web Share API where available?** *Recommend: native if available, fallback to copy.*
19. **Should shared link include a UTM tag** so we can track viral votes? *Recommend: yes, basic `?ref=share`.*

### G. Edge cases
20. **What if a performance gets deleted by its uploader after being used in a battle?** *Resolved (Vincent): performances used in any battle are **not hard-deletable**. Soft-delete only — `deletedAt` timestamp set, performance hidden from feed and profile, but the battle and its history continue to reference it. The `DELETE /videos/:id` endpoint blocks hard delete with 409 if the performance has any associated `battles` row (as A or B side, in any status).*
21. **What if both performances in a battle are by the same user?** *Recommend: blocked at admin creation — feels rigged.*
22. **What if a performance is from a banned user?** *Recommend: admin gets a warning when picking; can override.*

---

## 14. Phase 2A vs Phase 2B — at-a-glance task split

| Concern | Phase 2A | Phase 2B |
|---|---|---|
| **Songs** | CRUD by admin | + champion lineage view |
| **Performances** | tag with `songId` | + set `category = 'challenge_entry'` on Red Phone uploads |
| **Battles** | 1v1 creation, live, completed, cancelled, timer, vote counts | + "Create from challenge" shortcut |
| **Voting** | one-per-user, final, DB-enforced, percentages, leader, share | unchanged |
| **Winner declaration** | recorded in DB, basic UI | + prominent Winner badge, Defending Champion label, streak |
| **Challenges** | — | full Red Phone flow + challenge queue |
| **Engagement prompts** | post-vote share prompt | + "Think you can beat this?" / "Upload your version" / "Come back" |
| **Homepage** | one featured live battle | + recent winners, active battles section |
| **Admin** | Songs, Battles, Users tabs (with "Needs decision" bucket for tied battles) | + Challenge Queue, Champions tabs |
| **Notifications** | in-app notification table + read/write APIs (foundation only) | + in-app notification on challenger selection |
| **Email** | — | — *(deferred to 2C)* |

Once the open questions in §13 are answered, Phase 2A is unblocked.
