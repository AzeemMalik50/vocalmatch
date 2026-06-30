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
      currentChampionTitleDefenses: Math.max(
        0,
        (s.currentChampionStreak ?? 0) - 1,
      ),
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

  it('is instantiable', () => {
    expect(service).toBeDefined();
  });

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
      expect(out[0].titleDefenses).toBe(2);
      expect(out[1].song.id).toBe('s-high');
    });

    it('voter fallback: user has no championships → returns HIGH/CRITICAL songs they voted on', async () => {
      const userId = 'me';
      songRepo.find.mockResolvedValue([]); // no championships

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
  });

  describe('findMyRecentDethronements', () => {
    it('champion mode: returns dethronements where caller was the previous champion', async () => {
      const userId = 'me';
      battlesService.findRecentDethronements.mockImplementation(
        async (_limit: number, predicate?: any) => {
          const all = [
            {
              battleId: 'b-1',
              songId: 's-1',
              songTitle: 'Mine',
              songArtist: 'A',
              dethronedAt: new Date('2026-06-09T00:00:00Z'),
              winnerVotePercent: 55,
              winnerPerformanceId: 'perf-new',
              loserPerformanceId: 'perf-old',
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
              winnerPerformanceId: 'perf-x',
              loserPerformanceId: 'perf-y',
              newChampion: { userId: 'x', username: 'x', avatarUrl: null },
              formerChampion: { userId: 'y', username: 'y', avatarUrl: null },
            },
          ];
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

    it('voter fallback: returns dethronements where caller voted for the loser', async () => {
      const userId = 'me';
      // First call (with predicate, champion-loss lookup) returns none
      battlesService.findRecentDethronements.mockResolvedValueOnce([]);
      // Second call (with predicate, "recent-takings" supersede check
      // added in Bug #80) returns none too
      battlesService.findRecentDethronements.mockResolvedValueOnce([]);
      // Third call (no predicate, voter fallback fetch) returns one
      battlesService.findRecentDethronements.mockResolvedValueOnce([
        {
          battleId: 'b-9',
          songId: 's-9',
          songTitle: 'Song',
          songArtist: 'Artist',
          dethronedAt: new Date(),
          winnerVotePercent: 58,
          winnerPerformanceId: 'perf-winner',
          loserPerformanceId: 'perf-loser',
          newChampion: { userId: 'winner', username: 'winner', avatarUrl: null },
          formerChampion: { userId: 'loser', username: 'loser', avatarUrl: null },
        },
      ]);
      voteRepo.find.mockResolvedValue([
        { battleId: 'b-9', performanceId: 'perf-loser', userId },
      ]);

      const out = await service.findMyRecentDethronements(userId);

      expect(out).toHaveLength(1);
      expect(out[0].mode).toBe('voter');
      expect(out[0].yourRole).toBe('voted-for-loser');
    });

    it('returns [] when user has neither champion losses nor losing votes', async () => {
      // 1: championLosses lookup, 2: recent-takings (Bug #80) check,
      // 3: voter fallback lookup. All empty.
      battlesService.findRecentDethronements.mockResolvedValueOnce([]);
      battlesService.findRecentDethronements.mockResolvedValueOnce([]);
      battlesService.findRecentDethronements.mockResolvedValueOnce([]);
      voteRepo.find.mockResolvedValue([]);
      const out = await service.findMyRecentDethronements('me');
      expect(out).toEqual([]);
    });

    it('Bug #80: suppresses a champion-loss superseded by a newer win on another song', async () => {
      // User lost song A 4 days ago, then won song B today. The
      // championLosses lookup returns the song-A dethronement. The
      // recent-takings lookup returns the song-B win. Because the
      // song-B win is newer, the song-A dethronement should be
      // suppressed and the panel should fall through to the voter
      // path (which also returns empty here, so the final result is []).
      const userId = 'me';
      const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
      const today = new Date();
      battlesService.findRecentDethronements.mockResolvedValueOnce([
        {
          battleId: 'b-old-loss',
          songId: 's-A',
          songTitle: 'Alpha b',
          songArtist: 'A',
          dethronedAt: fourDaysAgo,
          winnerVotePercent: 55,
          winnerPerformanceId: 'perf-new',
          loserPerformanceId: 'perf-old',
          newChampion: { userId: 'rival', username: 'rival', avatarUrl: null },
          formerChampion: { userId, username: 'me', avatarUrl: null },
        },
      ]);
      battlesService.findRecentDethronements.mockResolvedValueOnce([
        {
          battleId: 'b-fresh-win',
          songId: 's-B',
          songTitle: 'Sing with me',
          songArtist: 'B',
          dethronedAt: today,
          winnerVotePercent: 60,
          winnerPerformanceId: 'perf-mine',
          loserPerformanceId: 'perf-theirs',
          newChampion: { userId, username: 'me', avatarUrl: null },
          formerChampion: { userId: 'rival', username: 'rival', avatarUrl: null },
        },
      ]);
      // Voter fallback returns nothing → final result is [].
      battlesService.findRecentDethronements.mockResolvedValueOnce([]);
      voteRepo.find.mockResolvedValue([]);

      const out = await service.findMyRecentDethronements(userId);

      expect(out).toEqual([]);
    });
  });
});
