import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsOptional, IsUUID } from 'class-validator';
import { IsNull, Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { Video } from '../videos/video.entity';
import { User } from '../users/user.entity';
import { Song } from '../songs/song.entity';
import { Vote } from '../battles/vote.entity';

class AssignSongDto {
  @IsOptional() @IsUUID()
  songId?: string | null;
}

/**
 * Admin performances management. Lives alongside the public videos endpoints
 * but is gated by AdminGuard and exposes the fields admins need to triage
 * uploads (songId backfill, soft-delete, search).
 */
@Controller('admin/performances')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminPerformancesController {
  constructor(
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Song) private readonly songs: Repository<Song>,
    @InjectRepository(Vote) private readonly votes: Repository<Vote>,
  ) {}

  @Get()
  async list(
    @Query('search') search?: string,
    @Query('songId') songIdFilter?: string,
    @Query('missingSong') missingSong?: string,
    @Query('includeDeleted') includeDeleted?: string,
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ) {
    const limit = Math.min(parseInt(limitRaw ?? '50', 10) || 50, 200);
    const offset = parseInt(offsetRaw ?? '0', 10) || 0;

    const qb = this.videos
      .createQueryBuilder('v')
      .leftJoinAndSelect('v.uploader', 'u')
      .orderBy('v.createdAt', 'DESC')
      .take(limit + 1)
      .skip(offset);

    if (includeDeleted !== 'true' && includeDeleted !== '1') {
      qb.andWhere('v.deletedAt IS NULL');
    }
    if (missingSong === 'true' || missingSong === '1') {
      qb.andWhere('v.songId IS NULL');
    }
    if (songIdFilter) {
      qb.andWhere('v.songId = :songId', { songId: songIdFilter });
    }
    if (search) {
      const term = `%${search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(v.title) LIKE :term OR LOWER(v.songTitle) LIKE :term OR LOWER(u.username) LIKE :term)',
        { term },
      );
    }

    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;

    // Resolve song titles in a single query so the list table can show "linked
    // to: <title>" without an N+1.
    const songIds = Array.from(
      new Set(items.map((v) => v.songId).filter((x): x is string => !!x)),
    );
    const songMap = new Map<string, Song>();
    if (songIds.length > 0) {
      const songs = await this.songs.find({
        where: songIds.map((id) => ({ id })),
      });
      for (const s of songs) songMap.set(s.id, s);
    }

    // Aggregate vote counts across all battles for the performances on this
    // page in a single grouped query. Returns 0 for performances with no votes.
    const voteCountMap = new Map<string, number>();
    if (items.length > 0) {
      const perfIds = items.map((v) => v.id);
      const rows = await this.votes
        .createQueryBuilder('vote')
        .select('vote.performanceId', 'performanceId')
        .addSelect('COUNT(*)', 'count')
        .where('vote.performanceId IN (:...ids)', { ids: perfIds })
        .groupBy('vote.performanceId')
        .getRawMany<{ performanceId: string; count: string }>();
      for (const r of rows) {
        voteCountMap.set(r.performanceId, parseInt(r.count, 10) || 0);
      }
    }

    return {
      items: items.map((v) => ({
        id: v.id,
        title: v.title,
        songTitle: v.songTitle,
        songId: v.songId,
        song: v.songId
          ? songMap.get(v.songId)
            ? {
                id: songMap.get(v.songId)!.id,
                title: songMap.get(v.songId)!.title,
                artist: songMap.get(v.songId)!.artist,
              }
            : null
          : null,
        thumbnailUrl: v.thumbnailUrl,
        category: v.category,
        visibility: v.visibility,
        viewCount: v.viewCount,
        voteCount: voteCountMap.get(v.id) ?? 0,
        deletedAt: v.deletedAt,
        createdAt: v.createdAt,
        uploader: v.uploader
          ? {
              id: v.uploader.id,
              username: v.uploader.username,
              avatarUrl: v.uploader.avatarUrl,
            }
          : null,
      })),
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    };
  }

  @Patch(':id')
  async assignSong(@Param('id') id: string, @Body() dto: AssignSongDto) {
    const video = await this.videos.findOne({ where: { id } });
    if (!video) throw new NotFoundException('Performance not found');

    // Allow explicit null to clear a stale link, or a uuid to assign.
    if (dto.songId === null) {
      video.songId = null;
      video.songTitle = null;
    } else if (dto.songId) {
      const song = await this.songs.findOne({ where: { id: dto.songId } });
      if (!song) throw new NotFoundException('Song not found');
      video.songId = song.id;
      video.songTitle = song.title;
    }
    await this.videos.save(video);
    return { id: video.id, songId: video.songId, songTitle: video.songTitle };
  }

  /**
   * Soft-delete: sets deletedAt so the video disappears from public feeds /
   * profile but battle history stays intact. Admins can do this regardless of
   * whether the video has been in a battle (the per-user delete endpoint
   * already has that constraint baked in for the uploader's own use).
   */
  @Delete(':id')
  async softDelete(@Param('id') id: string) {
    const video = await this.videos.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!video) throw new NotFoundException('Performance not found');
    video.deletedAt = new Date();
    await this.videos.save(video);
    return { id: video.id, deletedAt: video.deletedAt };
  }
}
