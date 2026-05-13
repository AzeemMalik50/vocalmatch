import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThanOrEqual, Repository } from 'typeorm';
import { Battle, BattleStatus } from './battle.entity';
import { Vote } from './vote.entity';
import { Video } from '../videos/video.entity';
import { User } from '../users/user.entity';
import { SongsService } from '../songs/songs.service';
import { CreateBattleDto, ResolveTieDto } from './battles.dto';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * BattlesService is the heart of Phase 2A. It owns:
 *   - battle lifecycle (live → completed/needs_decision/cancelled)
 *   - the one-vote-per-user invariant (delegates to DB unique constraint)
 *   - winner determination + champion + streak writeback
 *   - the per-user vote-percentage gate (decision C)
 *
 * It deliberately keeps writes inside transactions where multiple rows
 * change atomically (vote cast: insert vote + increment count).
 */
@Injectable()
export class BattlesService {
  private readonly logger = new Logger(BattlesService.name);

  constructor(
    @InjectRepository(Battle) private readonly battles: Repository<Battle>,
    @InjectRepository(Vote) private readonly votes: Repository<Vote>,
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly songs: SongsService,
    private readonly notifications: NotificationsService,
    private readonly dataSource: DataSource,
  ) {}

  // ─── Creation ───────────────────────────────────────────────────

  async create(dto: CreateBattleDto, adminId: string) {
    if (dto.performanceAId === dto.performanceBId) {
      throw new BadRequestException(
        'A battle cannot have the same performance on both sides',
      );
    }
    const closesAt = new Date(dto.votingClosesAt);
    const opensAt = dto.votingOpensAt ? new Date(dto.votingOpensAt) : new Date();
    if (closesAt <= opensAt) {
      throw new BadRequestException('votingClosesAt must be after votingOpensAt');
    }

    // Validate both performances exist, share the song, and have the same song id
    const [a, b] = await Promise.all([
      this.videos.findOne({ where: { id: dto.performanceAId } }),
      this.videos.findOne({ where: { id: dto.performanceBId } }),
    ]);
    if (!a || !b) throw new NotFoundException('Performance not found');
    if (a.uploaderId === b.uploaderId) {
      throw new BadRequestException(
        'Both performances are by the same user — feels rigged',
      );
    }
    if (a.songId !== dto.songId || b.songId !== dto.songId) {
      throw new BadRequestException(
        'Both performances must be of the Centerstage Song selected for this battle',
      );
    }
    // Song must exist (will throw NotFound if not)
    await this.songs.findOne(dto.songId);

    // Block duplicate live battles for the same song. Postgres has a partial
    // unique index for this; keep the app-layer check for SQLite parity.
    const conflict = await this.battles.findOne({
      where: {
        songId: dto.songId,
        status: In(['live', 'needs_decision'] as BattleStatus[]),
      },
    });
    if (conflict) {
      throw new ConflictException(
        'There is already an active battle for this song',
      );
    }

    const battle = this.battles.create({
      songId: dto.songId,
      title: dto.title?.trim() || null,
      performanceAId: dto.performanceAId,
      performanceBId: dto.performanceBId,
      votingOpensAt: opensAt,
      votingClosesAt: closesAt,
      status: 'live',
      createdByAdminId: adminId,
    });
    return this.battles.save(battle);
  }

  // ─── Reads ──────────────────────────────────────────────────────

  async findAll(opts: { status?: BattleStatus; songId?: string } = {}) {
    const qb = this.battles.createQueryBuilder('b').orderBy('b.createdAt', 'DESC');
    if (opts.status) qb.andWhere('b.status = :status', { status: opts.status });
    if (opts.songId) qb.andWhere('b.songId = :songId', { songId: opts.songId });
    return qb.getMany();
  }

  async findOne(id: string) {
    const b = await this.battles.findOne({ where: { id } });
    if (!b) throw new NotFoundException('Battle not found');
    return b;
  }

  /**
   * The one-vote-per-user check, used by the API to gate vote-percentage
   * visibility (decision C).
   */
  async hasUserVoted(battleId: string, userId: string | undefined) {
    if (!userId) return false;
    const v = await this.votes.findOne({ where: { battleId, userId } });
    return !!v;
  }

  // ─── Voting ─────────────────────────────────────────────────────

