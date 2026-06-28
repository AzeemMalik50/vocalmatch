import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AdminAuditInterceptor } from '../admin/admin-audit.interceptor';
import { AuditAction } from '../admin/audit-action.decorator';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { ChallengesService } from './challenges.service';
import { SkipThrottle } from '@nestjs/throttler';
import { ChallengeStatus } from './challenge-submission.entity';

class CreateBattleFromChallengeDto {
  /**
   * Voting window duration in hours, 1–336 (14 days max). Used only when
   * `votingClosesAt` is not supplied. Defaults to 48 if both are absent.
   */
  @IsOptional() @IsInt() @Min(1) @Max(24 * 14)
  hours?: number;

  /**
   * Absolute close-time as an ISO 8601 string. Takes precedence over `hours`
   * — matches the regular `POST /battles` contract so admin UIs that
   * pre-compute the close time can use the same payload shape.
   */
  @IsOptional() @IsDateString()
  votingClosesAt?: string;

  @IsOptional() @IsString() @MaxLength(120)
  title?: string;
}

/**
 * Admin Red Phone queue. All endpoints gated by JwtAuthGuard + AdminGuard.
 *
 * - GET    /admin/challenges          — paginated queue, filter by song / status
 * - POST   /admin/challenges/:id/select   — pick a challenger
 * - POST   /admin/challenges/:id/reject   — reject one
 * - POST   /admin/battles/from-challenge/:id — promote a selected one into a live battle
 */
@ApiTags('Admin – Challenges')
@ApiBearerAuth('bearer')
@SkipThrottle()
@UseInterceptors(AdminAuditInterceptor)
@Controller()
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

  @Get('admin/challenges')
  @ApiOperation({
    summary: 'Admin — list challenge submissions',
    description:
      'Admin only. With no `status` query, returns every submission (pending + selected + rejected) — this is what the admin UI\'s "All" tab uses. Pass `status=pending`, `selected`, or `rejected` to filter explicitly; `status=open` is a legacy shortcut equivalent to `pending`; `songId` narrows to a single song.',
  })
  @ApiQuery({ name: 'songId', required: false, type: String })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'selected', 'rejected', 'open', 'all'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async list(
    @Query('songId') songId?: string,
    @Query('status') status?: ChallengeStatus | 'open' | 'all',
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ) {
    const limit = limitRaw ? parseInt(limitRaw, 10) || undefined : undefined;
    const offset = offsetRaw ? parseInt(offsetRaw, 10) || 0 : undefined;
    // Bug fix — previously this defaulted missing-status to 'open', which the
    // service then mapped to pending-only. That meant the frontend's "All"
    // tab (which sends no status param) silently hid Rejected and Selected.
    // No-status now passes through to the service unchanged, where it falls
    // out of every WHERE branch and returns the full queue.
    const { items, hasMore, nextOffset } = await this.challenges.listForAdmin({
      songId,
      status,
      limit,
      offset,
    });
    const enriched = await Promise.all(
      items.map((r) => this.challenges.toAdminPublic(r)),
    );
    return { items: enriched, hasMore, nextOffset };
  }

  @AuditAction('challenge.select', { targetType: 'challenge' })
  @Post('admin/challenges/:id/select')
  @ApiOperation({
    summary: 'Admin — select a challenger',
    description:
      'Marks the submission `status=selected` and writes a `challenger_selected` in-app notification to the challenger. Idempotent on already-selected rows.',
  })
  async select(@Req() req: any, @Param('id') id: string) {
    const row = await this.challenges.select(id, req.user.userId);
    return this.challenges.toAdminPublic(row);
  }

  @AuditAction('challenge.reject', { targetType: 'challenge' })
  @Post('admin/challenges/:id/reject')
  @ApiOperation({
    summary: 'Admin — reject a challenger',
    description:
      'Marks the submission `status=rejected` (soft — row kept for audit) and writes a `challenger_rejected` notification to the challenger.',
  })
  async reject(@Req() req: any, @Param('id') id: string) {
    const row = await this.challenges.reject(id, req.user.userId);
    return this.challenges.toAdminPublic(row);
  }

  @AuditAction('battle.promote_from_challenge', { targetType: 'challenge' })
  @Post('admin/battles/from-challenge/:id')
  @ApiOperation({
    summary: 'Admin — promote a selected challenge into a live battle',
    description:
      "Creates a new battle pairing the song's current champion performance (side A) against the challenger's performance (side B). Goes through the normal battles pipeline so same-song / different-uploader / one-live-per-song invariants still apply.",
  })
  async createBattle(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CreateBattleFromChallengeDto,
  ) {
    const battle = await this.challenges.createBattleFromChallenge(
      id,
      req.user.userId,
      {
        hours: dto.hours,
        votingClosesAt: dto.votingClosesAt,
        title: dto.title,
      },
    );
    return { id: battle.id, songId: battle.songId, status: battle.status };
  }
}
