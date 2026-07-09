import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Video, VideoCategory, VideoVisibility } from './video.entity';
import { VideoView } from './video-view.entity';
import { CloudinaryService } from './cloudinary.service';
import { Battle } from '../battles/battle.entity';
import { Song } from '../songs/song.entity';

export type VideoSort = 'newest' | 'most_viewed' | 'trending';

export interface VideoListQuery {
  category?: VideoCategory;
  uploaderId?: string;
  voiceType?: string;
  genre?: string;
  search?: string;
  hasThumbnail?: boolean;
  sort?: VideoSort;
  visibility?: VideoVisibility | 'all';
  /**
   * If supplied, public + unlisted from this user are returned (own profile).
   * Anyone else only sees public.
   */
  viewerId?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    @InjectRepository(VideoView) private readonly videoViews: Repository<VideoView>,
    @InjectRepository(Battle) private readonly battles: Repository<Battle>,
    @InjectRepository(Song) private readonly songs: Repository<Song>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async create(params: {
    title: string;
    description?: string;
    songId?: string;
    uploaderId: string;
    fileBuffer: Buffer;
    category?: VideoCategory;
    visibility?: VideoVisibility;
    tags?: string[];
    uploadAckTermsVersionId?: string | null;
    uploadAckAt?: Date | null;
  }) {
    // Race-condition guard — the Upload Performance form fetches the
    // Centerstage catalog on mount and doesn't re-poll, so a user who
    // leaves the page open while an admin retires the same song in
    // another session would otherwise submit a performance tied to a
    // retired song (invisible catalog entry, unmatched forever). Verify
    // the song is still `active` BEFORE we push the file to Cloudinary
    // so a doomed upload never wastes bandwidth or an asset slot.
    //
    // `songTitle` is derived here too — it's a denormalized copy used by
    // the video search index (see `findAll`). Deriving from the song row
    // keeps it authoritative and eliminates the drift where a client
    // used to POST a `songTitle` that mismatched the linked song, or
    // failed length validation because a legacy song's real title
    // exceeded the DTO cap the user couldn't see or fix.
    let derivedSongTitle: string | null = null;
    if (params.songId) {
      const song = await this.songs.findOne({
        where: { id: params.songId },
      });
      if (!song) {
        throw new NotFoundException(
          'The selected Centerstage Song no longer exists. Please pick another song.',
        );
      }
      if (song.status !== 'active') {
        throw new ConflictException(
          `"${song.title}" was retired while you were on this page. Please pick another Centerstage Song.`,
        );
      }
      derivedSongTitle = song.title;
    }

    const upload = await this.cloudinary.uploadVideo(params.fileBuffer);

    const video = this.videos.create({
      title: params.title,
      description: params.description ?? null,
      songTitle: derivedSongTitle,
      songId: params.songId ?? null,
      url: upload.secure_url,
      thumbnailUrl: upload.eager?.[0]?.secure_url ?? null,
      durationSeconds: upload.duration ? Math.round(upload.duration) : null,
      cloudinaryPublicId: upload.public_id,
      uploaderId: params.uploaderId,
      category: params.category ?? 'solo',
      visibility: params.visibility ?? 'public',
      tags: (params.tags ?? []).slice(0, 10),
      uploadAckTermsVersionId: params.uploadAckTermsVersionId ?? null,
      uploadAckAt: params.uploadAckAt ?? null,
    });
    return this.videos.save(video);
  }

