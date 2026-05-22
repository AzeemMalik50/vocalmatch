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
    if (song.currentChampionUserId === params.userId) {
      throw new ConflictException(
        'You are the current champion of this song — nothing to challenge',
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
    const existing = await this.submissions.findOne({
      where: {
        songId: params.songId,
        status: In(['pending', 'selected'] as ChallengeStatus[]),
      },
    });
    if (existing) {
      throw new ConflictException(
        'A challenger is already queued for this song',
      );
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
    status?: ChallengeStatus | 'open'; // 'open' = pending|selected
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
    if (opts.status === 'open') {
      qb.andWhere('c.status IN (:...statuses)', {
        statuses: ['pending', 'selected'],
      });
    } else if (opts.status) {
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
    opts: { hours?: number; title?: string } = {},
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

    const hours = Math.min(Math.max(opts.hours ?? 48, 1), 24 * 14);
    const votingClosesAt = new Date(
      Date.now() + hours * 60 * 60 * 1000,
    ).toISOString();

    // Delegate to the existing battle creation, which enforces the
    // same-song / different-uploader / one-live-per-song invariants.
    const battle = await this.battlesService.create(
      {
        songId: sub.songId,
        performanceAId: song.currentChampionPerformanceId,
        performanceBId: sub.videoId,
        votingClosesAt,
        title: opts.title?.trim() || null,
      },
      adminId,
    );

    sub.resultingBattleId = battle.id;
    await this.submissions.save(sub);

    // Notify both performers that their head-to-head is live. The deep-link
    // takes them straight to the battle page so they can share + watch votes
    // come in. Champion and challenger get the same kind so the bell read-
    // status logic stays trivial.
    const songLabel = song.title;
    const battleHref = `/battle/${battle.id}`;
    this.notifications
      .create({
        userId: sub.userId,
        kind: 'battle_starting',
        title: 'Your battle just went live.',
        body: `You're going head-to-head on ${songLabel}. Share the link and rally your voters.`,
        href: battleHref,
      })
      .catch((err) =>
        this.logger.error(`Failed to notify challenger of live battle: ${err}`),
      );
    if (song.currentChampionUserId) {
      this.notifications
        .create({
          userId: song.currentChampionUserId,
          kind: 'battle_starting',
          title: 'A challenger just stepped up.',
          body: `Your crown on ${songLabel} is up for grabs. Voting is open now.`,
          href: battleHref,
        })
        .catch((err) =>
          this.logger.error(`Failed to notify champion of new battle: ${err}`),
        );
    }

    return battle;
  }

  // ─── Public serialization ────────────────────────────────────────

  /**
   * Enrich a row with the song / video / uploader info the admin UI needs.
   * Used by the list endpoint to avoid an N+1 round-trip from the frontend.
   */
  async toAdminPublic(row: ChallengeSubmission) {
    const [video, user] = await Promise.all([
      this.videos.findOne({ where: { id: row.videoId } }),
      this.users.findOne({ where: { id: row.userId } }),
    ]);
    const song = await this.songs.findOne(row.songId).catch(() => null);
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
