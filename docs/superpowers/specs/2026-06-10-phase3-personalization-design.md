# Phase 3 Personalization — Design Spec

**Date:** 2026-06-10
**Branch (intent):** `phase3-a` (current working branch — commits will continue here, merge to `phase-3` after)
**Status:** Approved, ready for implementation plan

## Problem

The Phase 3 homepage's Crown at Risk and Dethroned panels render only **one** site-wide story (the marquee song / the most-recent dethronement). Every signed-in user sees the same content regardless of whether they're personally involved. The audit confirmed this is the biggest reason the page reads as a spectator experience rather than a "your stakes are on the line" experience.

## Goal

Make the Crown at Risk and Dethroned panels personally relevant to the signed-in user, while preserving the marquee fallback for anonymous visitors. Out of scope: real-time push, rich shareable image assets, performance sharing, defense history pages — all become Phase 3.1.

## Hybrid semantics

Both panels run a two-stage lookup:

1. **Champion view (preferred)** — based on the user being the current champion of a song or a former champion in a recent battle.
2. **Voter view (fallback)** — based on the user having voted in relevant battles.

This means a singer with active championships sees their own stakes; a non-singer voter sees stakes from songs they've voted in.

If both stages return empty, the panel falls back to the existing marquee endpoint (`/songs/featured/risk`, `/battles/dethronements/recent`). Anonymous visitors skip personalization entirely and hit the marquee directly.

---

## Backend

### `GET /api/users/me/at-risk-crowns`

**Auth:** required (JWT). 401 if anonymous.

**Logic:**

1. **Champion stage** — find all `songs` rows where `currentChampionUserId = caller.userId` and `currentChampionStreak >= 1`. For each, compute `SongsService.computeRisk(songId)`. Return mapped to the shape below.
2. **Voter fallback** — if step 1 returned zero rows: find distinct `songId`s where the caller has cast a vote in any battle for that song; for each, compute risk; filter to those where `risk.riskLevel IN ('HIGH', 'CRITICAL')`.
3. Rank ascending by `survivalChance` (most-dangerous first), cap at 3 results.

**Response shape:**

```ts
type AtRiskCrownDto = {
  mode: 'champion' | 'voter';
  song: SongDto;            // existing toPublic shape (includes currentChampionTitleDefenses)
  champion: { username: string; avatarUrl: string | null } | null;
  titleDefenses: number;
  risk: SongRisk;           // existing { survivalChance, riskLevel, pendingChallengers, lastBattleMarginPercent }
};

type Response = AtRiskCrownDto[];  // length 0..3
```

Empty array (`[]`) when both stages return nothing — caller is a new user with no votes, no championships. Frontend treats `[]` as "fall back to marquee".

### `GET /api/users/me/recent-dethronements`

**Auth:** required.

**Logic:**

1. **Champion stage** — completed battles where (a) the *previous* completed battle for that `songId` had `winnerUserId = caller.userId` AND (b) the *current* battle's `winnerUserId !== caller.userId`. Use the same paired-walk logic as `BattlesService.findRecentDethronements` but pre-filter to caller-was-previous-winner. Tag `yourRole: 'former-champion'`.
2. **Voter fallback** — if step 1 returns zero: dethronements (using existing logic) where the caller cast a vote on the losing side. Tag `yourRole: 'voted-for-loser'`.
3. Newest-first by `current.closedAt`, cap at 3.

**Response shape:**

```ts
type PersonalDethronementDto = DethronementDto & {
  mode: 'champion' | 'voter';
  yourRole: 'former-champion' | 'voted-for-loser';
};

type Response = PersonalDethronementDto[];  // length 0..3
```

Empty array → frontend falls back to marquee.

### Service decomposition

Two new methods on `UsersService` (or a new `UserStakesService` to keep `UsersService` lean):

```ts
findMyAtRiskCrowns(userId: string): Promise<AtRiskCrownDto[]>
findMyRecentDethronements(userId: string): Promise<PersonalDethronementDto[]>
```

Both delegate the heavy lifting to existing services:
- Reuses `SongsService.computeRisk(songId)`
- Reuses the paired-walk dethronement detector from `BattlesService.findRecentDethronements` (extracted to a private helper that takes a predicate, so the caller can filter to "former-champion-is-X")

If the paired-walk extraction is invasive, a duplicated implementation in the new service is acceptable for v1 — flagged for cleanup in Phase 3.1.

### Wiring

- New controller (or extension of existing `UsersController`): two `@Get` routes guarded by `JwtAuthGuard`
- Module: register the new service; if extracting a `UserStakesService`, expose it via `UsersModule` providers

---

## Frontend

### API client extensions ([api.ts](frontend/src/lib/api.ts))

Add types:
- `AtRiskCrownDto`
- `PersonalDethronementDto`

Add client methods:
- `api.getMyAtRiskCrowns(): Promise<AtRiskCrownDto[]>`
- `api.getMyRecentDethronements(): Promise<PersonalDethronementDto[]>`

Both use the existing `request<T>` helper — sends `Authorization: Bearer` automatically when `vm_token` is present.

### Panel behavior — 3-state machine

