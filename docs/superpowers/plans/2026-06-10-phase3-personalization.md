# Phase 3 Personalization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the homepage Crown at Risk and Dethroned panels personally relevant to the signed-in user (hybrid champion/voter view), while preserving the marquee fallback for anonymous visitors and brand-new users.

**Architecture:** Two new auth-required REST endpoints under `/users/me/*` powered by a new `UserStakesService`. Backend reuses `SongsService.computeRisk()` and extends `BattlesService.findRecentDethronements` with an optional predicate (single non-breaking change to keep the existing marquee endpoint regression-safe). Frontend panels adopt a 3-state lookup (anonymous → marquee; authed-with-data → personal; authed-without-data → fall back to marquee).

**Tech Stack:** NestJS + TypeORM (backend), Next.js 14 App Router + React (frontend), Jest for backend unit tests.

**Spec:** [docs/superpowers/specs/2026-06-10-phase3-personalization-design.md](../specs/2026-06-10-phase3-personalization-design.md)

---

## Conventions used by this plan

- **Test runner:** `cd backend && npx jest <path>` for backend tests.
- **Typecheck:** `cd frontend && npx tsc --noEmit` for frontend, `cd backend && npx tsc --noEmit` for backend.
- **Commit author:** the existing repo authoring pattern is `azeemamanatali <azeemamanatali@users.noreply.github.com>` — pass to `--author` on each commit if matching that convention is desired.
- **Co-author footer:** add `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` per Claude Code convention.

---

## Phase A — Backend prep: predicate-aware dethronements walk

### Task 1: Regression test for the existing dethronements path

**Files:**
- Modify: `backend/src/battles/battles.service.spec.ts`

This locks in the current behavior of `findRecentDethronements(limit)` before we add the optional predicate. If the next task accidentally regresses the no-predicate path, this test fires.

- [ ] **Step 1: Append a new `describe` block to the existing spec**

Add after the last existing `describe` (around the end of the file), keeping the existing fixture helper visible:

```ts
describe('findRecentDethronements (no predicate — marquee path)', () => {
  it('returns completed battles where the winner changed for the song, newest first', async () => {
    const songId = 'song-1';
    const t = (offsetSec: number) => new Date(Date.now() + offsetSec * 1000);

    // Two completed battles for the same song; champion changed in the latter.
    const battles: Battle[] = [
      battleFixture({
        id: 'b-newer',
        songId,
        status: 'completed',
        winnerUserId: 'user-NEW',
        winnerPerformanceId: 'perf-a',
        voteCountA: 60,
        voteCountB: 40,
        closedAt: t(-10),
      }),
      battleFixture({
        id: 'b-older',
        songId,
        status: 'completed',
        winnerUserId: 'user-OLD',
        winnerPerformanceId: 'perf-b',
        voteCountA: 30,
        voteCountB: 70,
        closedAt: t(-120),
      }),
    ];

    battleRepo.find.mockResolvedValue(battles);
    userRepo.find = jest.fn().mockResolvedValue([
      { id: 'user-NEW', username: 'new', avatarUrl: null },
      { id: 'user-OLD', username: 'old', avatarUrl: null },
    ]);
    songsService.findOne.mockResolvedValue({
      id: songId,
      title: 'Song One',
      artist: 'Artist',
    });

    const out = await service.findRecentDethronements(5);

    expect(out).toHaveLength(1);
    expect(out[0].battleId).toBe('b-newer');
    expect(out[0].newChampion?.username).toBe('new');
    expect(out[0].formerChampion?.username).toBe('old');
    expect(out[0].winnerVotePercent).toBe(60);
  });

  it('returns [] when no song has a champion change', async () => {
    const battles: Battle[] = [
      battleFixture({
        id: 'b-1',
        status: 'completed',
        winnerUserId: 'user-A',
        winnerPerformanceId: 'perf-a',
        closedAt: new Date(),
      }),
    ];
    battleRepo.find.mockResolvedValue(battles);
    userRepo.find = jest.fn().mockResolvedValue([]);
    songsService.findOne.mockResolvedValue(null);

    const out = await service.findRecentDethronements(5);
    expect(out).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test, expect it to PASS**

```bash
cd backend && npx jest battles.service.spec.ts -t "findRecentDethronements"
```

Expected: 2 tests pass. (We're locking in current behavior — they should pass against the existing implementation.)

- [ ] **Step 3: Commit**

```bash
git add backend/src/battles/battles.service.spec.ts
git commit --author "azeemamanatali <azeemamanatali@users.noreply.github.com>" -m "test(battles): regression coverage for findRecentDethronements before predicate refactor

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Add optional predicate to `findRecentDethronements`

**Files:**
- Modify: `backend/src/battles/battles.service.ts`

Backward-compatible addition. The marquee endpoint passes no predicate; the new personalization service passes one.

- [ ] **Step 1: Update the method signature + filter**

In `battles.service.ts`, find `async findRecentDethronements(limit: number) {` and replace its body with:

```ts
async findRecentDethronements(
  limit: number,
  predicate?: (t: { current: Battle; previous: Battle }) => boolean,
) {
  const recent = await this.battles.find({
    where: { status: 'completed' },
    order: { closedAt: 'DESC' },
    take: 200,
  });

  const bySong = new Map<string, Battle[]>();
  for (const b of recent) {
    const arr = bySong.get(b.songId) ?? [];
    arr.push(b);
    bySong.set(b.songId, arr);
  }

  const transitions: Array<{ current: Battle; previous: Battle }> = [];
  for (const battles of bySong.values()) {
    for (let i = 0; i < battles.length - 1; i++) {
      const current = battles[i];
      const previous = battles[i + 1];
      if (
        current.winnerUserId &&
        previous.winnerUserId &&
        current.winnerUserId !== previous.winnerUserId
      ) {
        transitions.push({ current, previous });
      }
    }
  }

  // Personalization predicate (optional). Marquee path passes none.
  const filtered = predicate ? transitions.filter(predicate) : transitions;

  filtered.sort(
    (a, b) =>
      (b.current.closedAt?.getTime() ?? 0) -
      (a.current.closedAt?.getTime() ?? 0),
  );
  const top = filtered.slice(0, limit);

  if (top.length === 0) return [];

  // Enrichment block — UNCHANGED from before. Copy/keep as-is.
  const userIds = new Set<string>();
  const songIds = new Set<string>();
  for (const t of top) {
    if (t.current.winnerUserId) userIds.add(t.current.winnerUserId);
    if (t.previous.winnerUserId) userIds.add(t.previous.winnerUserId);
    songIds.add(t.current.songId);
  }

  const [users, songs] = await Promise.all([
    this.users.find({ where: { id: In([...userIds]) } }),
    Promise.all(
      [...songIds].map((id) =>
        this.songs.findOne(id).catch(() => null),
      ),
    ),
  ]);
  const userMap = new Map(users.map((u) => [u.id, u]));
  const songMap = new Map(
    songs.filter((s): s is NonNullable<typeof s> => !!s).map((s) => [s.id, s]),
  );

  return top.map(({ current, previous }) => {
    const total = current.voteCountA + current.voteCountB;
    const winnerVotes =
      current.winnerPerformanceId === current.performanceAId
        ? current.voteCountA
        : current.voteCountB;
    const marginPercent =
      total === 0 ? 0 : Math.round((winnerVotes / total) * 100);
    const newChamp = current.winnerUserId
      ? userMap.get(current.winnerUserId)
      : undefined;
    const formerChamp = previous.winnerUserId
      ? userMap.get(previous.winnerUserId)
      : undefined;
    const song = songMap.get(current.songId);
    return {
      battleId: current.id,
      songId: current.songId,
      songTitle: song?.title ?? null,
      songArtist: song?.artist ?? null,
      dethronedAt: current.closedAt,
      winnerVotePercent: marginPercent,
      newChampion: newChamp
        ? {
            userId: newChamp.id,
            username: newChamp.username,
            avatarUrl: newChamp.avatarUrl,
          }
        : null,
      formerChampion: formerChamp
        ? {
            userId: formerChamp.id,
            username: formerChamp.username,
            avatarUrl: formerChamp.avatarUrl,
          }
        : null,
    };
  });
}
```

- [ ] **Step 2: Re-run the regression tests from Task 1**

```bash
cd backend && npx jest battles.service.spec.ts -t "findRecentDethronements"
```

Expected: still 2 passes. The behavior of the no-predicate call must be unchanged.

- [ ] **Step 3: Typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add backend/src/battles/battles.service.ts
git commit --author "azeemamanatali <azeemamanatali@users.noreply.github.com>" -m "refactor(battles): findRecentDethronements accepts optional predicate

Backward-compatible — the marquee call site passes no predicate, so
behavior is identical there. Personalization service in the next commit
uses it to filter to 'former champion is user X'.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase B — User stakes service (TDD)

### Task 3: Create the service skeleton + spec scaffolding

**Files:**
- Create: `backend/src/users/user-stakes.service.ts`
- Create: `backend/src/users/user-stakes.service.spec.ts`

- [ ] **Step 1: Create the skeleton service**

`backend/src/users/user-stakes.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { Song } from '../songs/song.entity';
import { SongsService, SongRisk } from '../songs/songs.service';
import { Vote } from '../battles/vote.entity';
import { BattlesService } from '../battles/battles.service';
import { User } from './user.entity';

export interface AtRiskCrownDto {
  mode: 'champion' | 'voter';
  song: ReturnType<SongsService['toPublic']>;
  champion: { username: string; avatarUrl: string | null } | null;
  titleDefenses: number;
  risk: SongRisk;
}

export type PersonalDethronementDto = Awaited<
  ReturnType<BattlesService['findRecentDethronements']>
>[number] & {
  mode: 'champion' | 'voter';
  yourRole: 'former-champion' | 'voted-for-loser';
};

@Injectable()
export class UserStakesService {
  constructor(
    @InjectRepository(Song) private readonly songs: Repository<Song>,
    @InjectRepository(Vote) private readonly votes: Repository<Vote>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly songsService: SongsService,
    private readonly battlesService: BattlesService,
  ) {}

  async findMyAtRiskCrowns(userId: string): Promise<AtRiskCrownDto[]> {
    return [];
  }

  async findMyRecentDethronements(
    userId: string,
  ): Promise<PersonalDethronementDto[]> {
    return [];
  }
}
```

- [ ] **Step 2: Create the spec scaffolding (mirrors battles.service.spec.ts style)**

`backend/src/users/user-stakes.service.spec.ts`:

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Song } from '../songs/song.entity';
import { SongsService } from '../songs/songs.service';
import { Vote } from '../battles/vote.entity';
import { BattlesService } from '../battles/battles.service';
import { User } from './user.entity';
import { UserStakesService } from './user-stakes.service';

describe('UserStakesService', () => {
  let service: UserStakesService;

  const songRepo: any = {
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const voteRepo: any = {
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const userRepo: any = { find: jest.fn() };

  const songsService: any = {
    computeRisk: jest.fn(),
    toPublic: jest.fn((s: any) => ({
      id: s.id,
      title: s.title,
      artist: s.artist,
      currentChampionUserId: s.currentChampionUserId,
      currentChampionStreak: s.currentChampionStreak,
      currentChampionTitleDefenses: Math.max(0, (s.currentChampionStreak ?? 0) - 1),
    })),
  };

  const battlesService: any = {
    findRecentDethronements: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UserStakesService,
        { provide: getRepositoryToken(Song), useValue: songRepo },
        { provide: getRepositoryToken(Vote), useValue: voteRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: SongsService, useValue: songsService },
        { provide: BattlesService, useValue: battlesService },
      ],
    }).compile();

    service = moduleRef.get(UserStakesService);
  });

  // Tests added in subsequent tasks.
  it('is instantiable', () => {
    expect(service).toBeDefined();
  });
});
```

- [ ] **Step 3: Run the scaffolding test**

```bash
cd backend && npx jest user-stakes.service.spec.ts
```

Expected: 1 pass ("is instantiable").

- [ ] **Step 4: Commit**

```bash
git add backend/src/users/user-stakes.service.ts backend/src/users/user-stakes.service.spec.ts
git commit --author "azeemamanatali <azeemamanatali@users.noreply.github.com>" -m "scaffold(users): UserStakesService skeleton + spec setup

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `findMyAtRiskCrowns` — champion mode (TDD)

