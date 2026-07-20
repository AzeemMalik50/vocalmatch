import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import { ChallengeSubmission, ChallengeStatus } from './challenge-submission.entity';
import { Battle } from './battle.entity';
import { Video } from '../videos/video.entity';
import { User } from '../users/user.entity';
import { SongsService } from '../songs/songs.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BattlesService } from './battles.service';

/**
 * Phase 2B — Red Phone challenge flow.
 *
 * Lifecycle:
 *   user uploads a performance ── createSubmission ──▶ pending
 *   admin picks one ─────────── select ──────────────▶ selected
 *     ─ writes a 'challenger_selected' notification (no email yet)
 *   admin picks none ─────────── reject ──────────────▶ rejected
 *   admin promotes a selected ── createBattleFromChallenge ─▶ new live battle
 *     ─ records the resultingBattleId on the submission
 *     ─ uses the song's current champion's performance as side A
 *
 * The "champion identity" + "battle prestige" design notes:
 *   - submissions surface the song's current champion + streak inline so the
 *     challenger's intent is clear at decision time.
 *   - when a battle is created from a challenge, the existing battle service
 *     enforces the same same-song / different-uploader / one-live-per-song
 *     guarantees, so the prestige loop never sees an invalid pairing.
 */
@Injectable()
export class ChallengesService {
  private readonly logger = new Logger(ChallengesService.name);

  constructor(
    @InjectRepository(ChallengeSubmission)
    private readonly submissions: Repository<ChallengeSubmission>,
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    @InjectRepository(Battle) private readonly battles: Repository<Battle>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly songs: SongsService,
    private readonly notifications: NotificationsService,
    private readonly battlesService: BattlesService,
  ) {}

  // ─── User-facing: submit a challenge ─────────────────────────────

  /**
   * Register an uploaded performance as a challenge for the given song.
   * The video must already exist, belong to this user, and be linked to
   * this song (the typeahead on /upload enforces that client-side).
   *
   * Rejects with:
   *   - 404 if the song or video doesn't exist
   *   - 403 if the video isn't this user's
   *   - 400 if the video isn't tagged with the song
   *   - 409 if the user is already the current champion (no self-challenge)
   *   - 409 if a pending or selected challenge already exists for the song
   *     (DB partial unique index is the source of truth)
   */
  async createSubmission(params: {
    songId: string;
    userId: string;
    videoId: string;
  }) {
    const song = await this.songs.findOne(params.songId); // throws 404

    // Bug #49 — Red Phone challenges have no meaning until the song has
    // a defending champion. The original gate was deep in the
    // promote-to-battle step (`createBattleFromChallenge`), which let
    // the user upload + queue + wait, only to have admin discover the
    // mismatch days later. Validate at submission time so the user is
    // told immediately and steered to a real target.
    if (!song.currentChampionUserId || !song.currentChampionPerformanceId) {
      throw new BadRequestException(
        'This song has no current champion yet. Wait for the first battle to crown one, or pick a different song.',
      );
    }

    if (song.currentChampionUserId === params.userId) {
      throw new ConflictException(
        'You are the current champion of this song — nothing to challenge',
      );
    }

    // Block challenge submission while a battle for this song is still
    // in flight (live, or tied awaiting admin decision). Queueing a
    // challenger now is meaningless — admin can't promote them until
    // the current champion is known, and showing the user a different
    // error after they've already uploaded their video is poor UX.
    // Frontend pre-checks this too via /api/battles?songId&status, but
    // the DB-truth gate lives here.
    const activeBattle = await this.battles.findOne({
      where: [
        { songId: params.songId, status: 'live' },
        { songId: params.songId, status: 'needs_decision' },
      ],
    });
    if (activeBattle) {
      throw new ConflictException(
        'Champion for this battle is not yet decided',
      );
    }

    const video = await this.videos.findOne({
      where: { id: params.videoId },
    });
    if (!video) throw new NotFoundException('Performance not found');
    if (video.uploaderId !== params.userId) {
      throw new ForbiddenException('That performance isn\'t yours');
    }
    if (video.songId !== params.songId) {
      throw new BadRequestException(
        'That performance is not tagged with this Centerstage Song',
      );
    }

    // App-layer pre-check for clearer errors; the DB partial unique index
    // is still the source of truth (Postgres) / app-layer guard (SQLite).
    //
    // Bug #6 — the previous check matched any submission still in
    // status='selected', which left stale rows blocking new
    // challenges after their resulting battle had completed (the row
    // was never flipped to 'completed' before the lifecycle fix). The
    // defensive JOIN below treats a `selected` row as active ONLY
    // when its linked battle is still live OR needs_decision; in any
    // other state (completed, cancelled, or no linked battle yet but
    // still pending) the row is either truly active or already
    // released, and the query handles both naturally.
    const blockingRow = await this.submissions
      .createQueryBuilder('cs')
      .leftJoin('battles', 'b', 'b.id = cs."resultingBattleId"')
      .where('cs."songId" = :songId', { songId: params.songId })
      .andWhere(
        `(
           cs.status = 'pending'
           OR (cs.status = 'selected' AND (
             b.id IS NULL
             OR b.status IN ('live', 'needs_decision')
           ))
         )`,
      )
      .getOne();
    if (blockingRow) {
      // Best-effort sweep: if the existing row is 'selected' but its
      // linked battle has resolved out from under it (race or pre-fix
      // data), release the stale row right here so the next retry
      // succeeds. Falls through to the same 409 for genuinely-active
      // queues.
      if (blockingRow.status === 'selected' && blockingRow.resultingBattleId) {
        const linked = await this.battles.findOne({
          where: { id: blockingRow.resultingBattleId },
        });
        if (
          linked &&
          (linked.status === 'completed' || linked.status === 'cancelled')
        ) {
          blockingRow.status = 'completed';
          await this.submissions.save(blockingRow);
        } else {
          throw new ConflictException(
            'A challenger is already queued for this song',
          );
        }
      } else {
        throw new ConflictException(
          'A challenger is already queued for this song',
        );
      }
    }

    // Mark the video as a challenge entry so it shows up in admin / filters.
    if (video.category !== 'challenge_entry') {
      video.category = 'challenge_entry';
      await this.videos.save(video);
    }

    try {
      const row = this.submissions.create({
        songId: params.songId,
        userId: params.userId,
        videoId: params.videoId,
        status: 'pending',
      });
      return await this.submissions.save(row);
    } catch (err: any) {
      if (
        err?.code === 'SQLITE_CONSTRAINT' ||
        err?.code === '23505' ||
        /UNIQUE/i.test(err?.message ?? '')
      ) {
        throw new ConflictException(
          'A challenger is already queued for this song',
        );
      }
      throw err;
    }
  }

