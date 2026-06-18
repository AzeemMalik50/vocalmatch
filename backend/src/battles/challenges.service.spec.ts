import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

import { ChallengeSubmission } from './challenge-submission.entity';
import { Battle } from './battle.entity';
import { Video } from '../videos/video.entity';
import { User } from '../users/user.entity';
import { ChallengesService } from './challenges.service';
import { BattlesService } from './battles.service';
import { SongsService } from '../songs/songs.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Critical-path tests for the Red Phone (Phase 2B) flow.
 * Mocks the repos and downstream services so we're exercising the
 * service logic, not the DB.
 */
describe('ChallengesService (critical paths)', () => {
  let service: ChallengesService;

  const subRepo: any = {
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => ({ id: v.id ?? 'new-id', ...v })),
    findOne: jest.fn(),
    find: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  /**
   * Helper — return a chainable QueryBuilder mock whose `.getOne()` resolves
   * to the supplied row. `createSubmission` uses a leftJoin-where-andWhere-
   * getOne chain to look for blocking rows; tests that exercise that path
   * point `subRepo.createQueryBuilder` at one of these per call.
   */
  function qb(getOneResult: any) {
    const chain: any = {};
    chain.leftJoin = jest.fn(() => chain);
    chain.where = jest.fn(() => chain);
    chain.andWhere = jest.fn(() => chain);
    chain.getOne = jest.fn().mockResolvedValue(getOneResult);
    return chain;
  }
  const videoRepo: any = { findOne: jest.fn(), save: jest.fn() };
  const battleRepo: any = {};
  const userRepo: any = { findOne: jest.fn() };
  const songs: any = { findOne: jest.fn() };
  const notifications: any = { create: jest.fn().mockResolvedValue({}) };
  const battlesService: any = { create: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    // `clearAllMocks` wipes default mock implementations too — re-seed the
    // ones the service relies on as fire-and-forget promises so they don't
    // resolve to `undefined` and break the trailing `.catch(...)`.
    subRepo.create.mockImplementation((v) => v);
    subRepo.save.mockImplementation(async (v) => ({ id: v.id ?? 'new-id', ...v }));
    notifications.create.mockResolvedValue({});
    // createBattleFromChallenge looks up the challenger to build the
    // auto-title via `users.findOne(...).catch(() => null)`. A non-thenable
    // here breaks the `.catch` chain.
    userRepo.findOne.mockResolvedValue(null);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        ChallengesService,
        { provide: getRepositoryToken(ChallengeSubmission), useValue: subRepo },
        { provide: getRepositoryToken(Video), useValue: videoRepo },
        { provide: getRepositoryToken(Battle), useValue: battleRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: SongsService, useValue: songs },
        { provide: NotificationsService, useValue: notifications },
        { provide: BattlesService, useValue: battlesService },
      ],
    }).compile();

    service = moduleRef.get(ChallengesService);
  });

  // ─── createSubmission ────────────────────────────────────────────

  describe('createSubmission', () => {
    // Return fresh objects per test — the service mutates the video object
    // (`video.category = 'challenge_entry'`), so sharing across tests leaks
    // state between assertions.
    const baseSong = () => ({
      id: 'song-1',
      currentChampionUserId: 'champion-1',
      currentChampionPerformanceId: 'champ-perf',
    });
    const baseVideo = () => ({
      id: 'video-1',
      uploaderId: 'challenger-1',
      songId: 'song-1',
      category: 'solo',
    });

    it('blocks the current champion from challenging their own song', async () => {
      songs.findOne.mockResolvedValueOnce({
        ...baseSong(),
        currentChampionUserId: 'challenger-1',
      });
      await expect(
        service.createSubmission({
          songId: 'song-1',
          userId: 'challenger-1',
          videoId: 'video-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects submitting someone else\'s video', async () => {
      songs.findOne.mockResolvedValueOnce(baseSong());
      videoRepo.findOne.mockResolvedValueOnce({ ...baseVideo(), uploaderId: 'someone-else' });
      await expect(
        service.createSubmission({
          songId: 'song-1',
          userId: 'challenger-1',
          videoId: 'video-1',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects a video whose songId doesn\'t match the song being challenged', async () => {
      songs.findOne.mockResolvedValueOnce(baseSong());
      videoRepo.findOne.mockResolvedValueOnce({ ...baseVideo(), songId: 'a-different-song' });
      await expect(
        service.createSubmission({
          songId: 'song-1',
          userId: 'challenger-1',
          videoId: 'video-1',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a second pending challenge for the same song (app-layer)', async () => {
      songs.findOne.mockResolvedValueOnce(baseSong());
      videoRepo.findOne.mockResolvedValueOnce(baseVideo());
      // Service now does the duplicate-check via createQueryBuilder, not
      // submissions.findOne — point the QB at an active blocking row.
      subRepo.createQueryBuilder.mockReturnValueOnce(
        qb({ id: 'existing-pending', status: 'pending' }),
      );
      await expect(
        service.createSubmission({
          songId: 'song-1',
          userId: 'challenger-1',
          videoId: 'video-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('translates a Postgres unique-violation into a 409', async () => {
      songs.findOne.mockResolvedValueOnce(baseSong());
      videoRepo.findOne.mockResolvedValueOnce(baseVideo());
      // App-layer check finds no blocker, then the DB insert fails with the
      // partial-unique-index violation (race condition with another tab).
      subRepo.createQueryBuilder.mockReturnValueOnce(qb(null));
      videoRepo.save.mockResolvedValueOnce(baseVideo());
      subRepo.save.mockRejectedValueOnce({ code: '23505' });

      await expect(
        service.createSubmission({
          songId: 'song-1',
          userId: 'challenger-1',
          videoId: 'video-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('on success: marks the video as a challenge entry and inserts the row', async () => {
      songs.findOne.mockResolvedValueOnce(baseSong());
      videoRepo.findOne.mockResolvedValueOnce(baseVideo());
      subRepo.createQueryBuilder.mockReturnValueOnce(qb(null));
      videoRepo.save.mockResolvedValueOnce({ ...baseVideo(), category: 'challenge_entry' });

      await service.createSubmission({
        songId: 'song-1',
        userId: 'challenger-1',
        videoId: 'video-1',
      });

      expect(videoRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ category: 'challenge_entry' }),
      );
      expect(subRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          songId: 'song-1',
          userId: 'challenger-1',
          videoId: 'video-1',
          status: 'pending',
        }),
      );
    });
  });

  // ─── select ──────────────────────────────────────────────────────

  describe('select', () => {
    it('rejects selecting a non-pending submission', async () => {
      subRepo.findOne.mockResolvedValueOnce({
        id: 'c1',
        status: 'rejected',
      });
      await expect(service.select('c1', 'admin-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('is idempotent: selecting an already-selected one is a no-op', async () => {
      subRepo.findOne.mockResolvedValueOnce({
        id: 'c1',
        status: 'selected',
      });
      const result = await service.select('c1', 'admin-1');
      expect(result.status).toBe('selected');
      expect(subRepo.save).not.toHaveBeenCalled();
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('transitions pending → selected, writes a notification, records the admin', async () => {
      subRepo.findOne.mockResolvedValueOnce({
        id: 'c1',
        status: 'pending',
        songId: 'song-1',
        userId: 'challenger-1',
      });
      songs.findOne.mockResolvedValueOnce({ id: 'song-1', title: 'Hallelujah' });

      const result = await service.select('c1', 'admin-1');

      expect(result.status).toBe('selected');
      expect(result.decidedAt).toBeTruthy();
      expect(result.decidedByAdminId).toBe('admin-1');

      // Notification scheduling is fire-and-forget; give the microtask queue a tick.
      await new Promise((r) => setImmediate(r));

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'challenger-1',
          kind: 'challenger_selected',
        }),
      );
    });
  });

  // ─── createBattleFromChallenge ──────────────────────────────────

  describe('createBattleFromChallenge', () => {
    it('rejects if the submission isn\'t selected', async () => {
      subRepo.findOne.mockResolvedValueOnce({ id: 'c1', status: 'pending' });
      await expect(
        service.createBattleFromChallenge('c1', 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects if a battle was already created from this challenge', async () => {
      subRepo.findOne.mockResolvedValueOnce({
        id: 'c1',
        status: 'selected',
        resultingBattleId: 'b-existing',
      });
      await expect(
        service.createBattleFromChallenge('c1', 'admin-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects if the song has no current champion', async () => {
      subRepo.findOne.mockResolvedValueOnce({
        id: 'c1',
        status: 'selected',
        songId: 'song-1',
        videoId: 'video-c',
        resultingBattleId: null,
      });
      songs.findOne.mockResolvedValueOnce({
        id: 'song-1',
        currentChampionPerformanceId: null,
      });
      await expect(
        service.createBattleFromChallenge('c1', 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('delegates to battlesService.create with champion vs challenger and stores the resulting battle id', async () => {
      subRepo.findOne.mockResolvedValueOnce({
        id: 'c1',
        status: 'selected',
        songId: 'song-1',
        videoId: 'video-challenger',
        resultingBattleId: null,
      });
      songs.findOne.mockResolvedValueOnce({
        id: 'song-1',
        currentChampionPerformanceId: 'champ-perf',
      });
      battlesService.create.mockResolvedValueOnce({
        id: 'new-battle',
        songId: 'song-1',
        status: 'live',
      });

      const battle = await service.createBattleFromChallenge('c1', 'admin-1', {
        hours: 24,
      });

      expect(battle.id).toBe('new-battle');
      expect(battlesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          songId: 'song-1',
          performanceAId: 'champ-perf',
          performanceBId: 'video-challenger',
        }),
        'admin-1',
      );
      expect(subRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ resultingBattleId: 'new-battle' }),
      );
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────

  it('findOne throws NotFoundException when the row is missing', async () => {
    subRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.findOne('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