**Files:**
- Modify: `backend/src/users/user-stakes.service.ts`
- Modify: `backend/src/users/user-stakes.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Replace the `// Tests added in subsequent tasks.` placeholder and the `is instantiable` test in the spec with:

```ts
describe('findMyAtRiskCrowns', () => {
  it('champion mode: returns each song the user champions, ordered by lowest survival', async () => {
    const userId = 'me';
    songRepo.find.mockResolvedValue([
      {
        id: 's-low',
        title: 'Low',
        artist: 'A',
        currentChampionUserId: userId,
        currentChampionStreak: 3,
      },
      {
        id: 's-high',
        title: 'High',
        artist: 'B',
        currentChampionUserId: userId,
        currentChampionStreak: 1,
      },
    ]);
    userRepo.find.mockResolvedValue([
      { id: userId, username: 'me', avatarUrl: null },
    ]);
    songsService.computeRisk
      .mockResolvedValueOnce({
        survivalChance: 25,
        riskLevel: 'HIGH',
        pendingChallengers: 4,
        lastBattleMarginPercent: 5,
      })
      .mockResolvedValueOnce({
        survivalChance: 80,
        riskLevel: 'LOW',
        pendingChallengers: 0,
        lastBattleMarginPercent: null,
      });

    const out = await service.findMyAtRiskCrowns(userId);

    expect(out).toHaveLength(2);
    expect(out[0].song.id).toBe('s-low');
    expect(out[0].mode).toBe('champion');
    expect(out[0].risk.survivalChance).toBe(25);
    expect(out[0].titleDefenses).toBe(2); // streak 3 → 2 defenses
    expect(out[1].song.id).toBe('s-high');
  });
});
```

- [ ] **Step 2: Run the test, expect FAIL**

```bash
cd backend && npx jest user-stakes.service.spec.ts -t "champion mode"
```

Expected: FAIL with "expected length 2, got 0".

- [ ] **Step 3: Implement the champion branch**

In `user-stakes.service.ts`, replace the body of `findMyAtRiskCrowns` with:

```ts
async findMyAtRiskCrowns(userId: string): Promise<AtRiskCrownDto[]> {
  const owned = await this.songs.find({
    where: { currentChampionUserId: userId, status: 'active' as any },
  });

  if (owned.length > 0) {
    const users = await this.users.find({ where: { id: In([userId]) } });
    const me = users.find((u) => u.id === userId);
    const champion = me
      ? { username: me.username, avatarUrl: me.avatarUrl }
      : null;

    const items: AtRiskCrownDto[] = [];
    for (const s of owned) {
      const risk = await this.songsService.computeRisk(s.id);
      items.push({
        mode: 'champion',
        song: this.songsService.toPublic(s),
        champion,
        titleDefenses: Math.max(0, (s.currentChampionStreak ?? 0) - 1),
        risk,
      });
    }
    items.sort((a, b) => a.risk.survivalChance - b.risk.survivalChance);
    return items.slice(0, 3);
  }

  return [];
}
```

- [ ] **Step 4: Run the test, expect PASS**

```bash
cd backend && npx jest user-stakes.service.spec.ts -t "champion mode"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/users/user-stakes.service.ts backend/src/users/user-stakes.service.spec.ts
git commit --author "azeemamanatali <azeemamanatali@users.noreply.github.com>" -m "feat(users): findMyAtRiskCrowns champion mode

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `findMyAtRiskCrowns` — voter fallback (TDD)

**Files:**
- Modify: `backend/src/users/user-stakes.service.ts`
- Modify: `backend/src/users/user-stakes.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add a sibling test inside the existing `describe('findMyAtRiskCrowns', ...)`:

```ts
it('voter fallback: user has no championships → returns HIGH/CRITICAL songs they voted on', async () => {
  const userId = 'me';
  songRepo.find.mockResolvedValue([]); // no championships

  // The user voted in battles for 2 songs. Query builder returns those songIds.
  voteRepo.createQueryBuilder.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    distinct: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([
      { songId: 's-A' },
      { songId: 's-B' },
    ]),
  });

  // Fetch those songs' detail.
  songRepo.findOne
    .mockResolvedValueOnce({
      id: 's-A',
      title: 'A',
      artist: 'a',
      currentChampionUserId: 'champ-A',
      currentChampionStreak: 1,
    })
    .mockResolvedValueOnce({
      id: 's-B',
      title: 'B',
      artist: 'b',
      currentChampionUserId: 'champ-B',
      currentChampionStreak: 2,
    });

  songsService.computeRisk
    .mockResolvedValueOnce({
      survivalChance: 18,
      riskLevel: 'CRITICAL',
      pendingChallengers: 5,
      lastBattleMarginPercent: 4,
    })
    .mockResolvedValueOnce({
      survivalChance: 75,
      riskLevel: 'LOW', // filtered out
      pendingChallengers: 0,
      lastBattleMarginPercent: null,
    });

  userRepo.find.mockResolvedValue([
    { id: 'champ-A', username: 'champA', avatarUrl: null },
  ]);

  const out = await service.findMyAtRiskCrowns(userId);

  expect(out).toHaveLength(1);
  expect(out[0].song.id).toBe('s-A');
  expect(out[0].mode).toBe('voter');
  expect(out[0].champion?.username).toBe('champA');
});

it('returns [] when user has no championships and no qualifying voter songs', async () => {
  songRepo.find.mockResolvedValue([]);
  voteRepo.createQueryBuilder.mockReturnValue({
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    distinct: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([]),
  });

  const out = await service.findMyAtRiskCrowns('me');
  expect(out).toEqual([]);
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
cd backend && npx jest user-stakes.service.spec.ts -t "findMyAtRiskCrowns"
```

