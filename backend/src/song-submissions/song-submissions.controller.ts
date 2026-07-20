import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { SongSubmissionsService } from './song-submissions.service';
import {
  CreateSongSubmissionDto,
  ReviewSongSubmissionDto,
} from './song-submissions.dto';
import { SongSubmissionStatus } from './song-submission.entity';

@ApiTags('Song Submissions')
@Controller('song-submissions')
export class SongSubmissionsController {
  constructor(private readonly submissions: SongSubmissionsService) {}

  // Public endpoint — anyone (logged-in or not) can propose a song.
  // Rate-limited hard because the endpoint is unauthenticated:
  // 3 submissions / 5 min per IP is generous for real songwriters
  // and cheap enough to blunt spam.
  @Post()
  @Throttle({ short: { limit: 3, ttl: 300_000 } })
  @ApiOperation({
    summary: 'Submit a song for consideration',
    description:
      'Public endpoint. Songwriters propose a song for the Centerstage catalog. Admins review the queue and decide whether to promote it into an actual Song row (via the admin Songs flow).',
  })
  async create(@Body() dto: CreateSongSubmissionDto) {
    const row = await this.submissions.create(dto);
    return this.submissions.toPublic(row);
  }

  // ─── Admin queue ────────────────────────────────────────────────

  @Get()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Admin — list song submissions',
    description:
      'Admin only. Defaults to `status=pending` so the review queue is the landing state.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['pending', 'approved', 'rejected', 'all'],
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async list(
    @Query('status') status?: SongSubmissionStatus | 'all',
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ) {
    const limit = limitRaw ? parseInt(limitRaw, 10) || undefined : undefined;
    const offset = offsetRaw ? parseInt(offsetRaw, 10) || 0 : undefined;
    const { items, hasMore, nextOffset } = await this.submissions.findAll({
      status: status ?? 'pending',
      limit,
      offset,
    });
    return {
      items: items.map((s) => this.submissions.toPublic(s)),
      hasMore,
      nextOffset,
    };
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Admin — read a single submission' })
  async getOne(@Param('id') id: string) {
    const row = await this.submissions.findOne(id);
    return this.submissions.toPublic(row);
  }

  @Patch(':id/review')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Admin — approve or reject a submission',
    description:
      'Approving is purely editorial — creating the actual Song row still happens via the admin Songs flow.',
  })
  async review(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ReviewSongSubmissionDto,
  ) {
    const row = await this.submissions.review(id, dto, req.user.userId);
    return this.submissions.toPublic(row);
  }
}
