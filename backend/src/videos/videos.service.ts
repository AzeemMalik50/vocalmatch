import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Video, VideoCategory, VideoVisibility } from './video.entity';
import { CloudinaryService } from './cloudinary.service';

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
    private readonly cloudinary: CloudinaryService,
  ) {}

  async create(params: {
    title: string;
    description?: string;
    songTitle?: string;
    uploaderId: string;
    fileBuffer: Buffer;
    category?: VideoCategory;
    visibility?: VideoVisibility;
    tags?: string[];
  }) {
    const upload = await this.cloudinary.uploadVideo(params.fileBuffer);

    const video = this.videos.create({
      title: params.title,
      description: params.description ?? null,
      songTitle: params.songTitle ?? null,
      url: upload.secure_url,
      thumbnailUrl: upload.eager?.[0]?.secure_url ?? null,
      durationSeconds: upload.duration ? Math.round(upload.duration) : null,
      cloudinaryPublicId: upload.public_id,
      uploaderId: params.uploaderId,
      category: params.category ?? 'solo',
      visibility: params.visibility ?? 'public',
      tags: (params.tags ?? []).slice(0, 10),
    });
    return this.videos.save(video);
  }

  async findAll(query: VideoListQuery = {}) {
    const limit = Math.min(query.limit ?? 24, 100);
    const offset = query.offset ?? 0;

    const qb = this.videos
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.uploader', 'uploader')
      .take(limit + 1) // grab one extra to detect "has more"
      .skip(offset);

    // Visibility rules:
    //   - own profile feed (uploaderId === viewerId): public + unlisted
    //   - everywhere else: public only (private/unlisted are excluded)
    if (
      query.uploaderId &&
      query.viewerId &&
      query.uploaderId === query.viewerId
    ) {
      qb.andWhere("v.visibility IN ('public', 'unlisted')");
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
        // views per hour since upload, integer math (works on sqlite + postgres)
        // Cast to float, hoist into an alias for ordering
        qb.addSelect(
          // (viewCount + 1) / (hours_since_creation + 2)
          // Use julianday on sqlite, EXTRACT(EPOCH ...) on postgres — simple-array
          // doesn't help here. We'll use SQL-portable createdAt epoch math via
          // strftime('%s', ...) on sqlite and EXTRACT on postgres. To keep the
          // query portable, we approximate using "viewCount * 1.0 / (julianday('now') - julianday(v.createdAt) + 0.05)"
          // when on sqlite, otherwise EXTRACT. Simpler: rank by viewCount, then
          // newer first as tiebreaker — practical until we add a tracked stat.
          'v.viewCount',
          'trending_score',
        )
          .orderBy('v.viewCount', 'DESC')
          .addOrderBy('v.createdAt', 'DESC');
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

  async findOne(id: string) {
    const v = await this.videos.findOne({ where: { id } });
    if (!v) throw new NotFoundException('Video not found');
    return v;
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

  async incrementView(id: string) {
    await this.videos.increment({ id }, 'viewCount', 1);
  }

  async delete(id: string, requestingUserId: string) {
    const video = await this.findOne(id);
    if (video.uploaderId !== requestingUserId) {
      throw new ForbiddenException('You can only delete your own videos');
    }
    await this.cloudinary.deleteVideo(video.cloudinaryPublicId);
    await this.videos.remove(video);
    return { ok: true };
  }

  // Used by frontend to render uploader info nicely
  toPublic(video: Video) {
    return {
      id: video.id,
      title: video.title,
      description: video.description,
      songTitle: video.songTitle,
      url: video.url,
      thumbnailUrl: video.thumbnailUrl,
      durationSeconds: video.durationSeconds,
      category: video.category,
      visibility: video.visibility ?? 'public',
      tags: video.tags ?? [],
      viewCount: video.viewCount,
      createdAt: video.createdAt,
      uploader: video.uploader
        ? {
            id: video.uploader.id,
            username: video.uploader.username,
            avatarUrl: video.uploader.avatarUrl,
            championTitle: video.uploader.championTitle,
            winCount: video.uploader.winCount,
          }
        : null,
    };
  }
}
