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
import { ChallengeSubmission } from './challenge-submission.entity';
import { Video } from '../videos/video.entity';
import { User } from '../users/user.entity';
import { Song } from '../songs/song.entity';
import { SongsService } from '../songs/songs.service';
import { CreateBattleDto, ResolveTieDto } from './battles.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeService } from '../realtime/realtime.service';

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
    @InjectRepository(ChallengeSubmission)
    private readonly challengeSubmissions: Repository<ChallengeSubmission>,
    private readonly songs: SongsService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Build the public vote-count payload for SSE. Mirrors the fields
   * toPublic() exposes — the frontend can merge these into its battle
   * state without a refetch.
   */
  /**
   * Broadcast a list-level lifecycle event on the public `lobby` channel
   * so the homepage (HomeBattleStatus / FeaturedBattle / RecentWinners)
   * can update without a full refetch. Carries only public fields —
   * vote counts are NOT included so the gate stays honest for not-yet-voters.
   */
  private publishLobby(
    battle: Battle,
    change: 'created' | 'updated' | 'closed' | 'cancelled' | 'needs_decision',
  ): void {
    this.realtime.publish(RealtimeService.lobbyChannel(), 'lifecycle', {
      battleId: battle.id,
      songId: battle.songId,
      status: battle.status,
      winnerPerformanceId: battle.winnerPerformanceId ?? null,
      winnerUserId: battle.winnerUserId ?? null,
      closedAt: battle.closedAt ?? null,
      change,
    });
  }

  private buildLiveCountsPayload(battle: Battle) {
    const total = battle.voteCountA + battle.voteCountB;
    const percentA = total === 0 ? 0 : Math.round((battle.voteCountA / total) * 100);
    const percentB = total === 0 ? 0 : 100 - percentA;
    const leader: 'A' | 'B' | 'tie' =
      battle.voteCountA === battle.voteCountB
        ? 'tie'
        : battle.voteCountA > battle.voteCountB
          ? 'A'
          : 'B';
    return {
      battleId: battle.id,
      voteCountA: battle.voteCountA,
      voteCountB: battle.voteCountB,
      percentA,
      percentB,
      currentLeader: total === 0 ? null : leader,
      totalVotes: total,
      status: battle.status,
    };
  }

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
    const song = await this.songs.findOne(dto.songId);

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

    // Bug #56 — when admin created a battle without a title, the DB
    // stored null. The list page rendered "Untitled battle", but the
    // detail page synthesized a different fallback ("Battle · <song>"),
    // so the same battle had two different names depending on where
    // you looked at it. Auto-generate a title at write time using the
    // song name (mirrors what `createBattleFromChallenge` already does
    // for promoted challenges), so going forward `battle.title` is
    // always populated and both list + detail render identically.
    const explicitTitle = dto.title?.trim() || null;
    const battle = this.battles.create({
      songId: dto.songId,
      title: explicitTitle ?? `Battle · ${song.title}`,
      performanceAId: dto.performanceAId,
      performanceBId: dto.performanceBId,
      votingOpensAt: opensAt,
      votingClosesAt: closesAt,
      status: 'live',
      createdByAdminId: adminId,
    });
    const saved = await this.battles.save(battle);

    // Bug #22 — `createBattleFromChallenge` already notifies both
    // performers, but a plain admin-created battle (outside the Red
    // Phone flow) never told either uploader their battle was now live.
    // Fire-and-forget battle_starting notifications to both, with
    // distinct copy so they read as "you're up" vs "you're being
    // challenged" only when one side is actually the defending champion.
    const battleHref = `/battle/${saved.id}`;
    const songLabel = song.title;
    const championUserId = song.currentChampionUserId ?? null;
    for (const performer of [a, b]) {
      const isChampion = championUserId === performer.uploaderId;
      this.notifications
        .create({
          userId: performer.uploaderId,
          kind: 'battle_starting',
          title: isChampion
            ? 'Your crown is being contested.'
            : 'Your battle just went live.',
          body: isChampion
            ? `A challenger is taking you on for ${songLabel}. Voting is open now.`
            : `You're going head-to-head on ${songLabel}. Share the link and rally your voters.`,
          href: battleHref,
        })
        .catch((err) =>
          this.logger.error(
            `Failed to notify performer ${performer.uploaderId} of new battle: ${err}`,
          ),
        );
    }

    // Lifecycle broadcast — drives the homepage live-battles grid and
    // FeaturedBattle without polling.
    this.publishLobby(saved, 'created');

    return saved;
  }

  // ─── Reads ──────────────────────────────────────────────────────

  async findAll(opts: {
    status?: BattleStatus;
    songId?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = opts.offset ?? 0;
    const qb = this.battles
      .createQueryBuilder('b')
      .orderBy('b.createdAt', 'DESC')
      // +1 to detect whether more rows exist beyond this page, without a COUNT.
      .take(limit + 1)
      .skip(offset);
    if (opts.status) qb.andWhere('b.status = :status', { status: opts.status });
    if (opts.songId) qb.andWhere('b.songId = :songId', { songId: opts.songId });
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

      const updated = await manager
        .getRepository(Battle)
        .findOne({ where: { id: battleId } });

      // Push the new counts to anyone watching this battle in real time.
      // Subscribers are already filtered by the gate (RealtimeController only
      // subscribes voters / admins to the battle channel), so this can't
      // leak counts to a not-yet-voted client.
      if (updated) {
        this.realtime.publish(
          RealtimeService.battleChannel(battleId),
          'vote',
          this.buildLiveCountsPayload(updated),
        );
      }

      return updated;
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
      this.realtime.publish(
        RealtimeService.battleChannel(id),
        'status',
        this.buildLiveCountsPayload(battle),
      );
      this.publishLobby(battle, 'needs_decision');
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
   * Bug #17 — previously there was no realtime publish on cancel, so
   * anyone holding the homepage or battle page open kept seeing the
   * battle as "live" until they hit refresh. Push the status event so
   * subscribers can react immediately.
   */
  async cancel(id: string) {
    const battle = await this.findOne(id);
    if (battle.status === 'cancelled' || battle.status === 'completed') {
      return battle;
    }
    battle.status = 'cancelled';
    battle.closedAt = new Date();
    const saved = await this.battles.save(battle);

    // Bug #6 (also) — release the linked challenge row so a new
    // challenger can queue against this song without admin cleanup.
    // See the parallel fix in finalizeWinner.
    this.challengeSubmissions
      .update(
        { resultingBattleId: saved.id, status: 'selected' },
        { status: 'completed' },
      )
      .catch((err) =>
        this.logger.error(
          `Failed to mark challenge submission completed for cancelled battle ${saved.id}: ${err}`,
        ),
      );

    this.realtime.publish(
      RealtimeService.battleChannel(saved.id),
      'status',
      {
        ...this.buildLiveCountsPayload(saved),
        status: 'cancelled',
        closedAt: saved.closedAt,
      },
    );
    this.publishLobby(saved, 'cancelled');

    // Bug #60 — cancel published a realtime status event for clients
    // that already had the battle open, but persisted no notification.
    // Anyone who wasn't on the page never found out their battle had
    // been cancelled. Send a `battle_cancelled` to both performers.
    // Fire-and-forget; a failed lookup or write shouldn't block the
    // cancel itself.
    void this.notifyCancelled(saved).catch((err) =>
      this.logger.error(
        `Failed to send cancellation notifications for battle ${saved.id}: ${err}`,
      ),
    );

    return saved;
  }

  /** Look up both performers + the song title, then write a
   *  `battle_cancelled` notification per performer. Extracted so the
   *  cancel path stays linear-readable. */
  private async notifyCancelled(battle: Battle) {
    const [a, b, song] = await Promise.all([
      this.videos.findOne({ where: { id: battle.performanceAId } }),
      this.videos.findOne({ where: { id: battle.performanceBId } }),
      this.songs.findOne(battle.songId).catch(() => null),
    ]);
    const songLabel = song?.title ?? 'a Centerstage Song';
    const uploaderIds = Array.from(
      new Set(
        [a?.uploaderId, b?.uploaderId].filter(
          (uid): uid is string => !!uid,
        ),
      ),
    );
    await Promise.all(
      uploaderIds.map((userId) =>
        this.notifications
          .create({
            userId,
            kind: 'battle_cancelled',
            title: 'Your battle was cancelled.',
            body: `Admin cancelled the battle on ${songLabel}. No winner was declared and no stats changed — a fresh matchup can be queued for this song.`,
            href: `/battle/${battle.id}`,
          })
          .catch((err) =>
            this.logger.error(
              `Failed to notify ${userId} of cancelled battle ${battle.id}: ${err}`,
            ),
          ),
      ),
    );
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

      // Bug #67 — `User.championTitle` is read all over the app (the
      // "★ Champion" badge on performance cards, the winner snapshot
      // on battle DTOs, etc.) but nothing ever wrote to it. So a user
      // who'd won multiple battles still appeared with no champion
      // status. The QA report: "champion status only updates when a
      // user wins or loses a battle for the song featured in the
      // section — should reflect overall standing."
      //
      // Keep championTitle in sync with reality on every finalize:
      // count how many songs each side currently champions. ≥ 1 →
      // 'Champion'; 0 → clear. The winner just gained this song's
      // crown (so they'll be ≥ 1). The loser either:
      //   - was the previous champion of this song (now lost it, may
      //     or may not still champion other songs), or
      //   - was a non-champion challenger (count unchanged).
      // Querying covers both cases uniformly.
      await this.syncChampionTitle(manager, winnerPerformance.uploaderId);
      if (loserPerformance) {
        await this.syncChampionTitle(manager, loserPerformance.uploaderId);
      }

      this.logger.log(
        `Battle ${battle.id} completed — winner ${winnerPerformance.uploaderId} ` +
          `(${battle.voteCountA} vs ${battle.voteCountB})`,
      );

      // Push the final-state event so anyone watching the battle page
      // sees the winner appear without a refresh.
      this.realtime.publish(
        RealtimeService.battleChannel(battle.id),
        'status',
        {
          ...this.buildLiveCountsPayload(battle),
          winnerPerformanceId: battle.winnerPerformanceId,
          winnerUserId: battle.winnerUserId,
          closedAt: battle.closedAt,
        },
      );
      this.publishLobby(battle, 'closed');

      // Bug #6 — once the battle finalizes, the linked challenge row
      // (still status='selected') was blocking new challengers on the
      // same song because the `one_active_challenger_per_song` partial
      // unique index includes 'selected'. Flip it to 'completed' here
      // so the next user can queue without the admin having to clear
      // anything manually. Fire-and-forget — a notify-only failure
      // shouldn't roll back finalization.
      manager
        .getRepository(ChallengeSubmission)
        .update(
          { resultingBattleId: battle.id, status: 'selected' },
          { status: 'completed' },
        )
        .catch((err) =>
          this.logger.error(
            `Failed to mark challenge submission completed for battle ${battle.id}: ${err}`,
          ),
        );

      // Bug #4 / #22 — neither side was being notified that the battle
      // closed. Fire a `battle_result` notification at the winner and
      // (if distinct) the loser so the bell + email pipeline can pick
      // it up. Fire-and-forget so a notification failure doesn't roll
      // back the transaction.
      const battleHref = `/battle/${battle.id}`;
      if (winnerUser) {
        this.notifications
          .create({
            userId: winnerUser.id,
            kind: 'battle_result',
            title: 'You took the crown.',
            body: 'Your battle closed and the votes named you the Official Voice. Share the moment.',
            href: battleHref,
          })
          .catch((err) =>
            this.logger.error(`Failed to notify winner of battle_result: ${err}`),
          );
      }
      if (loserUser && loserUser.id !== winnerUser?.id) {
        this.notifications
          .create({
            userId: loserUser.id,
            kind: 'battle_result',
            title: 'Battle closed.',
            body: 'You didn\'t take the crown this time. Watch the vote breakdown and plan the next challenge.',
            href: battleHref,
          })
          .catch((err) =>
            this.logger.error(`Failed to notify loser of battle_result: ${err}`),
          );
      }

      return battle;
    });
  }

  /**
   * Bug #67 — keep `User.championTitle` in sync with how many song
   * crowns the user currently holds. Called for both the winner and
   * the loser after a battle finalizes. Runs inside the finalize
   * transaction so the title state always matches the song writeback.
   *
   * Semantics: the user is a "Champion" when they currently hold at
   * least one song's championship; otherwise the title is cleared.
   * This matches what the UI surfaces — a `championTitle` of
   * "Champion" means "this person currently owns at least one crown
   * somewhere on the platform," regardless of which specific song
   * the viewer is looking at.
   */
  private async syncChampionTitle(
    manager: import('typeorm').EntityManager,
    userId: string,
  ) {
    const crowns = await manager.getRepository(Song).count({
      where: { currentChampionUserId: userId },
    });
    const desired = crowns > 0 ? 'Champion' : null;
    const user = await manager
      .getRepository(User)
      .findOne({ where: { id: userId } });
    if (!user) return;
    if (user.championTitle === desired) return;
    user.championTitle = desired;
    await manager.getRepository(User).save(user);
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
   * Recent dethronements — completed battles where the winner is NOT the
   * same user as the previous completed battle's winner for that song
   * (i.e. the crown changed hands). Enriched with song title, former
   * champion + new champion usernames/avatars, and the winning margin
   * so the homepage "Dethroned!" panel can render from a single fetch.
   *
   * Overfetches recent completed battles, groups by song, and walks the
   * adjacent pairs in code — cleaner than the equivalent self-join SQL
   * and fast enough for the homepage volume.
   */
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
      // Bug #52 — previously this loop emitted EVERY adjacent change-of-
      // hands in the song's history. That meant a user who was once
      // dethroned and then later reclaimed the crown still surfaced as
      // a "former champion" forever (the older transition kept matching
      // even though their current state is `defending champion`). Each
      // song should contribute only its CURRENT crown state — i.e. the
      // most-recent transition. Anything older has been superseded by
      // whatever happened next.
      if (battles.length < 2) continue;
      const current = battles[0];
      const previous = battles[1];
      if (
        current.winnerUserId &&
        previous.winnerUserId &&
        current.winnerUserId !== previous.winnerUserId
      ) {
        transitions.push({ current, previous });
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
        winnerPerformanceId: current.winnerPerformanceId,
        loserPerformanceId:
          current.winnerPerformanceId === current.performanceAId
            ? current.performanceBId
            : current.performanceAId,
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
   * `requesterHasVoted` is LITERAL — true only when the caller has a vote
   * row for this battle. `canSeeStandings` is what gates count visibility
   * (admins / completed / cancelled battles always pass; non-admin voters
   * unlock by casting their vote). The two are surfaced separately because
   * the frontend uses them for different decisions — vote-button visibility
   * vs. standings panel visibility. Conflating them caused admins viewing
   * a fresh battle to see "Vote locked in" copy and no vote UI.
   */
  toPublic(
    battle: Battle,
    opts: {
      requesterHasVoted: boolean;
      canSeeStandings: boolean;
      /**
       * Optional winner-user snapshot. Lets the controller surface the
       * winner's identity (username, avatar, streak) without the
       * frontend having to fetch the winning video — important because
       * once a video is soft-deleted, the videos endpoint 404s and the
       * UI was falling back to a generic "Crowned" label. The user
       * identity is preserved on the battle (`winnerUserId`) even when
       * the media is gone.
       */
      winnerUser?: User | null;
    },
  ) {
    const { requesterHasVoted, canSeeStandings, winnerUser } = opts;
    const total = battle.voteCountA + battle.voteCountB;
    const showStandings =
      canSeeStandings ||
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
      winnerUser: winnerUser
        ? {
            id: winnerUser.id,
            username: winnerUser.username,
            avatarUrl: winnerUser.avatarUrl,
            championTitle: winnerUser.championTitle,
            currentStreak: winnerUser.currentStreak,
          }
        : null,
      createdAt: battle.createdAt,
      closedAt: battle.closedAt,
      requesterHasVoted,
      canSeeStandings: showStandings,
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
