import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SongSubmission,
  SongSubmissionStatus,
} from './song-submission.entity';
import {
  CreateSongSubmissionDto,
  ReviewSongSubmissionDto,
} from './song-submissions.dto';

@Injectable()
export class SongSubmissionsService {
  constructor(
    @InjectRepository(SongSubmission)
    private readonly repo: Repository<SongSubmission>,
  ) {}

  async create(dto: CreateSongSubmissionDto): Promise<SongSubmission> {
    const row = this.repo.create({
      title: dto.title,
      songwriter: dto.songwriter,
      lyrics: dto.lyrics,
      contactName: dto.contactName,
      contactEmail: dto.contactEmail,
      notes: dto.notes ?? null,
      status: 'pending',
    });
    return this.repo.save(row);
  }

  async findAll(params: {
    status?: SongSubmissionStatus | 'all';
    limit?: number;
    offset?: number;
  }): Promise<{
    items: SongSubmission[];
    hasMore: boolean;
    nextOffset: number | null;
  }> {
    const limit = Math.max(1, Math.min(params.limit ?? 25, 100));
    const offset = Math.max(0, params.offset ?? 0);
    const qb = this.repo
      .createQueryBuilder('s')
      .orderBy('s.createdAt', 'DESC')
      .take(limit + 1)
      .skip(offset);
    if (params.status && params.status !== 'all') {
      qb.andWhere('s.status = :status', { status: params.status });
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

  async findOne(id: string): Promise<SongSubmission> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Song submission not found');
    return row;
  }

  async review(
    id: string,
    dto: ReviewSongSubmissionDto,
    adminId: string,
  ): Promise<SongSubmission> {
    const row = await this.findOne(id);
    row.status = dto.status;
    row.reviewNotes = dto.reviewNotes ?? null;
    row.reviewedByAdminId = adminId;
    row.reviewedAt = new Date();
    return this.repo.save(row);
  }

  toPublic(row: SongSubmission) {
    return {
      id: row.id,
      title: row.title,
      songwriter: row.songwriter,
      lyrics: row.lyrics,
      contactName: row.contactName,
      contactEmail: row.contactEmail,
      notes: row.notes,
      status: row.status,
      reviewedByAdminId: row.reviewedByAdminId,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      reviewNotes: row.reviewNotes,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