  /** Read a single submission. Throws 404 if missing. */
  async findOne(id: string) {
    const row = await this.submissions.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Challenge submission not found');
    return row;
  }

  /** All submissions for a user — drives the "My pending challenges" UI. */
  async findByUser(userId: string) {
    return this.submissions.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  // ─── Admin: queue, select, reject ────────────────────────────────

  async listForAdmin(opts: {
    songId?: string;
    // 'open' = pending only (actionable); 'all' = no status filter;
    // 'needs_decision' = joined view — the challenge is `selected`
    // and its resulting battle is currently in `needs_decision`
    // (tie awaiting admin resolution). Not a real ChallengeStatus,
    // but the admin Red Phone page treats it as a pseudo-tab so
    // tied challenge-derived battles are reachable from there
    // without walking through the Battles admin index.
    status?: ChallengeStatus | 'open' | 'all' | 'needs_decision';
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(opts.limit ?? 50, 200);
    const offset = opts.offset ?? 0;
    const qb = this.submissions
      .createQueryBuilder('c')
      .orderBy('c.createdAt', 'DESC')
      .take(limit + 1)
      .skip(offset);
    if (opts.songId) qb.andWhere('c.songId = :songId', { songId: opts.songId });
    // Bug #10 — the previous semantics were:
    //   - 'open'  → pending + selected   (this overlapped with the dedicated
    //                                     Pending and Selected tabs, so the
    //                                     Open tab effectively repeated them)
    //   - missing → defaulted to 'open' (handled by controller)
    //   - 'all'   → was unhandled → fell into the explicit-status branch and
    //               filtered `status = 'all'`, returning zero rows (which
    //               is why the "All" tab excluded Rejected).
    // New semantics — each tab is its own slice:
    //   - 'open' → pending only (actionable queue, no overlap with Selected)
    //   - 'all'  → no status filter (truly returns pending + selected + rejected)
    //   - 'needs_decision' → selected challenges whose resulting battle
    //                        is currently awaiting an admin tie-break
    //   - explicit pending/selected/rejected → exact filter
    if (opts.status === 'open') {
      qb.andWhere('c.status = :status', { status: 'pending' });
    } else if (opts.status === 'needs_decision') {
      qb.innerJoin('battles', 'b', 'b.id = c."resultingBattleId"')
        .andWhere('c.status = :cstatus', { cstatus: 'selected' })
        .andWhere('b.status = :bstatus', { bstatus: 'needs_decision' });
    } else if (opts.status && opts.status !== 'all') {
      qb.andWhere('c.status = :status', { status: opts.status });
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

  /**
   * Admin marks a pending submission as `selected`. Writes a notification
   * to the challenger (in-app; no email until Phase 2C). Idempotent —
   * if already selected, no-op.
   */
  async select(id: string, adminId: string) {
    const row = await this.findOne(id);
    if (row.status === 'selected') return row;
    if (row.status !== 'pending') {
      throw new ConflictException(
        `Only pending challenges can be selected (this one is ${row.status})`,
      );
    }
    row.status = 'selected';
    row.decidedAt = new Date();
    row.decidedByAdminId = adminId;
    await this.submissions.save(row);

    const song = await this.songs.findOne(row.songId).catch(() => null);
    const songLabel = song ? song.title : 'a Centerstage Song';
    // Fire-and-forget — a failed notification shouldn't block selection.
    this.notifications
      .create({
        userId: row.userId,
        kind: 'challenger_selected',
        title: 'You\'ve been picked to challenge.',
        body: `You're next up on ${songLabel}. The battle goes live when admin starts it.`,
        href: `/u/me`,
      })
      .catch((err) =>
        this.logger.error(`Failed to notify challenger: ${err}`),
      );

    // Bug #12 — only the challenger was being notified. The defending
    // champion deserves an early heads-up that their crown is about to
    // be contested, so they can rehearse / share / rally voters. Same
    // event, different copy + href to the song's recent activity.
    if (song?.currentChampionUserId) {
      this.notifications
        .create({
          userId: song.currentChampionUserId,
          kind: 'challenger_selected',
          title: 'A challenger is coming for your crown.',
          body: `Admin just picked a challenger for ${songLabel}. The battle goes live as soon as it's promoted.`,
          href: `/u/me`,
        })
        .catch((err) =>
          this.logger.error(`Failed to notify champion of selection: ${err}`),
        );
    }

    return row;
  }

  /** Admin marks a pending submission as `rejected`. Idempotent. */
  async reject(id: string, adminId: string) {
    const row = await this.findOne(id);
    if (row.status === 'rejected') return row;
    if (row.status !== 'pending') {
      throw new ConflictException(
        `Only pending challenges can be rejected (this one is ${row.status})`,
      );
    }
    row.status = 'rejected';
    row.decidedAt = new Date();
    row.decidedByAdminId = adminId;
    const saved = await this.submissions.save(row);

    // Tell the challenger their submission didn't make it through. Soft copy
    // so it doesn't feel like a slammed door — they're encouraged to try again.
    const song = await this.songs.findOne(row.songId).catch(() => null);
    const songLabel = song ? song.title : 'a Centerstage Song';
    this.notifications
      .create({
        userId: row.userId,
        kind: 'challenger_rejected',
        title: 'Your challenge wasn\'t picked this time.',
        body: `Admin went a different direction on ${songLabel}. Keep an eye on the queue — there'll be another shot.`,
        href: song ? `/u/me` : undefined,
      })
      .catch((err) =>
        this.logger.error(`Failed to notify rejected challenger: ${err}`),
      );

    return saved;
  }

  // ─── Admin: promote a selected challenge into a real battle ──────

  /**
   * Create the next battle for a song using a `selected` challenge.
   * Side A = the song's current champion's performance. Side B = the
   * challenger's video. Voting window defaults to 48h (matching Phase 2A
   * recommended default); admin can override via the regular create
   * endpoint if needed.
   */
  async createBattleFromChallenge(
    submissionId: string,
    adminId: string,
    opts: { hours?: number; votingClosesAt?: string; title?: string } = {},
  ) {
    const sub = await this.findOne(submissionId);
    if (sub.status !== 'selected') {
      throw new ConflictException(
        'Only selected challenges can be promoted into a battle',
      );
    }
    if (sub.resultingBattleId) {
      throw new ConflictException(
        'A battle has already been created from this challenge',
      );
    }

    const song = await this.songs.findOne(sub.songId);
    if (!song.currentChampionPerformanceId) {
      throw new BadRequestException(
        'This song has no current champion — create the first battle manually instead',
      );
    }

    const orphan = await this.checkOrphanState(sub, song);
    if (orphan.orphaned) {
      throw new BadRequestException(orphan.reason);
    }

    // Same-tick clock guarantee: prefer forwarding `hours` to the
    // battles service so it can derive both `opensAt` and `closesAt`
    // from a single `Date.now()` reading. That closes the drift bug
    // where computing `votingClosesAt` here (from a pre-await
    // `Date.now()`) and then letting the battles service re-sample
    // `opensAt` after its own awaits gave voters ~1-3s less than the
    // configured window. The explicit `votingClosesAt` path is kept
    // for callers that pass an absolute schedule.
    const useHours = !opts.votingClosesAt;
    const forwardedHours = useHours
      ? Math.min(Math.max(opts.hours ?? 24 * 30, 1), 24 * 30)
      : undefined;
    const forwardedClosesAt = opts.votingClosesAt
      ? new Date(opts.votingClosesAt).toISOString()
      : undefined;

    // Bug #16 — when admin promoted a challenge without supplying a title,
    // the battle showed as "Untitled Battle" in the admin list. Auto-generate
    // a sensible default from the song + challenger so the row reads cleanly
    // in every list view; admins can still override via `opts.title`.
    let autoTitle: string | null = opts.title?.trim() || null;
    if (!autoTitle) {
      const challenger = await this.users
        .findOne({ where: { id: sub.userId } })
        .catch(() => null);
      const challengerHandle = challenger?.username
        ? `@${challenger.username}`
        : 'Challenger';
      autoTitle = `${song.title} — ${challengerHandle} vs the Crown`;
    }

    // Delegate to the existing battle creation, which enforces the
    // same-song / different-uploader / one-live-per-song invariants.
    const battle = await this.battlesService.create(
      {
        songId: sub.songId,
        performanceAId: song.currentChampionPerformanceId,
        performanceBId: sub.videoId,
        ...(forwardedHours != null ? { hours: forwardedHours } : {}),
        ...(forwardedClosesAt ? { votingClosesAt: forwardedClosesAt } : {}),
        title: autoTitle,
      },
      adminId,
    );

    sub.resultingBattleId = battle.id;
    await this.submissions.save(sub);

    // Bug #59 — `battle_starting` notifications used to fire from
    // here *as well as* from `battlesService.create()` (which sends
    // them to both performers with champion/challenger-aware copy —
    // see Bug #22 there). On the Red Phone path that meant the
    // challenger and the champion each received the notification
    // twice. The base create() already covers both sides; this
    // duplicate block has been removed. If the Red Phone flow ever
    // needs distinct copy from a plain admin-created battle, do it
    // by passing a flag into `battlesService.create()` rather than
    // re-sending the same notification.
    return battle;
  }

  // ─── Orphan detection ────────────────────────────────────────────

  /**
   * A submission is "orphaned" when it could never be promoted into a
   * battle: either the song has no current champion, the champion's
   * performance was soft-deleted, or the challenger's own performance
   * was soft-deleted. Shared by the promote-time gate (which throws)
   * and the admin-UI enrichment (which surfaces a Remove button on
   * orphaned `selected` rows).
   *
   * Returns a discriminant `code` alongside the human `reason` so the
   * admin UI can render an accurate badge — previously the frontend
   * only saw a boolean and defaulted to "Champion unavailable" even
   * when the challenger's video was the one that had been deleted.
   * Both sides are always checked so we can distinguish the
   * `both_deleted` case from a single-side deletion.
   *
   * `song` may be supplied to save a lookup when the caller already has it.
   */
  private async checkOrphanState(
    sub: ChallengeSubmission,
    song?: { currentChampionPerformanceId: string | null } | null,
  ): Promise<
    | { orphaned: false }
    | {
        orphaned: true;
        code:
          | 'no_champion'
          | 'champion_deleted'
          | 'challenger_deleted'
          | 'both_deleted';
        reason: string;
      }
  > {
    const resolvedSong =
      song ?? (await this.songs.findOne(sub.songId).catch(() => null));
    if (!resolvedSong || !resolvedSong.currentChampionPerformanceId) {
      return {
        orphaned: true,
        code: 'no_champion',
        reason:
          "This song has no current champion — a new champion must be established before this challenge can be promoted.",
      };
    }
    const [championPerf, challengerVideo] = await Promise.all([
      this.videos.findOne({
        where: { id: resolvedSong.currentChampionPerformanceId },
      }),
      this.videos.findOne({ where: { id: sub.videoId } }),
    ]);
    const championGone = !championPerf || !!championPerf.deletedAt;
    const challengerGone = !challengerVideo || !!challengerVideo.deletedAt;
    if (championGone && challengerGone) {
      return {
        orphaned: true,
        code: 'both_deleted',
        reason:
          "Both the Champion's and Challenger's performances have been deleted. Reject this challenge and re-establish the pairing before promoting.",
      };
    }
    if (championGone) {
      return {
        orphaned: true,
        code: 'champion_deleted',
        reason:
          "The Champion's performance has been deleted and is no longer available. A new champion must be established before this challenge can be promoted.",
      };
    }
    if (challengerGone) {
      return {
        orphaned: true,
        code: 'challenger_deleted',
        reason:
          "The Challenger's performance has been deleted and is no longer available. Reject this challenge and ask the challenger to re-upload.",
      };
    }
    return { orphaned: false };
  }

  /**
   * Admin removes a `selected` submission that can no longer be promoted
   * because the Champion or Challenger performance has been soft-deleted.
   * Distinct from `reject`: rejection is a quality judgment on a
   * `pending` row; cancellation is a plumbing consequence on a row that
   * was already accepted and can't move forward.
   *
   * Server-side validates orphan state — never trust the client's
   * assertion that a row is orphaned. If the row is still promotable,
   * cancellation is refused.
   */
  async cancelOrphaned(id: string, adminId: string) {
    const row = await this.findOne(id);
    if (row.status === 'cancelled') return row;
    if (row.status !== 'selected') {
      throw new ConflictException(
        `Only selected challenges can be cancelled (this one is ${row.status})`,
      );
    }
    if (row.resultingBattleId) {
      throw new ConflictException(
        'A battle has already been created from this challenge — cancellation is not available',
      );
    }
    const orphan = await this.checkOrphanState(row);
    if (!orphan.orphaned) {
      throw new ConflictException(
        'This challenge is still promotable — cancellation is only available when a performance has been removed',
      );
    }
    row.status = 'cancelled';
    row.decidedAt = new Date();
    row.decidedByAdminId = adminId;
    const saved = await this.submissions.save(row);

    const song = await this.songs.findOne(row.songId).catch(() => null);
    const songLabel = song ? song.title : 'a Centerstage Song';
    this.notifications
      .create({
        userId: row.userId,
        kind: 'challenger_rejected',
        title: "Your challenge was withdrawn.",
        body: `A performance in this pairing on ${songLabel} is no longer available, so your selected challenge was withdrawn. Watch the queue for a new opening.`,
        href: '/u/me',
      })
      .catch((err) =>
        this.logger.error(`Failed to notify cancelled challenger: ${err}`),
      );

    return saved;
  }

  // ─── Public serialization ────────────────────────────────────────

  /**
   * Enrich a row with the song / video / uploader info the admin UI needs.
   * Used by the list endpoint to avoid an N+1 round-trip from the frontend.
   *
   * `isOrphaned` is populated only for `selected` rows — that's the only
   * status where the frontend Remove button is offered, so the extra
   * champion-video lookup would be wasted elsewhere.
   */
  async toAdminPublic(row: ChallengeSubmission) {
    const [video, user] = await Promise.all([
      this.videos.findOne({ where: { id: row.videoId } }),
      this.users.findOne({ where: { id: row.userId } }),
    ]);
    const song = await this.songs.findOne(row.songId).catch(() => null);
    let isOrphaned = false;
    let orphanReason:
      | 'no_champion'
      | 'champion_deleted'
      | 'challenger_deleted'
      | 'both_deleted'
      | null = null;
    if (row.status === 'selected' && !row.resultingBattleId) {
      const orphan = await this.checkOrphanState(row, song);
      isOrphaned = orphan.orphaned;
      if (orphan.orphaned) orphanReason = orphan.code;
    }
    return {
      id: row.id,
      songId: row.songId,
      song: song
        ? { id: song.id, title: song.title, artist: song.artist }
        : null,
      userId: row.userId,
      user: user
        ? {
            id: user.id,
            username: user.username,
            avatarUrl: user.avatarUrl,
            currentStreak: user.currentStreak,
          }
        : null,
      videoId: row.videoId,
      video: video
        ? {
            id: video.id,
            title: video.title,
            thumbnailUrl: video.thumbnailUrl,
            url: video.url,
          }
        : null,
      status: row.status,
      isOrphaned,
      orphanReason,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
      decidedByAdminId: row.decidedByAdminId,
      resultingBattleId: row.resultingBattleId,
    };
  }

  /** Lighter shape for the user's own pending-challenges list. */
  toUserPublic(row: ChallengeSubmission) {
    return {
      id: row.id,
      songId: row.songId,
      videoId: row.videoId,
      status: row.status,
      createdAt: row.createdAt,
      decidedAt: row.decidedAt,
      resultingBattleId: row.resultingBattleId,
    };
  }
}