  async findAll(query: VideoListQuery = {}) {
    const limit = Math.min(query.limit ?? 24, 100);
    const offset = query.offset ?? 0;

    const qb = this.videos
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.uploader', 'uploader')
      .andWhere('v.deletedAt IS NULL') // soft-delete filter (decision D)
      .take(limit + 1) // grab one extra to detect "has more"
      .skip(offset);

    // Visibility rules:
    //   - own profile feed (uploaderId === viewerId): public + unlisted + private
    //   - everywhere else: public only (unlisted needs the direct URL,
    //     private is owner-only)
    // Bug #7 — the owner branch was missing 'private', so videos marked
    // "Only You" disappeared even from the uploader's own profile.
    if (
      query.uploaderId &&
      query.viewerId &&
      query.uploaderId === query.viewerId
    ) {
      qb.andWhere("v.visibility IN ('public', 'unlisted', 'private')");
    } else {
      qb.andWhere("v.visibility = 'public'");
    }

    if (query.category) {
      qb.andWhere('v.category = :category', { category: query.category });
    }
    if (query.uploaderId) {
      qb.andWhere('v.uploaderId = :uploaderId', {
        uploaderId: query.uploaderId,
      });
    }
    if (query.voiceType) {
      qb.andWhere('uploader.voiceType = :voiceType', {
        voiceType: query.voiceType,
      });
    }
    if (query.genre) {
      // simple-array stores comma-separated; LIKE is good enough at our scale
      qb.andWhere('uploader.genres LIKE :genrePattern', {
        genrePattern: `%${query.genre}%`,
      });
    }
    if (query.hasThumbnail) {
      qb.andWhere('v.thumbnailUrl IS NOT NULL');
    }
    if (query.search) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(v.title) LIKE :term OR LOWER(v.songTitle) LIKE :term OR LOWER(uploader.username) LIKE :term OR LOWER(uploader.displayName) LIKE :term)',
        { term },
      );
    }

    switch (query.sort ?? 'newest') {
      case 'most_viewed':
        qb.orderBy('v.viewCount', 'DESC').addOrderBy('v.createdAt', 'DESC');
        break;
      case 'trending':
        // Bug #23 — the previous implementation called `addSelect` with a
        // duplicate column alias which, combined with the leftJoinAndSelect
        // for uploader + the `.skip()` pagination, broke TypeORM's
        // entity-hydration step and crashed the request. We don't actually
        // need the alias: the ORDER BY references the real column directly.
        // Practical "trending" ranking until we wire a tracked stat: most
        // views, newer first as tiebreaker.
        qb.orderBy('v.viewCount', 'DESC').addOrderBy('v.createdAt', 'DESC');
        break;
      case 'newest':
      default:
        qb.orderBy('v.createdAt', 'DESC');
        break;
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return { items, hasMore, nextOffset: hasMore ? offset + limit : null };
  }

  /**
   * Public lookup — soft-deleted videos appear as "not found".
   * Battle pages use `findOneIncludingDeleted()` instead.
   */
  async findOne(id: string) {
    const v = await this.videos.findOne({ where: { id, deletedAt: IsNull() } });
    if (!v) throw new NotFoundException('Video not found');
    return v;
  }

  /**
   * Battle-page lookup — returns the row even if soft-deleted, so historical
   * battles still resolve their performance media. Public-facing surfaces
   * (feed, profile, search) must keep using `findOne()` instead.
   */
  async findOneIncludingDeleted(id: string) {
    const v = await this.videos.findOne({ where: { id } });
    if (!v) throw new NotFoundException('Video not found');
    return v;
  }

  /**
   * List by uploader — used by profile pages. Skips soft-deleted.
   */
  async findByUploader(uploaderId: string) {
    return this.videos.find({
      where: { uploaderId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Used by the admin "create battle" flow to list candidate performances
   * for a given Centerstage Song.
   */
  async findEligibleForBattle(songId: string) {
    return this.videos
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.uploader', 'uploader')
      .where('v.songId = :songId', { songId })
      .andWhere('v.deletedAt IS NULL')
      .orderBy('v.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Authorization for fetching a single video:
   *  - public: anyone
   *  - unlisted: anyone with the link (id is the link)
   *  - private: uploader only
   */
  async findOneAuthorized(id: string, viewerId?: string) {
    const v = await this.findOne(id);
    if (v.visibility === 'private' && v.uploaderId !== viewerId) {
      throw new NotFoundException('Video not found');
    }
    return v;
  }

  /**
   * Record a unique view from an authenticated user. Counts each
   * (videoId, userId) pair at most once — the UNIQUE constraint on
   * VideoView is the source of truth. Returns true on a brand-new
   * view (counter incremented), false on a duplicate (counter untouched).
   *
   * Callers must pre-filter out self-views (uploader viewing their own
   * video) and anonymous views — this method records anything it's given.
   */
  async recordView(videoId: string, userId: string): Promise<boolean> {
    try {
      await this.videoViews.insert({ videoId, userId });
    } catch (err: any) {
      // SQLite: SQLITE_CONSTRAINT (code 19); Postgres: 23505 unique_violation
      if (
        err?.code === 'SQLITE_CONSTRAINT' ||
        err?.code === '23505' ||
        /UNIQUE/i.test(err?.message ?? '')
      ) {
        return false;
      }
      throw err;
    }
    await this.videos.increment({ id: videoId }, 'viewCount', 1);
    return true;
  }

  /**
   * Delete a performance. Vincent's decision D:
   *   - If the video has been used in any battle (as A or B in any status),
   *     it can NOT be hard-deleted. We soft-delete instead — sets deletedAt,
   *     keeps the row + Cloudinary asset so historical battles still resolve.
   *   - Otherwise hard-delete: remove the row and the Cloudinary asset.
   *
   * Returns { mode: 'soft' | 'hard' } so the UI can word the confirmation.
   */
  async delete(id: string, requestingUserId: string) {
    const video = await this.findOne(id);
    if (video.uploaderId !== requestingUserId) {
      throw new ForbiddenException('You can only delete your own videos');
    }

    const usedInBattle = await this.battles
      .createQueryBuilder('b')
      .where('b.performanceAId = :id OR b.performanceBId = :id', { id })
      .getCount();

    if (usedInBattle > 0) {
      // Soft-delete: hide from feed/profile but keep battle history intact
      video.deletedAt = new Date();
      await this.videos.save(video);
      return { ok: true, mode: 'soft' as const };
    }

    // Safe to hard-delete
    await this.cloudinary.deleteVideo(video.cloudinaryPublicId);
    await this.videos.remove(video);
    return { ok: true, mode: 'hard' as const };
  }

  // Used by frontend to render uploader info nicely
  toPublic(video: Video) {
    return {
      id: video.id,
      title: video.title,
      description: video.description,
      songTitle: video.songTitle,
      songId: video.songId,
      url: video.url,
      thumbnailUrl: video.thumbnailUrl,
      durationSeconds: video.durationSeconds,
      category: video.category,
      visibility: video.visibility ?? 'public',
      tags: video.tags ?? [],
      viewCount: video.viewCount,
      createdAt: video.createdAt,
      // deletedAt is intentionally NOT exposed — it's an internal soft-delete flag.
      uploader: video.uploader
        ? {
            id: video.uploader.id,
            username: video.uploader.username,
            avatarUrl: video.uploader.avatarUrl,
            championTitle: video.uploader.championTitle,
            winCount: video.uploader.winCount,
            // Phase 2B: needed to render the "🔥 X wins in a row" chip on the
            // battle/profile/performance card without an extra fetch.
            currentStreak: video.uploader.currentStreak,
          }
        : null,
    };
  }
}
