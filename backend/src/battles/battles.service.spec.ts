import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { Battle } from './battle.entity';
import { Vote } from './vote.entity';
import { ChallengeSubmission } from './challenge-submission.entity';
import { BattlesService } from './battles.service';
import { Video } from '../videos/video.entity';
import { User } from '../users/user.entity';
import { SongsService } from '../songs/songs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';

/**
 * Critical-path tests for BattlesService.
 *
 * These are unit tests with mocked repositories — they validate the
 * service's behavior (error mapping, state transitions, winner selection)
 * without spinning up a real database. The DB-level UNIQUE constraint is
 * verified separately by the production Postgres schema and the existing
 * 23505 → 409 translation in castVote().
 */
describe('BattlesService (critical paths)', () => {
  let service: BattlesService;

  /** Repository mocks. Tests override individual methods as needed. */
  const battleRepo: any = {
    findOne: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
    create: jest.fn(),
    increment: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const voteRepo: any = { findOne: jest.fn(), insert: jest.fn() };
  const videoRepo: any = { findOne: jest.fn() };
  const userRepo: any = { findOne: jest.fn(), save: jest.fn() };
  // Added when BattlesService gained the "dethronements" marquee — it
  // reads from this repo via a queryBuilder, so an empty mock is enough
  // to keep DI happy for the existing critical-path tests.
  const challengeSubmissionsRepo: any = {
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    // finalizeWinner runs `manager.getRepository(ChallengeSubmission).update`
    // as fire-and-forget, so the mock needs to return a thenable for `.catch`
    // to chain off.
    update: jest.fn().mockResolvedValue({}),
  };
  const songsService: any = { findOne: jest.fn(), setChampion: jest.fn() };
  const notificationsService: any = { create: jest.fn() };
  const realtimeService: any = { publish: jest.fn() };

  /**
   * Build a minimal DataSource stand-in. The service uses
   * dataSource.transaction(cb) — we just invoke the callback with a
   * fake `manager` whose getRepository() returns the same mocks.
   */
  const fakeManager: any = {
    getRepository: jest.fn((entity: any) => {
      if (entity === Battle) return battleRepo;
      if (entity === Vote) return voteRepo;
      if (entity === Video) return videoRepo;
      if (entity === User) return userRepo;
      // finalizeWinner now also flips the linked challenge submission's
      // status inside the transaction so the partial unique index is
      // released for the next challenger.
      if (entity === ChallengeSubmission) return challengeSubmissionsRepo;
      throw new Error(`No mock for ${entity?.name ?? entity}`);
    }),
  };
  const dataSource: any = {
    transaction: jest.fn((cb: any) => cb(fakeManager)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Re-seed default mock implementations cleared by `clearAllMocks` so the
    // fire-and-forget paths (e.g. update().catch(...) or notifications.create
    // (...).catch(...)) still get a thenable rather than undefined.
    challengeSubmissionsRepo.update.mockResolvedValue({});
    notificationsService.create.mockResolvedValue({});

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        BattlesService,
        { provide: getRepositoryToken(Battle), useValue: battleRepo },
        { provide: getRepositoryToken(Vote), useValue: voteRepo },
        { provide: getRepositoryToken(Video), useValue: videoRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        {
          provide: getRepositoryToken(ChallengeSubmission),
          useValue: challengeSubmissionsRepo,
        },
        { provide: SongsService, useValue: songsService },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: RealtimeService, useValue: realtimeService },
        { provide: DataSource, useValue: dataSource },
      ],
    }).compile();

    service = moduleRef.get(BattlesService);
  });

  // ─── Fixtures ─────────────────────────────────────────────────────

  const battleFixture = (overrides: Partial<Battle> = {}): Battle =>
    ({
      id: 'battle-1',
      songId: 'song-1',
      performanceAId: 'perf-a',
      performanceBId: 'perf-b',
      votingOpensAt: new Date(Date.now() - 60_000),
      votingClosesAt: new Date(Date.now() + 60_000),
      status: 'live',
      voteCountA: 0,
      voteCountB: 0,
      winnerPerformanceId: null,
      winnerUserId: null,
      createdByAdminId: 'admin-1',
      tieResolvedByAdminId: null,
      title: null,
      createdAt: new Date(),
      closedAt: null,
      ...overrides,
    }) as Battle;

  // ─── Tests ────────────────────────────────────────────────────────

  describe('one-vote-per-user enforcement', () => {
    it('translates a unique-violation (Postgres 23505) into a 409 ConflictException', async () => {
      const battle = battleFixture();
      battleRepo.findOne.mockResolvedValueOnce(battle);
      videoRepo.findOne
        .mockResolvedValueOnce({ id: 'perf-a', uploaderId: 'singer-a' })
        .mockResolvedValueOnce({ id: 'perf-b', uploaderId: 'singer-b' });
      voteRepo.insert.mockRejectedValueOnce({ code: '23505' });

      await expect(
        service.castVote(battle.id, 'voter-1', battle.performanceAId),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(battleRepo.increment).not.toHaveBeenCalled();
    });

    it('translates SQLite UNIQUE constraint failures into 409 as well', async () => {
      const battle = battleFixture();
      battleRepo.findOne.mockResolvedValueOnce(battle);
      videoRepo.findOne
        .mockResolvedValueOnce({ id: 'perf-a', uploaderId: 'singer-a' })
        .mockResolvedValueOnce({ id: 'perf-b', uploaderId: 'singer-b' });
      voteRepo.insert.mockRejectedValueOnce({ code: 'SQLITE_CONSTRAINT' });

      await expect(
        service.castVote(battle.id, 'voter-1', battle.performanceAId),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects votes on a non-live battle with 409', async () => {
      battleRepo.findOne.mockResolvedValueOnce(
        battleFixture({ status: 'completed' }),
      );

      await expect(
        service.castVote('battle-1', 'voter-1', 'perf-a'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(voteRepo.insert).not.toHaveBeenCalled();
    });

    it('blocks self-votes by either performer', async () => {
      battleRepo.findOne.mockResolvedValueOnce(battleFixture());
      videoRepo.findOne
        .mockResolvedValueOnce({ id: 'perf-a', uploaderId: 'singer-a' })
        .mockResolvedValueOnce({ id: 'perf-b', uploaderId: 'singer-b' });

      await expect(
        service.castVote('battle-1', 'singer-a', 'perf-a'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(voteRepo.insert).not.toHaveBeenCalled();
    });

    it('increments voteCountA when the vote is for performance A', async () => {
      const battle = battleFixture();
      battleRepo.findOne
        .mockResolvedValueOnce(battle) // initial fetch
        .mockResolvedValueOnce(battleFixture({ voteCountA: 1 })); // post-increment
      videoRepo.findOne
        .mockResolvedValueOnce({ id: 'perf-a', uploaderId: 'singer-a' })
        .mockResolvedValueOnce({ id: 'perf-b', uploaderId: 'singer-b' });
      voteRepo.insert.mockResolvedValueOnce(undefined);

      await service.castVote('battle-1', 'voter-1', 'perf-a');

      expect(battleRepo.increment).toHaveBeenCalledWith(
        { id: 'battle-1' },
        'voteCountA',
        1,
      );
    });
  });

  describe('tie handling', () => {
    it('closeBattle transitions a tied battle to needs_decision', async () => {
      const tied = battleFixture({ voteCountA: 2, voteCountB: 2 });
      battleRepo.findOne.mockResolvedValueOnce(tied);
      battleRepo.save.mockImplementation(async (b: any) => b);

      const result = await service.closeBattle(tied.id);

      expect(result.status).toBe('needs_decision');
      expect(result.winnerPerformanceId).toBeNull();
      expect(battleRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'needs_decision' }),
      );
    });

    it('resolveTie rejects when the battle is not in needs_decision', async () => {
      battleRepo.findOne.mockResolvedValueOnce(
        battleFixture({ status: 'live' }),
      );

      await expect(
        service.resolveTie(
          'battle-1',
          { winnerPerformanceId: 'perf-a' },
          'admin-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('resolveTie rejects a winnerPerformanceId that is not one of the two performances', async () => {
      battleRepo.findOne.mockResolvedValueOnce(
        battleFixture({ status: 'needs_decision' }),
      );

      await expect(
        service.resolveTie(
          'battle-1',
          { winnerPerformanceId: 'some-other-perf' },
          'admin-1',
        ),
      ).rejects.toThrow(/winnerPerformanceId/);
    });
  });

  describe('auto-close path (clear winner)', () => {
    it('closeBattle finalizes a battle with more A votes by setting winner=A and status=completed', async () => {
      const battle = battleFixture({ voteCountA: 5, voteCountB: 2 });
      // closeBattle reads via findOne (outside the txn) then opens a
      // transaction inside finalizeWinner. The mock manager + repo
      // already cover both paths.
      battleRepo.findOne.mockResolvedValue(battle);
      battleRepo.save.mockImplementation(async (b: any) => b);
      videoRepo.findOne.mockImplementation(async (q: any) => {
        if (q?.where?.id === 'perf-a')
          return { id: 'perf-a', uploaderId: 'singer-a' };
        if (q?.where?.id === 'perf-b')
          return { id: 'perf-b', uploaderId: 'singer-b' };
        return null;
      });
      userRepo.findOne.mockImplementation(async (q: any) => ({
        id: q.where.id,
        battleCount: 0,
        winCount: 0,
        currentStreak: 0,
      }));
      userRepo.save.mockImplementation(async (u: any) => u);
      battleRepo.createQueryBuilder.mockReturnValue({
        where: () => ({
          andWhere: () => ({
            andWhere: () => ({
              orderBy: () => ({ getOne: async () => null }),
            }),
          }),
        }),
      });

      const result = await service.closeBattle(battle.id);

      expect(result.status).toBe('completed');
      expect(result.winnerPerformanceId).toBe('perf-a');
      expect(result.winnerUserId).toBe('singer-a');
      expect(result.closedAt).toBeTruthy();
      expect(songsService.setChampion).toHaveBeenCalledWith(
        expect.objectContaining({
          songId: battle.songId,
          championUserId: 'singer-a',
          championPerformanceId: 'perf-a',
        }),
      );
    });

    it('closeBattle is idempotent — calling it on an already-completed battle is a no-op', async () => {
      const done = battleFixture({ status: 'completed' });
      battleRepo.findOne.mockResolvedValueOnce(done);

      const result = await service.closeBattle(done.id);

      expect(result).toBe(done);
      expect(battleRepo.save).not.toHaveBeenCalled();
    });

    it('closeBattle throws NotFoundException when the battle does not exist', async () => {
      battleRepo.findOne.mockResolvedValueOnce(null);

      await expect(service.closeBattle('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

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
});
