import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { ChallengesService } from './challenges.service';
import { ChallengeStatus } from './challenge-submission.entity';

class CreateBattleFromChallengeDto {
  @IsOptional() @IsInt() @Min(1) @Max(24 * 14)
  hours?: number;

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
@Controller()
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

  @Get('admin/challenges')
  async list(
    @Query('songId') songId?: string,
    @Query('status') status?: ChallengeStatus | 'open',
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ) {
    const limit = limitRaw ? parseInt(limitRaw, 10) || undefined : undefined;
    const offset = offsetRaw ? parseInt(offsetRaw, 10) || 0 : undefined;
    const { items, hasMore, nextOffset } = await this.challenges.listForAdmin({
      songId,
      status: status ?? 'open', // default surfaces the actionable queue
      limit,
      offset,
    });
    const enriched = await Promise.all(
      items.map((r) => this.challenges.toAdminPublic(r)),
    );
    return { items: enriched, hasMore, nextOffset };
  }

  @Post('admin/challenges/:id/select')
  async select(@Req() req: any, @Param('id') id: string) {
    const row = await this.challenges.select(id, req.user.userId);
    return this.challenges.toAdminPublic(row);
  }

  @Post('admin/challenges/:id/reject')
  async reject(@Req() req: any, @Param('id') id: string) {
    const row = await this.challenges.reject(id, req.user.userId);
    return this.challenges.toAdminPublic(row);
  }

  @Post('admin/battles/from-challenge/:id')
  async createBattle(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CreateBattleFromChallengeDto,
  ) {
    const battle = await this.challenges.createBattleFromChallenge(
      id,
      req.user.userId,
      { hours: dto.hours, title: dto.title },
    );
    return { id: battle.id, songId: battle.songId, status: battle.status };
  }
}
