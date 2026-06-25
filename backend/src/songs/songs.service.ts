import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Song, SongStatus } from './song.entity';
import { CreateSongDto, UpdateSongDto } from './songs.dto';
import { Battle } from '../battles/battle.entity';
import {
  ChallengeStatus,
  ChallengeSubmission,
} from '../battles/challenge-submission.entity';
import { User } from '../users/user.entity';
import { Video } from '../videos/video.entity';

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface SongRisk {
  survivalChance: number;
  riskLevel: RiskLevel;
  pendingChallengers: number;
  lastBattleMarginPercent: number | null;
}

@Injectable()
export class SongsService {
  constructor(
    @InjectRepository(Song) private readonly songs: Repository<Song>,
    @InjectRepository(Battle) private readonly battles: Repository<Battle>,
    @InjectRepository(ChallengeSubmission)
    private readonly challenges: Repository<ChallengeSubmission>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Video) private readonly videos: Repository<Video>,
  ) {}

  async create(dto: CreateSongDto, adminId: string) {
    const song = this.songs.create({
      title: dto.title.trim(),
      artist: dto.artist.trim(),
      trackUrl: dto.trackUrl?.trim() || null,
      coverArtUrl: dto.coverArtUrl?.trim() || null,
      status: 'active',
      createdByAdminId: adminId,
    });
    return this.songs.save(song);
  }

  async findAll(opts: {
    status?: SongStatus | 'all';
    limit?: number;
    offset?: number;
  } = {}) {
    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = opts.offset ?? 0;
    const qb = this.songs
      .createQueryBuilder('s')
      .orderBy('s.createdAt', 'DESC')
      // +1 to detect whether more rows exist beyond this page.
      .take(limit + 1)
      .skip(offset);
    if (opts.status && opts.status !== 'all') {
      qb.andWhere('s.status = :status', { status: opts.status });
    }
    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    };
  }

  async findOne(id: string) {
    const song = await this.songs.findOne({ where: { id } });
    if (!song) throw new NotFoundException('Song not found');
    return song;
  }

  async update(id: string, dto: UpdateSongDto) {
    const song = await this.findOne(id);

    // Bug #48 — block retiring a song that's currently hosting a live or
    // tie-pending battle. Retiring it mid-battle hides the song from
    // public surfaces while votes / decisions are still being recorded
    // against it, and reintroduces the same catalog-consistency issue
    // that the retired-song guard on performance assignment closes.
    // Admin must resolve or cancel the battle first.
    if (
      dto.status !== undefined &&
      dto.status === 'retired' &&
      song.status !== 'retired'
    ) {
      const activeBattle = await this.battles.findOne({
        where: { songId: id, status: In(['live', 'needs_decision']) },
      });
      if (activeBattle) {
        throw new ConflictException(
          `"${song.title}" has an active battle (${activeBattle.id}). Resolve or cancel that battle before retiring the song.`,
        );
      }
    }

    if (dto.title !== undefined) song.title = dto.title.trim();
    if (dto.artist !== undefined) song.artist = dto.artist.trim();
    if (dto.trackUrl !== undefined) song.trackUrl = dto.trackUrl.trim() || null;
    if (dto.coverArtUrl !== undefined) song.coverArtUrl = dto.coverArtUrl.trim() || null;
    if (dto.status !== undefined) song.status = dto.status;
    return this.songs.save(song);
  }

  /**
   * Update the denormalized champion fields after a battle closes.
   * Called by BattlesService — keep this surface narrow.
   */
  async setChampion(params: {
    songId: string;
    championUserId: string;
    championPerformanceId: string;
    /** True when the same user retained the song from the previous battle. */
    sameChampion: boolean;
  }) {
    const song = await this.findOne(params.songId);
    song.currentChampionUserId = params.championUserId;
    song.currentChampionPerformanceId = params.championPerformanceId;
    song.currentChampionStreak = params.sameChampion
      ? song.currentChampionStreak + 1
      : 1;
    return this.songs.save(song);
  }

  /**
   * Risk model — how at-risk is this song's defending champion?
   *
   * survivalChance starts at 100 and is decremented by:
   *   - 10 points per PENDING challenge submission (more challengers = more pressure)
   *   - 15 points if the most recent completed battle was won by < 10% margin
   *     (the audience nearly flipped the crown last round)
   *
   * Clamped to [5, 100]. Risk level bands:
   *   71-100 LOW   |  41-70 MODERATE  |  21-40 HIGH  |  0-20 CRITICAL
   *
   * Returns null fields when there isn't enough data (no prior battle).
   */
  async computeRisk(songId: string): Promise<SongRisk> {
    const [pendingChallengers, lastBattle] = await Promise.all([
      this.challenges.count({
        where: { songId, status: 'pending' as ChallengeStatus },
      }),
      this.battles.findOne({
        where: { songId, status: 'completed' },
        order: { closedAt: 'DESC' },
      }),
    ]);

    let survival = 100;
    survival -= Math.min(pendingChallengers * 10, 60);

    let lastMargin: number | null = null;
    if (lastBattle) {
      const total = lastBattle.voteCountA + lastBattle.voteCountB;
      if (total > 0) {
        const diff = Math.abs(lastBattle.voteCountA - lastBattle.voteCountB);
        lastMargin = Math.round((diff / total) * 100);
        if (lastMargin < 10) survival -= 15;
      }
    }

    survival = Math.max(5, Math.min(100, survival));
    const level: RiskLevel =
      survival <= 20 ? 'CRITICAL' : survival <= 40 ? 'HIGH' : survival <= 70 ? 'MODERATE' : 'LOW';

    return {
      survivalChance: survival,
      riskLevel: level,
      pendingChallengers,
      lastBattleMarginPercent: lastMargin,
    };
  }

  /**
   * The "marquee" song for the homepage — the song whose defending champion
   * is most impressive *right now*. Returns null when no active song has a
   * current champion (early-state platforms). Bundles champion user info +
   * risk score so the homepage CrownAtRiskPanel + ChampionSection can render
   * from a single request.
   *
   * Bug #81 — previously sorted on `currentChampionStreak DESC` (per-song
   * only). A user with a 2-defense crown on one song could outrank a
   * user on a 5-battle career win streak across multiple songs, which
   * felt wrong: the platform-wide "Defending Champion" should celebrate
   * the most-on-fire person, not the most-stubbornly-defended one song.
   * New ranking, primary → tiebreak:
   *   1. Champion's career `currentStreak` (joined from users) — the
   *      user winning more consecutive battles overall ranks higher.
   *   2. Per-song `currentChampionStreak` — among users with the same
   *      career streak, prefer the song they've held longest.
   *   3. Song id (deterministic tiebreak for a stable choice when both
   *      streaks tie — avoids flickering between equal entries).
   */
  async getFeatured(): Promise<{
    song: Song;
    champion: { username: string; avatarUrl: string | null } | null;
    titleDefenses: number;
    risk: SongRisk;
  } | null> {
    const song = await this.songs
      .createQueryBuilder('s')
      .leftJoin('users', 'u', 'u.id = s."currentChampionUserId"')
      .where('s.status = :status', { status: 'active' })
      .andWhere('s.currentChampionUserId IS NOT NULL')
      .andWhere('s.currentChampionStreak >= 1')
      .orderBy('u."currentStreak"', 'DESC')
      .addOrderBy('s.currentChampionStreak', 'DESC')
      .addOrderBy('s.id', 'ASC')
      .getOne();
    if (!song) return null;

    let champion: { username: string; avatarUrl: string | null } | null = null;
    if (song.currentChampionUserId) {
      const user = await this.users.findOne({
        where: { id: song.currentChampionUserId },
      });
      if (user) {
        champion = { username: user.username, avatarUrl: user.avatarUrl };
      }
    }

    const risk = await this.computeRisk(song.id);
    const titleDefenses = Math.max(0, song.currentChampionStreak - 1);

    return { song, champion, titleDefenses, risk };
  }

  toPublic(song: Song) {
    return {
      id: song.id,
      title: song.title,
      artist: song.artist,
      trackUrl: song.trackUrl,
      coverArtUrl: song.coverArtUrl,
      status: song.status,
      currentChampionUserId: song.currentChampionUserId,
      currentChampionPerformanceId: song.currentChampionPerformanceId,
      currentChampionStreak: song.currentChampionStreak,
      // Derived: defenses = streak - 1 (the initial coronation isn't a defense)
      currentChampionTitleDefenses: Math.max(0, song.currentChampionStreak - 1),
      createdAt: song.createdAt,
    };
  }
}