  /**
   * Cast a vote. Wrapped in a transaction so the vote row insert and the
   * count increment land atomically. Returns the updated battle.
   *
   * Throws:
   *   - 409 if the user has already voted on this battle (unique violation)
   *   - 409 if the battle is not live
   *   - 400 if the performanceId doesn't match A or B
   *   - 403 if the voter is one of the participants (rigged)
   */
  async castVote(battleId: string, userId: string, performanceId: string) {
    return this.dataSource.transaction(async (manager) => {
      const battle = await manager
        .getRepository(Battle)
        .findOne({ where: { id: battleId } });
      if (!battle) throw new NotFoundException('Battle not found');
      if (battle.status !== 'live') {
        throw new ConflictException('Voting is closed for this battle');
      }
      if (
        performanceId !== battle.performanceAId &&
        performanceId !== battle.performanceBId
      ) {
        throw new BadRequestException(
          'performanceId must match one of the two performances in this battle',
        );
      }

      // Block self-votes
      const [a, b] = await Promise.all([
        manager.getRepository(Video).findOne({ where: { id: battle.performanceAId } }),
        manager.getRepository(Video).findOne({ where: { id: battle.performanceBId } }),
      ]);
      if (a?.uploaderId === userId || b?.uploaderId === userId) {
        throw new ConflictException(
          'Participants cannot vote in their own battle',
        );
      }

      try {
        await manager.getRepository(Vote).insert({
          battleId,
          userId,
          performanceId,
        });
      } catch (err: any) {
        // SQLite: SQLITE_CONSTRAINT (code 19); Postgres: 23505 unique_violation
        if (
          err?.code === 'SQLITE_CONSTRAINT' ||
          err?.code === '23505' ||
          /UNIQUE/i.test(err?.message ?? '')
        ) {
          throw new ConflictException('You have already voted in this battle');
        }
        throw err;
      }

      // Bump denormalized count
      const isA = performanceId === battle.performanceAId;
      await manager
        .getRepository(Battle)
        .increment({ id: battleId }, isA ? 'voteCountA' : 'voteCountB', 1);

      return manager.getRepository(Battle).findOne({ where: { id: battleId } });
    });
  }

  // ─── Closing & winner determination ─────────────────────────────

  /**
   * Called by the scheduler when `votingClosesAt <= now`. Also callable by
   * an admin for early close. Decides winner deterministically:
   *   - voteCountA > voteCountB → A wins
   *   - voteCountB > voteCountA → B wins
   *   - tie → status = needs_decision, no champion writeback yet
   */
  async closeBattle(id: string) {
    const battle = await this.findOne(id);
    if (battle.status !== 'live') {
      // Idempotent — already closed
      return battle;
    }

    if (battle.voteCountA === battle.voteCountB) {
      battle.status = 'needs_decision';
      await this.battles.save(battle);
      this.logger.log(
        `Battle ${id} closed as tie (${battle.voteCountA} vs ${battle.voteCountB}) — needs admin decision`,
      );
      return battle;
    }

    const aWins = battle.voteCountA > battle.voteCountB;
    return this.finalizeWinner(battle, aWins ? battle.performanceAId : battle.performanceBId);
  }

  /**
   * Admin manually picks the winner of a tied battle. Transitions
   * needs_decision → completed.
   */
  async resolveTie(battleId: string, dto: ResolveTieDto, adminId: string) {
    const battle = await this.findOne(battleId);
    if (battle.status !== 'needs_decision') {
      throw new ConflictException(
        'Only battles in needs_decision can be tie-resolved',
      );
    }
    if (
      dto.winnerPerformanceId !== battle.performanceAId &&
      dto.winnerPerformanceId !== battle.performanceBId
    ) {
      throw new BadRequestException(
        'winnerPerformanceId must be one of the two performances in this battle',
      );
    }
    battle.tieResolvedByAdminId = adminId;
    return this.finalizeWinner(battle, dto.winnerPerformanceId);
  }

  /**
   * Admin cancels a battle. Stat changes are NOT applied. Idempotent.
   */
  async cancel(id: string) {
    const battle = await this.findOne(id);
    if (battle.status === 'cancelled' || battle.status === 'completed') {
      return battle;
    }
    battle.status = 'cancelled';
    battle.closedAt = new Date();
    return this.battles.save(battle);
  }