Expected: champion test passes, two new tests FAIL.

- [ ] **Step 3: Extend the implementation with the voter branch**

Replace the `return [];` at the end of `findMyAtRiskCrowns` (champion branch already returns its own) with:

```ts
// Voter fallback: distinct songIds the user has voted in.
const distinctSongs = await this.votes
  .createQueryBuilder('v')
  .select('DISTINCT b.songId', 'songId')
  .innerJoin('battles', 'b', 'b.id = v.battleId')
  .where('v.userId = :userId', { userId })
  .getRawMany<{ songId: string }>();

if (distinctSongs.length === 0) return [];

const items: AtRiskCrownDto[] = [];
const championUserIds = new Set<string>();

for (const { songId } of distinctSongs) {
  const song = await this.songs.findOne({ where: { id: songId } });
  if (!song || !song.currentChampionUserId) continue;
  const risk = await this.songsService.computeRisk(song.id);
  if (risk.riskLevel !== 'HIGH' && risk.riskLevel !== 'CRITICAL') continue;
  championUserIds.add(song.currentChampionUserId);
  items.push({
    mode: 'voter',
    song: this.songsService.toPublic(song),
    champion: null, // filled below
    titleDefenses: Math.max(0, (song.currentChampionStreak ?? 0) - 1),
    risk,
  });
}

if (items.length > 0 && championUserIds.size > 0) {
  const championUsers = await this.users.find({
    where: { id: In([...championUserIds]) },
  });
  const championMap = new Map(
    championUsers.map((u) => [u.id, { username: u.username, avatarUrl: u.avatarUrl }]),
  );
  for (const item of items) {
    const champId = item.song.currentChampionUserId;
    if (champId) item.champion = championMap.get(champId) ?? null;
  }
}

items.sort((a, b) => a.risk.survivalChance - b.risk.survivalChance);
return items.slice(0, 3);
```

- [ ] **Step 4: Run all three findMyAtRiskCrowns tests**

```bash
cd backend && npx jest user-stakes.service.spec.ts -t "findMyAtRiskCrowns"
```

Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/users/user-stakes.service.ts backend/src/users/user-stakes.service.spec.ts
git commit --author "azeemamanatali <azeemamanatali@users.noreply.github.com>" -m "feat(users): findMyAtRiskCrowns voter fallback

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `findMyRecentDethronements` — champion mode (TDD)

