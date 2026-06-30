# VOCALMATCH — App Functionality & Flow by Actor

**Audience:** end users, product stakeholders, anyone explaining what the platform does today.
**Last updated:** 2026-06-10 (reflects current `phase3-a` branch state)

---

## 1. One-paragraph pitch

VOCALMATCH is a continuous song competition. The platform picks songs ("Centerstage Songs"). For each song, two singers perform their own version in a 1-on-1 battle. The audience votes, and the winner becomes the **Official Voice** of that song. Anyone can challenge a champion via the **Red Phone Challenge**. The defending champion holds the title until someone takes it. Every dethronement is a moment; every challenge is a shot at fame.

---

## 2. Core Concepts (glossary)

| Term | Meaning |
|---|---|
| **Centerstage Song** | A song the platform runs battles over. Created by admins. |
| **Performance** | A user-uploaded video of a singer performing a song. |
| **Battle** | A 1-on-1 contest between two performances of the same song, with a voting window and a timer. |
| **Official Voice** | The current champion of a song — the singer who last won a battle on it. |
| **Crown** | The title held by the Official Voice. Metaphor for the championship of a song. |
| **Win Streak** | The number of consecutive wins the champion has on this song (incl. the initial coronation). |
| **Title Defense** | A successful defense of the crown — derived as `streak − 1` (initial coronation isn't a defense). |
| **Crown at Risk** | A computed risk score (0–100% survival chance) reflecting how likely the current champion is to lose their crown soon. Banded LOW / MODERATE / HIGH / CRITICAL. |
| **Dethronement** | A battle where the previous champion is unseated by a new winner. |
| **Red Phone Challenge** | The path a non-champion takes to challenge a song's crown: Download the track → Record your version → Upload → If selected by admin, you face the champion. |
| **Challenger** | A user who has submitted a Red Phone challenge and is awaiting selection (or has been selected). |

---

## 3. Actors at a glance

| Actor | Authentication | Can do |
|---|---|---|
| **Anonymous Visitor** | None | Browse the homepage, see live battles, read song catalog, see public profiles. Cannot vote, upload, or challenge. |
| **Registered User** | JWT | Everything above + manage own profile, vote in battles, receive notifications. |
| **Singer (any registered user)** | JWT | + Upload performances + submit Red Phone challenges. |
| **Champion (current Official Voice of ≥1 song)** | JWT | + Sees personalized "Your Crown at Risk" panel + appears as Defending Champion site-wide if longest streak. |
| **Challenger (pending submission)** | JWT | Waits for admin selection. If selected, is auto-entered into a battle against the current champion. |
| **Admin** | JWT + `isAdmin` flag | Full admin dashboard: songs, performances, challenges, battles, users, champions. Cannot use the singer/voter surface (no upload CTA). |
| **System (Scheduler)** | n/a | Auto-closes expired battles, picks winners, marks ties for admin resolution, pushes live vote counts via SSE. |

Most flesh-and-blood users are simultaneously **Singer + Voter + (maybe) Champion + (maybe) Challenger** — the roles overlap on one account.

---

## 4. Detailed flows per actor

### 4.1 Anonymous Visitor

**Who they are:** A first-time arrival, link click from social, organic search.

**What they see on the homepage (top → bottom):**

1. **Hero** — "One Song. Two Voices. One Crown." with the cinematic composite, real platform stats (Votes Cast, Battles, Challengers, Voices Raised) pulled from `GET /api/stats`, and two CTAs (Watch & Vote, Take the Stage).
2. **Live Battle** banner — currently-live battle with vote percentages hidden until vote is cast; the **5 Pillars** ribbon ("Anyone Can Challenge", "The Audience Decides", "The Voice Can Be Taken at Any Time", "Gain Fame Go Viral", "Defend Your Crown").
3. **Crown at Risk** panel — the marquee song's survival ring + risk band.
4. **Red Phone Challenge** — the 4-step flow: Download → Record → Upload → If Selected.
5. **Defending Champion** — the marquee song's current Official Voice with Win Streak + Title Defenses.
6. **Dethroned!** panel — the most recent crown change site-wide.
7. **How It Works** — 4 step icons explaining the loop.
8. **The Stage** — recent uploaded performances (with search, voice-type filter, genre filter).
9. **Recent Winners** — completed battles, newest first.
10. **Share Cards** — TikTok / Instagram / Facebook / copy-link share affordances.

**Boundaries:**

- Clicking "Watch & Vote" → scrolls to Live Battle. Clicking the live battle → `/battle/[id]`. The vote panel asks them to sign in.
- Clicking "Take the Stage" or "Upload" → `/signup?next=/upload`.
- Clicking a performance card → `/v/[id]`. Public view, no vote shown until logged in.

**Why they convert:** The Hero + Dethroned panel sells the drama; the personal pillars convert browse → signup.

---

### 4.2 Registered User (base account)

**Who they are:** Created an account via `/signup`. Maybe completed `/onboarding` (voice type, genres, photo).

**Account surfaces:**

| Surface | What it does |
|---|---|
| `/onboarding` | Choose voice type (soprano…bass), genres, profile photo. A homepage banner nudges incomplete profiles. |
| `/settings` | Change email, change password, delete account. |
| `/u/[username]` | Public profile — performances, stats. |
| Notification bell (top-right of Nav) | Lists notifications: challenger selected, battle starting, battle result, system messages. |

**Auth state effects on the homepage:**

- Hero CTA changes: "Take the Stage" → `/upload` (instead of `/signup?next=/upload`).
- Crown at Risk + Dethroned panels run a hybrid personalization lookup (see §5.1).
- The Nav shows the avatar menu with @username, Edit profile, Sign out.

**Everything in §4.1 also applies.**

---

### 4.3 Voter

Any registered user becomes a voter the moment they click a vote button on `/battle/[id]`.

**Vote flow:**

1. Open a live battle's page.
2. See both performances (A + B), the countdown to `votingClosesAt`, and the song title.
3. Vote counts and percentages are **hidden until you vote** — prevents bandwagon bias.
4. Pick A or B. The vote is **final** (one vote per user per battle, enforced by DB unique constraint).
5. After voting, the page reveals live vote counts via SSE — counts update in real time as others vote.

**After voting:**

- The "Share this battle" CTA appears.
- If you vote for the eventual loser, that battle becomes eligible to surface in **your** Dethroned panel under voter-fallback mode (see §5.1).

---

### 4.4 Singer (user who uploads performances)

**Two paths to upload:**

| Path | Trigger | Result |
|---|---|---|
| **Solo upload** | `/upload` | Standalone performance posted to The Stage. Doesn't enter a battle automatically. |
| **Red Phone challenge** | Click "Take the Stage" / "Challenge Now" → `/upload?challenge=1` | Performance is tagged as a `challenge_entry` for a specific Centerstage Song. Awaits admin selection. |

**Red Phone Challenge step-by-step:**

```
1. Pick the Centerstage Song you want to challenge.
2. Download the official track (link in /upload?challenge=1 UI).
3. Record your version of that song.
4. Upload your video.
5. Submission goes into the admin's pending queue.
6. If admin SELECTS your submission → a battle is automatically created
   pairing you against the current champion.
7. You receive a "challenger selected" notification + a "battle starting"
   notification when voting opens.
8. If you win → you become the new Official Voice. Dethronement event fires.
9. If you lose → no penalty, performance stays on your profile.
```

**Singer-only surfaces:**

- Their performances appear on their `/u/[username]` profile.
- They can soft-delete a performance (visible-to-them only) IF it hasn't been in a battle yet. Battle-historic performances are hard-delete-blocked to preserve history.

---

### 4.5 Champion (current Official Voice)

A singer becomes a Champion when they win any battle on a Centerstage Song.

**Champion-specific experience:**

- **"Your Crown at Risk" panel** on the homepage (instead of the marquee version) when they're signed in. Shows the most-dangerous of their songs, with the survival ring + risk band.
- **"You Just Lost the Crown"** variant of the Dethroned panel if they were dethroned recently.
- Their `User.currentStreak` counter increments after each win.
- The song they champion gets `Song.currentChampionStreak` bumped (or reset to 1 on takeover).
- If they have the longest active streak across all songs, they're the marquee Defending Champion site-wide.

**Stats shown on their championship card:**

- **Win Streak** = consecutive wins as champion of this song (incl. coronation)
- **Title Defenses** = `Win Streak − 1` (defenses are wins AFTER the coronation)

**What threatens them:**

- Every accepted challenger increases the song's `pendingChallengers` count, which drops survival chance.
- A close last-battle margin (<10%) also drops survival chance.
- They lose the crown the next time a battle resolves with a different winner.

---

### 4.6 Challenger (pending submission)

A singer whose challenge submission is in the queue, not yet acted on by admin.

**States:**

- `pending` — admin hasn't decided yet
- `selected` — admin chose them; a battle is being set up
- `rejected` — admin declined this submission

**Visible to the challenger:**

- The submission appears in their `MyChallenges` list (account surface).
- If selected, they get a notification + the battle URL.
- If rejected, they get a system notification.

**Invariant:** at most one PENDING/SELECTED submission per (user, song) — enforced by DB.

---

### 4.7 Admin

**Access:** `isAdmin = true` on the User row + JWT.

**Admin Dashboard surfaces (`/admin/*`):**

| Page | What it does |
|---|---|
| `/admin` | Top-level overview. |
| `/admin/songs` | Create, retire, restore Centerstage Songs. |
| `/admin/performances` | Browse all performances, mark video moderation issues. |
| `/admin/challenges` | Triage the pending Red Phone Challenge queue: select or reject. |
| `/admin/battles` | List all battles. |
| `/admin/battles/new` | Create a battle directly (pair two specific performances). |
| `/admin/battles/[id]` | Resolve ties — when a battle ends with equal vote counts, admin picks the winner manually. |
| `/admin/users` | User list, ban / unban / promote. |
| `/admin/champions` | Browse current champions across songs. |

**Admins do not see the singer surface:**

- No "Upload" CTA in Nav.
- The homepage redirects admin users to `/admin` on landing (defensive — admins are operators, not contestants).

**Admin's role in the loop:**

```
Songwriter / catalog team → admin creates Centerstage Song
   ↓
Singers submit Red Phone challenges
   ↓
Admin selects a challenger → battle is scheduled
   ↓
Voting window opens → audience votes
   ↓
Scheduler closes battle on time
   ↓
If tied → admin resolves tie manually
   ↓
Champion is set/changed automatically
```

---

### 4.8 System (Scheduler)

**Automated processes running without human action:**

| Job | Trigger | What it does |
|---|---|---|
| Battle auto-close | `@Cron` on `BattlesService.findExpiredLive()` | Every minute, find battles whose `votingClosesAt` has passed. If clear winner → mark `completed`, set winner, update champion + streak. If tie → mark `needs_decision` for admin. |
| Champion writeback | After each clear-winner close | Update `Song.currentChampionUserId`, `currentChampionPerformanceId`, `currentChampionStreak`. |
| Real-time vote push | On every cast vote | Publish new vote counts to SSE channel `battle:<id>` so the battle page updates without a refresh. |
| Real-time status push | On battle close | Publish winner info to SSE so spectators see the result live. |

**SSE channel** (`GET /api/stream?token=...&battleId=...`):

- Vote-count updates while battles are live.
- Status update when a battle closes.
- Gated by auth token in the query string (EventSource can't send custom headers).

---

## 5. System mechanics worth knowing

### 5.1 Hybrid personalization (signed-in users)

When a signed-in user opens the homepage, the Crown at Risk + Dethroned panels run a **3-state lookup**:

```
1. Try the personal endpoint:
   - Champion view: songs the user currently champions
   - Voter fallback: songs the user has voted in where the champion is HIGH/CRITICAL risk
2. If personal returns data → render with "YOUR CROWN AT RISK" eyebrow + gold "FOR YOU" pill
3. If personal returns [] → fall back to the marquee endpoint
4. If marquee also empty → panel doesn't render
```

Anonymous visitors skip step 1 and 2 entirely.

### 5.2 Risk model (Crown at Risk)

```
Survival chance starts at 100%.
- Subtract 10 per pending challenger (cap −60)
- Subtract 15 if the last completed battle margin was < 10%
Clamp to [5, 100].

Risk band:
  71–100 → LOW       (green ring)
  41–70  → MODERATE  (yellow ring)
  21–40  → HIGH      (light-red ring)
   0–20  → CRITICAL  (deep-red ring + crimson pulse)
```

### 5.3 Vote-percentage gate

The full vote counts and leader for a battle are **only revealed**:

- After the caller has cast a vote on that battle, OR
- To admins (any time), OR
- When the battle has reached `completed` / `cancelled` status (anyone can see final).

This is a deliberate UX choice: prevent bandwagon voting while a battle is live.

### 5.4 Tie resolution

If a battle hits its timer with `voteCountA === voteCountB`, the scheduler marks it `needs_decision` instead of picking a winner. An admin visits `/admin/battles/[id]` and chooses the winner manually. The champion writeback then runs as normal.

### 5.5 Champion lineage

The platform never deletes the history. The champion of a song at any past moment is reconstructable by reading completed battles ordered by `closedAt`. The denormalized `Song.currentChampion*` fields exist only for fast reads on the marquee surfaces.

---

## 6. Lifecycle of a Centerstage Song

```
1. Admin creates Song "Hallelujah" (status=active).
2. First two singers upload performances tagged with songId.
   Admin creates Battle 1 manually (or accepts two challenge submissions).
3. Battle 1 ends. Winner = User X. Song.currentChampionUserId = X.
   Streak = 1. Title Defenses = 0. X is now Official Voice of Hallelujah.
4. Other singers submit Red Phone challenges for Hallelujah.
   Pending count rises → Crown at Risk survival chance drops.
5. Admin selects a challenger Y. Battle 2 starts: X vs Y.
6a. Battle 2: X wins again. Streak = 2. Title Defenses = 1. X retains.
6b. Battle 2: Y wins. Dethronement! New champion = Y. Streak = 1. Defenses = 0.
    Site-wide "DETHRONED!" panel surfaces this for 24+ hours.
7. Process repeats indefinitely. Song lineage = entire battle history.
```

---

## 7. Lifecycle of a single Battle

```
status: live
  ├─ both performances visible, no vote counts to anonymous/non-voted users
  ├─ voters can cast (one per user, final)
  ├─ SSE channel pushes live counts to those who have voted
  ├─ countdown ticks toward votingClosesAt
  ↓
status: completed (clear margin) OR needs_decision (tie)
  ├─ If clear: winner set, champion writeback runs
  ├─ If tie: admin resolves on /admin/battles/[id] → then completed
  ↓
status: completed
  ├─ Vote counts public to everyone
  ├─ Winner displayed with banner
  ├─ Eligible to appear in Dethroned panel + Recent Winners
  └─ Eligible for share via OG metadata + dynamic OG image
```

A battle can also be **cancelled** by an admin before closing (rare; abuse / mistake scenarios).

---

## 8. Engagement loop (why users come back)

```
        ┌─────────────────┐
        │   Discover      │  See homepage drama, find a song you care about
        └────────┬────────┘
                 ↓
        ┌─────────────────┐
        │   Vote          │  Cast a vote on a live battle; reveal percentages
        └────────┬────────┘
                 ↓
        ┌─────────────────┐
        │   Engage        │  Notification: result, dethronement, your pick
        └────────┬────────┘
                 ↓
        ┌─────────────────┐
        │   Compete       │  Take the stage via Red Phone Challenge
        └────────┬────────┘
                 ↓
        ┌─────────────────┐
        │   Defend        │  Win → become Official Voice → defend the crown
        └────────┬────────┘
                 ↓
        ┌─────────────────┐
        │   Share         │  Battle/winner OG cards drive viral discovery
        └────────┬────────┘
                 │
                 └────► back to Discover (new audience)
```

The Crown at Risk indicator, the personalized "Your Crown at Risk" + "You Just Lost the Crown" panels, and the dethronement notifications are designed to maximize **return visits per user per week**.

---

## 9. What's live today vs roadmap

### Live (Phase 3 + 3.0 personalization)

- ✅ Full homepage with all 8 emotional pillars + bespoke artwork
- ✅ Public stats, songs, battles, dethronements endpoints
- ✅ Crown at Risk survival model + per-user hybrid personalization
- ✅ Dethroned panel + per-user "Your Crown / Your Pick" variants
- ✅ Red Phone Challenge end-to-end (submit → admin select → battle)
- ✅ Title Defenses stat + Win Streak on champion card
- ✅ OG / Twitter card metadata, dynamic per-battle OG image
- ✅ Cinematic dark theme pinned site-wide (all interior pages: login, settings, profile, video, battle, admin)
- ✅ Real-time SSE for live vote counts
- ✅ Auth (signup, login, onboarding, settings), JWT
- ✅ Notification bell + notification feed
- ✅ Admin dashboard for songs, performances, challenges, battles, users, champions
- ✅ Backend test suite (34 tests passing)
- ✅ Accessibility pass on homepage + Nav (aria, focus rings, reduced-motion, contrast)

### Roadmap (Phase 3.1 and beyond)

- 🟡 Real-time SSE push for "your crown is being challenged" + "you just got dethroned"
- 🟡 Rich per-battle OG image with actual singer portraits and vote bars (currently text-only)
- 🟡 Downloadable winner card PNG / battle clip MP4
- 🟡 Share button + OG metadata for `/v/[id]` performance pages
- 🟡 Per-song defense history surface on `/u/[username]`
- 🟡 All-time leaderboards (Top Defenders, Most Challenged Songs)
- 🟡 Frontend test suite
- 🟡 Vercel deployment pipeline + GitHub Actions CI
- 🟡 Post-launch engagement features per Vincent's roadmap: voting streaks, Talent Scout rankings, community leaderboards, champion history records, user achievement systems

---

## 10. End-user quick reference card

> **"I want to…"**

| Goal | Path |
|---|---|
| Watch a live battle | Homepage → Watch & Vote → `/battle/[id]` |
| Vote on a battle | Open the battle → pick A or B (must be signed in) |
| Upload a performance | Sign in → Upload (top-right) or "Take the Stage" |
| Challenge a champion | Homepage → Challenge Now → `/upload?challenge=1` → pick the song |
| See my championships | Sign in → Homepage (Your Crown at Risk panel) OR `/u/[me]` |
| Edit my profile | Avatar menu → Edit profile → `/settings` |
| Find a singer | Homepage → The Stage section (search + filters) |
| Share a battle | Battle page → Share button (native share / clipboard) |
