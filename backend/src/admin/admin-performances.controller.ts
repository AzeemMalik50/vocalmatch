import {
  Body,
  ConflictException,
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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { In, IsNull, Repository } from 'typeorm';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { Video } from '../videos/video.entity';
import { User } from '../users/user.entity';
import { Song } from '../songs/song.entity';
import { Vote } from '../battles/vote.entity';
import { Battle } from '../battles/battle.entity';

class AssignSongDto {
  @IsOptional() @IsUUID()
  songId?: string | null;
}

/**
 * Admin performances management. Lives alongside the public videos endpoints
 * but is gated by AdminGuard and exposes the fields admins need to triage
 * uploads (songId backfill, soft-delete, search).
 */
@ApiTags('Admin – Performances')
@ApiBearerAuth('bearer')
@Controller('admin/performances')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminPerformancesController {
  constructor(
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Song) private readonly songs: Repository<Song>,
    @InjectRepository(Vote) private readonly votes: Repository<Vote>,
    @InjectRepository(Battle) private readonly battles: Repository<Battle>,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Admin — list performances (triage view)',
    description:
      'Admin only. Joins uploader, song, and aggregate vote counts in a single response so the admin table renders without N+1. Supports search across title / songTitle / username, songId filter, missing-song filter, and an opt-in flag to include soft-deleted rows.',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'songId', required: false, type: String })
  @ApiQuery({ name: 'missingSong', required: false, type: String, description: 'Set to `true` to only show performances with no song linked.' })
  @ApiQuery({ name: 'includeDeleted', required: false, type: String, description: 'Set to `true` to include soft-deleted performances.' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max 200. Default 50.' })
  @ApiQuery({ name: 'offset', required: false, type: Number })
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

    // Bug #45 — previously `includeDeleted=true` returned BOTH active and
    // soft-deleted rows, which made the "Show Deleted" checkbox act like
    // a "include deleted on top of active" toggle. The clearer semantic
    // matching the checkbox label is "Show Deleted = show only the
    // deleted ones"; the default still hides them.
    if (includeDeleted === 'true' || includeDeleted === '1') {
      qb.andWhere('v.deletedAt IS NOT NULL');
    } else {
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
  @ApiOperation({
    summary: 'Admin — assign or clear the song link on a performance',
    description: 'Admin only. Pass `songId=null` to clear a stale link, or a UUID to assign. The performance’s `songTitle` is synced to match.',
  })
  async assignSong(@Param('id') id: string, @Body() dto: AssignSongDto) {
    const video = await this.videos.findOne({ where: { id } });
    if (!video) throw new NotFoundException('Performance not found');

    // Bug #29 — block editing the Centerstage Song link of a performance
    // that is currently participating in a live or tie-pending battle.
    // Allowing it broke the battle's same-song invariant and let admin
    // accidentally invalidate an ongoing competition.
    const activeBattle = await this.battles.findOne({
      where: [
        { performanceAId: id, status: In(['live', 'needs_decision']) },
        { performanceBId: id, status: In(['live', 'needs_decision']) },
      ],
    });
    if (activeBattle) {
      throw new ConflictException(
        `This performance is in an active battle (${activeBattle.id}). Resolve or cancel that battle before changing the song link.`,
      );
    }

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

  @Delete(':id')
  @ApiOperation({
    summary: 'Admin — soft-delete a performance',
    description:
      'Admin only. Sets `deletedAt` so the video disappears from public feeds / profiles, but battle history stays intact. Bypasses the "has-been-in-a-battle" check the uploader-facing delete enforces.',
  })
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