**Files:**
- Modify: `backend/src/users/user-stakes.service.ts`
- Modify: `backend/src/users/user-stakes.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add to the spec (new `describe` block at the bottom):

```ts
describe('findMyRecentDethronements', () => {
  it('champion mode: returns dethronements where caller was the previous champion', async () => {
    const userId = 'me';
    battlesService.findRecentDethronements.mockImplementation(
      async (_limit: number, predicate?: any) => {
        // Simulate two transitions: only one has caller as previous winner.
        const all = [
          {
            battleId: 'b-1',
            songId: 's-1',
            songTitle: 'Mine',
            songArtist: 'A',
            dethronedAt: new Date('2026-06-09T00:00:00Z'),
            winnerVotePercent: 55,
            newChampion: { userId: 'new', username: 'new', avatarUrl: null },
            formerChampion: { userId, username: 'me', avatarUrl: null },
          },
          {
            battleId: 'b-2',
            songId: 's-2',
            songTitle: 'Other',
            songArtist: 'B',
            dethronedAt: new Date('2026-06-08T00:00:00Z'),
            winnerVotePercent: 60,
            newChampion: { userId: 'x', username: 'x', avatarUrl: null },
            formerChampion: { userId: 'y', username: 'y', avatarUrl: null },
          },
        ];
        // The service calls battlesService with a predicate; emulate filtering.
        if (!predicate) return all;
        return all.filter((d: any) =>
          predicate({
            current: { winnerUserId: d.newChampion?.userId },
            previous: { winnerUserId: d.formerChampion?.userId },
          }),
        );
      },
    );

    const out = await service.findMyRecentDethronements(userId);

    expect(out).toHaveLength(1);
    expect(out[0].battleId).toBe('b-1');
    expect(out[0].mode).toBe('champion');
    expect(out[0].yourRole).toBe('former-champion');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

```bash
cd backend && npx jest user-stakes.service.spec.ts -t "findMyRecentDethronements"
```

Expected: FAIL ("expected length 1, got 0").

- [ ] **Step 3: Implement the champion branch**

Replace the body of `findMyRecentDethronements` with:

```ts
async findMyRecentDethronements(
  userId: string,
): Promise<PersonalDethronementDto[]> {
  // Champion mode: dethronements where the *previous* winner was the caller.
  const championLosses = await this.battlesService.findRecentDethronements(
    3,
    ({ previous, current }) =>
      previous.winnerUserId === userId &&
      current.winnerUserId !== userId,
  );

  if (championLosses.length > 0) {
    return championLosses.map((d) => ({
      ...d,
      mode: 'champion' as const,
      yourRole: 'former-champion' as const,
    }));
  }

  return [];
}
```

- [ ] **Step 4: Run, expect PASS**

```bash
cd backend && npx jest user-stakes.service.spec.ts -t "findMyRecentDethronements"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/users/user-stakes.service.ts backend/src/users/user-stakes.service.spec.ts
git commit --author "azeemamanatali <azeemamanatali@users.noreply.github.com>" -m "feat(users): findMyRecentDethronements champion mode

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `findMyRecentDethronements` — voter fallback (TDD)

**Files:**
- Modify: `backend/src/users/user-stakes.service.ts`
- Modify: `backend/src/users/user-stakes.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Add inside the existing `describe('findMyRecentDethronements', ...)`:

```ts
it('voter fallback: returns dethronements where caller voted for the loser', async () => {
  const userId = 'me';
  battlesService.findRecentDethronements.mockResolvedValueOnce([]); // no champion losses

  // The second call (no predicate) returns recent dethronements site-wide.
  battlesService.findRecentDethronements.mockResolvedValueOnce([
    {
      battleId: 'b-9',
      songId: 's-9',
      songTitle: 'Song',
      songArtist: 'Artist',
      dethronedAt: new Date(),
      winnerVotePercent: 58,
      newChampion: { userId: 'winner', username: 'winner', avatarUrl: null },
      formerChampion: { userId: 'loser', username: 'loser', avatarUrl: null },
    },
  ]);

  // The caller voted for the loser in that battle.
  voteRepo.find.mockResolvedValue([
    { battleId: 'b-9', performanceId: 'loser-perf', userId },
  ]);

  // We need to know which performanceId belongs to the loser. Stub a helper:
  // for v1 we treat "voted for the loser" as "the user has a vote row whose
  // performanceId equals the LOSING side's performanceId". Since the test
  // controls the data, we just say the vote IS for the loser side.
  // The implementation must look up battle details to map perf → side.

  // For simplicity in v1: filter by battleId membership + manual loser-check
  // is done inside the service. Stub battleRepo.findOne for the lookup:
  // (battlesService.findRecentDethronements already gave us the winning side
  // via winnerPerformanceId in current — but the public DTO doesn't expose
  // it. We extend the DethronementDto with winnerPerformanceId in Task 2's
  // mapping if needed.)

  const out = await service.findMyRecentDethronements(userId);

  expect(out).toHaveLength(1);
  expect(out[0].mode).toBe('voter');
  expect(out[0].yourRole).toBe('voted-for-loser');
});

it('returns [] when user has neither champion losses nor losing votes', async () => {
  battlesService.findRecentDethronements.mockResolvedValueOnce([]);
  battlesService.findRecentDethronements.mockResolvedValueOnce([]);
  voteRepo.find.mockResolvedValue([]);
  const out = await service.findMyRecentDethronements('me');
  expect(out).toEqual([]);
});
```

⚠️ **Schema note for the implementer:** the existing `DethronementDto` shape (returned by `findRecentDethronements`) does NOT expose `winnerPerformanceId` or `loserPerformanceId`. To implement the voter-fallback predicate, you have two options:

  **Option a — Extend the DTO (preferred):** In `battles.service.ts:findRecentDethronements`, add `winnerPerformanceId: current.winnerPerformanceId` to the mapped object. Also expose `loserPerformanceId` (derive: it's whichever of `performanceAId`/`performanceBId` isn't the winner). Update `DethronementDto` in `frontend/src/lib/api.ts` to match. This is a non-breaking additive change.

  **Option b — Re-fetch each battle:** in the voter branch, call `this.battles.findOne(...)` for each candidate dethronement to learn the loser's perf id. Slower, more code, no DTO change.

  **Decision:** Option a. The DTO addition is one field and benefits other future surfaces.

- [ ] **Step 2: Extend `findRecentDethronements` DTO to include loser/winner performance IDs**

In `battles.service.ts`, in the final `return top.map(...)` block, add to the mapped object:

```ts
return {
  battleId: current.id,
  songId: current.songId,
  songTitle: song?.title ?? null,
  songArtist: song?.artist ?? null,
  dethronedAt: current.closedAt,
  winnerVotePercent: marginPercent,
  winnerPerformanceId: current.winnerPerformanceId,
  loserPerformanceId:
    current.winnerPerformanceId === current.performanceAId
      ? current.performanceBId
      : current.performanceAId,
  newChampion: /* ...unchanged */,
  formerChampion: /* ...unchanged */,
};
```

Re-run the Task 1 regression tests to make sure the addition didn't break them:

```bash
cd backend && npx jest battles.service.spec.ts -t "findRecentDethronements"
```

Expected: still PASS (additive fields don't break the existing assertions).

- [ ] **Step 3: Implement the voter fallback branch**

Append to `findMyRecentDethronements`, after the champion-branch early return:

```ts
// Voter fallback: site-wide recent dethronements, filtered to those
// where the caller has a vote row on the LOSER's performanceId.
const recent = await this.battlesService.findRecentDethronements(10);
if (recent.length === 0) return [];

const battleIds = recent.map((d) => d.battleId);
const myVotes = await this.votes.find({
  where: { userId, battleId: In(battleIds) },
});
if (myVotes.length === 0) return [];

const voteByBattle = new Map(myVotes.map((v) => [v.battleId, v]));

const losing = recent.filter((d) => {
  const myVote = voteByBattle.get(d.battleId);
  if (!myVote) return false;
  return myVote.performanceId === (d as any).loserPerformanceId;
});

return losing.slice(0, 3).map((d) => ({
  ...d,
  mode: 'voter' as const,
  yourRole: 'voted-for-loser' as const,
}));
```

- [ ] **Step 4: Run all `findMyRecentDethronements` tests**

```bash
cd backend && npx jest user-stakes.service.spec.ts -t "findMyRecentDethronements"
```

Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/users/user-stakes.service.ts backend/src/users/user-stakes.service.spec.ts backend/src/battles/battles.service.ts
git commit --author "azeemamanatali <azeemamanatali@users.noreply.github.com>" -m "feat(users): findMyRecentDethronements voter fallback + expose perf ids on DethronementDto

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase C — Wire backend routes

### Task 8: `UserStakesController` with two routes

**Files:**
- Create: `backend/src/users/user-stakes.controller.ts`

- [ ] **Step 1: Create the controller**

```ts
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserStakesService } from './user-stakes.service';

@ApiTags('User Stakes')
@Controller('users/me')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
export class UserStakesController {
  constructor(private readonly stakes: UserStakesService) {}

  @Get('at-risk-crowns')
  @ApiOperation({
    summary: 'Songs the caller is currently championing (or voting on) that are at risk',
    description:
      'Auth required. Hybrid: champion view (songs the user currently champions, ranked by lowest survival chance) with voter fallback (songs the user has voted on whose champion is HIGH or CRITICAL risk). Up to 3 items. Empty array means the frontend should fall back to the marquee `/songs/featured/risk` endpoint.',
  })
  async atRisk(@Req() req: any) {
    return this.stakes.findMyAtRiskCrowns(req.user.userId);
  }

  @Get('recent-dethronements')
  @ApiOperation({
    summary: 'Crown changes that personally affect the caller',
    description:
      'Auth required. Hybrid: champion view (battles where the caller was the previous winner) with voter fallback (battles where the caller voted for the losing side). Up to 3 items, newest first. Empty array → frontend falls back to `/battles/dethronements/recent`.',
  })
  async dethronements(@Req() req: any) {
    return this.stakes.findMyRecentDethronements(req.user.userId);
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add backend/src/users/user-stakes.controller.ts
git commit --author "azeemamanatali <azeemamanatali@users.noreply.github.com>" -m "feat(users): UserStakesController exposes /users/me/at-risk-crowns + recent-dethronements

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Wire into `UsersModule`

**Files:**
- Modify: `backend/src/users/users.module.ts`

- [ ] **Step 1: Register the new controller + service**

Open `backend/src/users/users.module.ts` and update it:

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserStakesController } from './user-stakes.controller';
import { UserStakesService } from './user-stakes.service';
import { User } from './user.entity';
import { AuthModule } from '../auth/auth.module';
import { VideosModule } from '../videos/videos.module';
import { SongsModule } from '../songs/songs.module';
import { BattlesModule } from '../battles/battles.module';
import { Song } from '../songs/song.entity';
import { Vote } from '../battles/vote.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Song, Vote]),
    AuthModule,
    VideosModule, // for CloudinaryService (unchanged)
    SongsModule,
    BattlesModule,
  ],
  controllers: [UsersController, UserStakesController],
  providers: [UsersService, UserStakesService],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
```

⚠️ **Circular-import watch:** `UsersModule` now imports `BattlesModule` which already imports the `User` entity directly via `TypeOrmModule.forFeature([..., User])`. If NestJS complains about circular dependency at boot, fix by using `forwardRef(() => BattlesModule)` in `UsersModule` imports and `forwardRef(() => UsersModule)` in `BattlesModule` imports.

- [ ] **Step 2: Smoke-test by booting the backend**

```bash
cd backend && npx nest start --watch
```

Wait until you see "Nest application successfully started", then Ctrl-C. If you see "circular dependency detected" or "Nest can't resolve dependencies" — apply the `forwardRef` fix from the warning above.

- [ ] **Step 3: Typecheck + full test suite**

```bash
cd backend && npx tsc --noEmit && npx jest
```

Expected: typecheck clean, all tests pass (the 25 pre-existing + new user-stakes tests).

- [ ] **Step 4: Commit**

```bash
git add backend/src/users/users.module.ts
git commit --author "azeemamanatali <azeemamanatali@users.noreply.github.com>" -m "feat(users): register UserStakesController + service in UsersModule

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase D — Frontend wiring

### Task 10: Add types + client methods to `api.ts`

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Extend `DethronementDto` with the new perf-id fields**

Find `export interface DethronementDto {` and add two fields:

```ts
export interface DethronementDto {
  battleId: string;
  songId: string;
  songTitle: string | null;
  songArtist: string | null;
  dethronedAt: string | null;
  winnerVotePercent: number;
  winnerPerformanceId: string;          // NEW
  loserPerformanceId: string;            // NEW
  newChampion: { userId: string; username: string; avatarUrl: string | null } | null;
  formerChampion: { userId: string; username: string; avatarUrl: string | null } | null;
}
```

- [ ] **Step 2: Add the personalized types**

Below the `FeaturedSongRiskDto` definition, add:

```ts
export interface AtRiskCrownDto {
  mode: 'champion' | 'voter';
  song: SongDto;
  champion: { username: string; avatarUrl: string | null } | null;
  titleDefenses: number;
  risk: SongRisk;
}

export interface PersonalDethronementDto extends DethronementDto {
  mode: 'champion' | 'voter';
  yourRole: 'former-champion' | 'voted-for-loser';
}
```

- [ ] **Step 3: Add the two new client methods**

Inside the `export const api = {` object, after `getRecentDethronements`, add:

```ts
getMyAtRiskCrowns: () => request<AtRiskCrownDto[]>('/users/me/at-risk-crowns'),
getMyRecentDethronements: () =>
  request<PersonalDethronementDto[]>('/users/me/recent-dethronements'),
```

- [ ] **Step 4: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts
git commit --author "azeemamanatali <azeemamanatali@users.noreply.github.com>" -m "feat(api): types + client methods for /users/me/at-risk-crowns and recent-dethronements

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: `.personal-stake` CSS utility

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Append the utility after `.red-glow`**

In `globals.css`, after the `.red-glow` block, add:

```css
/* Personalized-stake panel framing. Layered on top of .gold-panel for
   surfaces showing the signed-in user's own crown / dethronement —
   visually louder so the user can tell it's about them, not the marquee. */
.personal-stake {
  box-shadow:
    0 0 0 1px rgba(var(--c-gold) / 0.6),
    0 0 28px rgba(var(--c-spotlight) / 0.35),
    0 0 70px rgba(var(--c-spotlight) / 0.15);
}
.personal-stake::before {
  content: 'FOR YOU';
  position: absolute;
  top: 0.75rem;
  right: 0.75rem;
  z-index: 40;
  font-size: 0.625rem;
  font-weight: 800;
  letter-spacing: 0.3em;
  color: rgb(var(--c-gold));
  background: rgba(0, 0, 0, 0.7);
  border: 1px solid rgba(var(--c-gold) / 0.5);
  border-radius: 9999px;
  padding: 0.25rem 0.625rem;
  pointer-events: none;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/globals.css
git commit --author "azeemamanatali <azeemamanatali@users.noreply.github.com>" -m "style: .personal-stake utility for personalized panel framing

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: `CrownAtRiskPanel` — 3-state lookup

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Import the new types**

In the existing api imports block near the top of `page.tsx`, add `AtRiskCrownDto`:

```tsx
import {
  api,
  AtRiskCrownDto,
  BattleDto,
  DethronementDto,
  // ...existing imports
} from '@/lib/api';
```

- [ ] **Step 2: Replace the body of `CrownAtRiskPanel`**

Replace the existing `CrownAtRiskPanel` function with:

```tsx
function CrownAtRiskPanel() {
  const { user } = useAuth();
  const [data, setData] = useState<FeaturedSongRiskDto | null>(null);
  const [personal, setPersonal] = useState<AtRiskCrownDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (user) {
          const mine = await api.getMyAtRiskCrowns();
          if (!cancelled && mine.length > 0) {
            setPersonal(mine[0]);
            return; // personal mode wins
          }
        }
        const f = await api.getFeaturedRisk();
        if (!cancelled) setData(f);
      } catch {
        // 401 from /users/me/* when token expired → fall back silently
        try {
          const f = await api.getFeaturedRisk();
          if (!cancelled) setData(f);
        } catch {
          // marquee also failed; panel becomes empty
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Personal mode: render using the personalized payload.
  if (personal) {
    return (
      <CrownAtRiskPanelView
        eyebrow="Your Crown at Risk"
        subtitle={
          personal.mode === 'champion'
            ? <>You currently champion <span className="text-white">{personal.song.title}</span> · defend it</>
            : <>The crown on <span className="text-white">{personal.song.title}</span> (your vote) is under attack</>
        }
        song={personal.song}
        risk={personal.risk}
        personalised
      />
    );
  }

  if (!data) return null;
  return (
    <CrownAtRiskPanelView
      eyebrow="Crown at Risk"
      subtitle={<>The crown on <span className="text-white">{data.song.title}</span> is under attack</>}
      song={data.song}
      risk={data.risk}
      personalised={false}
    />
  );
}
```

- [ ] **Step 3: Extract the shared render into `CrownAtRiskPanelView`**

Add a new component below `CrownAtRiskPanel` (or above `riskTone`):

```tsx
function CrownAtRiskPanelView({
  eyebrow,
  subtitle,
  song,
  risk,
  personalised,
}: {
  eyebrow: string;
  subtitle: React.ReactNode;
  song: SongDto;
  risk: SongRisk;
  personalised: boolean;
}) {
  const survival = risk.survivalChance;
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - survival / 100);
  const tone = riskTone(risk.riskLevel);

  return (
    <section className="bg-background py-12 md:py-20">
      <div className="max-w-7xl mx-auto px-4">
        <div className={`gold-panel ${personalised ? 'personal-stake' : ''} relative overflow-hidden p-8 md:p-10`}>
          <Image
            src={HERO_CROWN_AT_RISK.src}
            alt=""
            fill
            sizes="(max-width: 1280px) 100vw, 1280px"
            className="object-cover opacity-50"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-black/85" />
          <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 items-center">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className={`w-5 h-5 ${tone.text}`} />
                <h2 className={`text-2xl md:text-3xl font-black ${tone.text} tracking-widest uppercase`}>
                  {eyebrow}
                </h2>
                <AlertTriangle className={`w-5 h-5 ${tone.text}`} />
              </div>
              <p className="text-gray-400 text-sm uppercase tracking-widest mb-6">{subtitle}</p>
              {/* ─── stat row (unchanged copy from current CrownAtRiskPanel) ─── */}
              {/* ...keep the existing flex with Crown Risk / Pending / Last Margin... */}
              {/* ─── progress bar (unchanged) ─── */}
              {/* ─── caption (unchanged) ─── */}
            </div>
            {/* ─── SVG survival ring (unchanged) ─── */}
          </div>
        </div>
      </div>
    </section>
  );
}
```

⚠️ **Implementer:** the `// ...keep the existing...` comments mark places where you should copy the matching JSX from the OLD `CrownAtRiskPanel` body (the stat row with Crown Risk/Pending Challengers/Last Margin, the progress bar, the caption, and the SVG ring). Don't rewrite — just lift. Make sure `risk` and `survival`/`tone`/`dashOffset` references resolve to the new view-scoped variables.

- [ ] **Step 4: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/page.tsx
git commit --author "azeemamanatali <azeemamanatali@users.noreply.github.com>" -m "feat(homepage): CrownAtRiskPanel personal mode (3-state with marquee fallback)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: `DethronedPanel` — 3-state lookup

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Import `PersonalDethronementDto`**

Extend the api import block:

```tsx
import {
  api,
  AtRiskCrownDto,
  BattleDto,
  DethronementDto,
  PersonalDethronementDto,
  // ...
} from '@/lib/api';
```

- [ ] **Step 2: Replace `DethronedPanel`**

Replace the `DethronedPanel` function with:

```tsx
function DethronedPanel() {
  const { user } = useAuth();
  const [latest, setLatest] = useState<DethronementDto | null>(null);
  const [personal, setPersonal] = useState<PersonalDethronementDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (user) {
          const mine = await api.getMyRecentDethronements();
          if (!cancelled && mine.length > 0) {
            setPersonal(mine[0]);
            return;
          }
        }
        const list = await api.getRecentDethronements(1);
        if (!cancelled && list.length > 0) setLatest(list[0]);
      } catch {
        try {
          const list = await api.getRecentDethronements(1);
          if (!cancelled && list.length > 0) setLatest(list[0]);
        } catch {
          /* empty */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (personal) {
    const eyebrow =
      personal.yourRole === 'former-champion'
        ? 'You Just Lost the Crown'
        : 'Your Pick Got Dethroned';
    return (
      <DethronedPanelView latest={personal} eyebrow={eyebrow} personalised />
    );
  }
  if (!latest) return null;
  return <DethronedPanelView latest={latest} eyebrow="Dethroned!" personalised={false} />;
}
```

- [ ] **Step 3: Extract `DethronedPanelView`**

Add below `DethronedPanel`:

```tsx
function DethronedPanelView({
  latest,
  eyebrow,
  personalised,
}: {
  latest: DethronementDto;
  eyebrow: string;
  personalised: boolean;
}) {
  return (
    <section className="bg-background py-12 md:py-20">
      <div className="max-w-7xl mx-auto px-4">
        <div className={`gold-panel ${personalised ? 'personal-stake' : ''} relative bg-card/40 backdrop-blur overflow-hidden`}>
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-transparent to-red-600/10 pointer-events-none" />
          <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 items-center p-8 md:p-10">
            <div>
              <p className="text-yellow-400 font-bold text-xs uppercase tracking-[0.3em] mb-2">
                {eyebrow}
              </p>
              {/* ─── headline + song line (UNCHANGED — lift from current DethronedPanel) ─── */}
              {/* ─── former → new champ row (UNCHANGED — lift) ─── */}
              <Link
                href={`/battle/${latest.battleId}`}
                className="inline-flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-6 rounded-lg uppercase tracking-widest text-sm transition"
              >
                <Play className="w-4 h-4" />
                {personalised ? 'Watch What Happened' : 'Watch the Moment'}
              </Link>
            </div>
            {/* ─── HERO_DETHRONED image block (UNCHANGED — lift) ─── */}
          </div>
        </div>
      </div>
    </section>
  );
}
```

⚠️ **Implementer:** the `// UNCHANGED — lift` comments mark where to copy the JSX from the OLD `DethronedPanel` body verbatim — the headline `<h2>`, the song-title line, the former/new champion avatars + labels, and the `<HERO_DETHRONED>` image block. Replace `latest.formerChampion.username` etc. — those references stay the same since `latest` is still in scope.

- [ ] **Step 4: Typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/page.tsx
git commit --author "azeemamanatali <azeemamanatali@users.noreply.github.com>" -m "feat(homepage): DethronedPanel personal mode (3-state with marquee fallback)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase E — Verification

### Task 14: Full verification

- [ ] **Step 1: Backend typecheck + full jest suite**

```bash
cd backend && npx tsc --noEmit && npx jest
```

Expected: typecheck clean, all tests pass (25 pre-existing + 6 new = ~31).

- [ ] **Step 2: Frontend typecheck**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 3: Manual QA checklist (from the spec)**

Boot the stack and verify each scenario in the spec's "Manual QA checklist":

- [ ] Anonymous visitor → both panels render marquee data
- [ ] Signed-in user with no votes/championships → both panels render marquee data
- [ ] Signed-in user with an active championship → AT RISK shows their song; eyebrow reads "YOUR CROWN AT RISK"; `.personal-stake` halo + "FOR YOU" pill visible
- [ ] Signed-in user who just lost a defense → DETHRONED shows the loss with "YOU JUST LOST THE CROWN" eyebrow
- [ ] Signed-in user who only votes → AT RISK and DETHRONED show voter-fallback content (where qualifying data exists)
- [ ] No visual regression in panel framing

- [ ] **Step 4: If everything passes, create a final "phase 3.0 personalization complete" commit (no code changes — empty or skipped)**

```bash
# Already committed task-by-task; no final commit needed.
git log --oneline -15
```

- [ ] **Step 5 (optional): Tag the milestone**

```bash
git tag -a phase-3-personalization -m "Phase 3 personalization landed — Crown at Risk + Dethroned panels now personally relevant per signed-in user"
```

---

## Plan Self-Review

**1. Spec coverage:**
- Backend `findMyAtRiskCrowns` (champion + voter) → Tasks 4-5 ✅
- Backend `findMyRecentDethronements` (champion + voter) → Tasks 6-7 ✅
- Predicate refactor for `findRecentDethronements` → Tasks 1-2 ✅
- DTO additions (`winnerPerformanceId`, `loserPerformanceId`) → Task 7 step 2 ✅
- Two `/users/me/*` routes → Task 8 ✅
- Module wiring → Task 9 ✅
- Frontend types + client → Task 10 ✅
- `.personal-stake` utility → Task 11 ✅
- 3-state CrownAtRiskPanel → Task 12 ✅
- 3-state DethronedPanel → Task 13 ✅
- Manual QA → Task 14 ✅

**2. Placeholder scan:** none — every step has either complete code or a clearly-marked "lift from old function" instruction with the lines identified. The two ⚠️ `Implementer:` callouts are intentional: they direct the implementer to copy JSX from the existing function rather than re-derive it.

**3. Type consistency:** `AtRiskCrownDto` and `PersonalDethronementDto` are defined identically on backend (Task 3) and frontend (Task 10). `findRecentDethronements`'s additional `winnerPerformanceId` / `loserPerformanceId` fields are added in both Task 7 (backend) and Task 10 (frontend interface). The optional predicate signature `(t: { current: Battle; previous: Battle }) => boolean` matches between Task 2 (definition) and Task 6 (consumer).

**4. Risk:** the Task 7 voter-fallback test depends on `findRecentDethronements` exposing `loserPerformanceId` (added in Task 7 step 2). If the implementer skips that DTO addition, the voter-fallback predicate (`myVote.performanceId === d.loserPerformanceId`) will fail silently. Task 7 step 2 must run before Task 7 step 3.