Both `CrownAtRiskPanel` and `DethronedPanel` adopt the same shape:

```
state: 'loading' | 'personal' | 'marquee' | 'empty'
```

On mount:
1. If `useAuth().user` is present, attempt the personalized endpoint
2. If response is non-empty → state = `'personal'`, render the user's first item (with possibility for "view more" later)
3. If response is empty → fall back to the marquee endpoint
4. If anonymous → skip step 1, go straight to marquee
5. If marquee is also empty → state = `'empty'` (panel returns `null`, as today)

### Visual differentiation when in personal mode

Both panels:
- Eyebrow text changes: "CROWN AT RISK" → "YOUR CROWN AT RISK"; "DETHRONED!" → "YOU JUST LOST THE CROWN" (former-champion mode) or "YOUR PICK GOT DETHRONED" (voter mode)
- Border accent: existing `.gold-panel` swapped for a slightly more intense variant — done with an additional class `personal-stake` that adds a stronger red box-shadow. Defined once in [globals.css](frontend/src/app/globals.css).
- CTA copy: "Watch the Moment" → "Watch What Happened" (for personal dethronements)
- Subtle "for you" badge in the top-right corner of the panel (gold dot + "FOR YOU" micro-label)

### Files to touch

| File | Change |
|---|---|
| `backend/src/users/users.stakes.controller.ts` | NEW — two `@Get` routes |
| `backend/src/users/users.stakes.service.ts` | NEW — `findMyAtRiskCrowns`, `findMyRecentDethronements` |
| `backend/src/users/users.module.ts` | Add new service + controller |
| `backend/src/battles/battles.service.ts` | Refactor `findRecentDethronements` to accept an optional predicate (so the new service can reuse the walk) |
| `frontend/src/lib/api.ts` | New types + 2 client methods |
| `frontend/src/app/page.tsx` | `CrownAtRiskPanel` and `DethronedPanel` adopt 3-state lookup |
| `frontend/src/app/globals.css` | Add `.personal-stake` border-accent class |

---

## Edge cases

- **User has multiple at-risk championships** — surface only the most-dangerous one (lowest survival chance) in v1. No "view more" affordance — the route doesn't exist yet, and a no-op link is worse UX than no link.
- **User just lost a championship in the last battle** — that dethronement should appear with `yourRole: 'former-champion'`. The detector reads from completed battle history, so this is automatic.
- **User has voted in many losing battles** — voter-fallback ranking is by recency only in v1.
- **Caller has no auth token** — endpoints 401. Frontend treats 401 as "fall back to marquee" without showing an error.
- **Anonymous user** — never hits personalization endpoints. Faster TTI for first-time visitors.
- **Frontend race** — if a user signs in mid-session, panels do not re-fetch until next mount. Acceptable for v1.

---

## Testing

### Backend (jest, hits the existing in-memory test db)

`backend/src/users/users.stakes.service.spec.ts`:
- `findMyAtRiskCrowns` — champion-mode: user is current champion of 2 songs → returns both with computed risk, ordered by survival ASC
- `findMyAtRiskCrowns` — voter fallback: user is not a champion but voted in a battle whose champion is HIGH risk → returns 1
- `findMyAtRiskCrowns` — fully empty: user has neither championship nor votes → returns []
- `findMyRecentDethronements` — champion-mode: user lost a defense → returns the dethronement with `yourRole: 'former-champion'`
- `findMyRecentDethronements` — voter fallback: user voted for the loser of a recent dethronement → returns with `yourRole: 'voted-for-loser'`
- `findMyRecentDethronements` — fully empty → returns []

### Frontend

No tests in v1 (zero test infrastructure on the frontend, as noted in the audit). Typecheck is the gate.

### Manual QA checklist

- [ ] Anonymous visitor: both panels render marquee data (regression check)
- [ ] Signed-in user with no votes/championships: panels render marquee data
- [ ] Signed-in user with one active championship: AT RISK shows their song; eyebrow reads "YOUR CROWN AT RISK"
- [ ] Signed-in user who just lost a defense: DETHRONED shows their loss
- [ ] Signed-in user who only votes: AT RISK and DETHRONED show voter-fallback content
- [ ] All three states render the same panel framing (no visual regression)

---

## Non-goals (deferred to Phase 3.1)

- Real-time SSE push for "your crown is being challenged" events
- Rich per-battle OG image with singer portraits
- Downloadable PNG winner card
- Performance share (OG + share button on `/v/[id]`)
- All-time defense leaderboard
- Defense history surface on `/u/[username]`

---

## Self-review notes

- **Placeholders:** none remain.
- **Contradictions:** none found.
- **Ambiguity left in:** the paired-walk extraction is left as the implementer's call (extract helper vs duplicate) — duplication has a clear cleanup commitment in Phase 3.1, so this is acceptable latitude.
- **Scope:** matches the approved "Personalization core" scope; non-goals section explicitly fences off the other 5 audit items.
- **Risk:** the biggest implementation risk is `findRecentDethronements` already being a 100-line method that walks pairs in code — extracting a predicate-aware helper from it requires care to not break the existing `/battles/dethronements/recent` endpoint. The plan must include a backend regression test before the refactor.
