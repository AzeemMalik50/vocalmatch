import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Song, SongStatus } from './song.entity';
import { CreateSongDto, UpdateSongDto } from './songs.dto';

@Injectable()
export class SongsService {
  constructor(
    @InjectRepository(Song) private readonly songs: Repository<Song>,
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
      createdAt: song.createdAt,
    };
  }
}