  /**
   * Apply winner: status, stats writeback, champion + streak update.
   * Single source of truth — used by both auto-close and tie-resolution.
   */
  private async finalizeWinner(battle: Battle, winnerPerformanceId: string) {
    return this.dataSource.transaction(async (manager) => {
      const winnerPerformance = await manager
        .getRepository(Video)
        .findOne({ where: { id: winnerPerformanceId } });
      if (!winnerPerformance) {
        throw new NotFoundException('Winner performance not found');
      }
      const loserPerformanceId =
        winnerPerformanceId === battle.performanceAId
          ? battle.performanceBId
          : battle.performanceAId;
      const loserPerformance = await manager
        .getRepository(Video)
        .findOne({ where: { id: loserPerformanceId } });

      battle.status = 'completed';
      battle.winnerPerformanceId = winnerPerformanceId;
      battle.winnerUserId = winnerPerformance.uploaderId;
      battle.closedAt = new Date();
      await manager.getRepository(Battle).save(battle);

      // Stats writeback
      const winnerUser = await manager
        .getRepository(User)
        .findOne({ where: { id: winnerPerformance.uploaderId } });
      const loserUser = loserPerformance
        ? await manager
            .getRepository(User)
            .findOne({ where: { id: loserPerformance.uploaderId } })
        : null;

      if (winnerUser) {
        winnerUser.battleCount += 1;
        winnerUser.winCount += 1;
        winnerUser.currentStreak += 1;
        await manager.getRepository(User).save(winnerUser);
      }
      if (loserUser && loserUser.id !== winnerUser?.id) {
        loserUser.battleCount += 1;
        loserUser.currentStreak = 0;
        await manager.getRepository(User).save(loserUser);
      }

      // Champion writeback (denormalized on songs)
      const previousChampion = await manager
        .getRepository(Battle)
        .createQueryBuilder('b')
        .where('b.songId = :songId', { songId: battle.songId })
        .andWhere('b.status = :status', { status: 'completed' })
        .andWhere('b.id != :currentId', { currentId: battle.id })
        .orderBy('b.closedAt', 'DESC')
        .getOne();
      const sameChampion =
        !!previousChampion &&
        previousChampion.winnerUserId === winnerPerformance.uploaderId;

      await this.songs.setChampion({
        songId: battle.songId,
        championUserId: winnerPerformance.uploaderId,
        championPerformanceId: winnerPerformance.id,
        sameChampion,
      });

      this.logger.log(
        `Battle ${battle.id} completed — winner ${winnerPerformance.uploaderId} ` +
          `(${battle.voteCountA} vs ${battle.voteCountB})`,
      );

      return battle;
    });
  }

  /**
   * Find every live battle whose timer has expired. Used by the scheduler.
   */
  async findExpiredLive() {
    return this.battles.find({
      where: {
        status: 'live',
        votingClosesAt: LessThanOrEqual(new Date()),
      },
    });
  }

  /**
   * Find the most recent battle a video is part of, regardless of status.
   * Used by the videos controller to add battle context to /videos/:id —
   * the frontend uses this to redirect /v/:id → /battle/:battleId when the
   * video is currently in a live battle.
   *
   * Order of precedence: live > needs_decision > completed > cancelled. If a
   * video has been in multiple battles, prefer the active one; fall back to
   * the most recently closed.
   */
  async findLatestBattleForVideo(videoId: string) {
    return this.battles
      .createQueryBuilder('b')
      .where('b.performanceAId = :id OR b.performanceBId = :id', { id: videoId })
      .orderBy(
        // Live first, then needs_decision, then completed/cancelled by time
        `CASE b.status
           WHEN 'live' THEN 0
           WHEN 'needs_decision' THEN 1
           WHEN 'completed' THEN 2
           WHEN 'cancelled' THEN 3
         END`,
        'ASC',
      )
      .addOrderBy('b.createdAt', 'DESC')
      .getOne();
  }

  // ─── Public-facing serialization with vote-gating ────────────────

  /**
   * Per-user vote-percentage gate (decision C).
   *
   * If `requesterHasVoted === true`, return full standings. Otherwise
   * return a sanitized response — counts hidden, leader hidden.
   */
  toPublic(battle: Battle, requesterHasVoted: boolean) {
    const total = battle.voteCountA + battle.voteCountB;
    const showStandings =
      requesterHasVoted ||
      battle.status === 'completed' ||
      battle.status === 'needs_decision' ||
      battle.status === 'cancelled';

    const base = {
      id: battle.id,
      songId: battle.songId,
      title: battle.title,
      performanceAId: battle.performanceAId,
      performanceBId: battle.performanceBId,
      votingOpensAt: battle.votingOpensAt,
      votingClosesAt: battle.votingClosesAt,
      status: battle.status,
      winnerPerformanceId: battle.winnerPerformanceId,
      winnerUserId: battle.winnerUserId,
      createdAt: battle.createdAt,
      closedAt: battle.closedAt,
      requesterHasVoted,
    };

    if (!showStandings) {
      return {
        ...base,
        voteCountA: null as number | null,
        voteCountB: null as number | null,
        percentA: null as number | null,
        percentB: null as number | null,
        currentLeader: null as 'A' | 'B' | 'tie' | null,
        totalVotes: null as number | null,
      };
    }

    const percentA = total === 0 ? 0 : Math.round((battle.voteCountA / total) * 100);
    const percentB = total === 0 ? 0 : 100 - percentA;
    const leader: 'A' | 'B' | 'tie' =
      battle.voteCountA === battle.voteCountB
        ? 'tie'
        : battle.voteCountA > battle.voteCountB
          ? 'A'
          : 'B';
    return {
      ...base,
      voteCountA: battle.voteCountA,
      voteCountB: battle.voteCountB,
      percentA,
      percentB,
      currentLeader: total === 0 ? null : leader,
      totalVotes: total,
    };
  }
}
