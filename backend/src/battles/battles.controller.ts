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
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { BattlesService } from './battles.service';
import { BattleStatus } from './battle.entity';
import { User } from '../users/user.entity';
import {
  CastVoteDto,
  CreateBattleDto,
  ResolveTieDto,
} from './battles.dto';

@Controller('battles')
export class BattlesController {
  constructor(
    private readonly battles: BattlesService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  // ─── Public reads ───────────────────────────────────────────────

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async list(
    @Query('status') status?: BattleStatus,
    @Query('songId') songId?: string,
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ) {
    const limit = limitRaw ? parseInt(limitRaw, 10) || undefined : undefined;
    const offset = offsetRaw ? parseInt(offsetRaw, 10) || 0 : undefined;
    const { items, hasMore, nextOffset } = await this.battles.findAll({
      status,
      songId,
      limit,
      offset,
    });
    // Listing endpoint hides standings — clients render cards from card-level
    // data (title, status, songId), not vote counts. The detail endpoint is
    // where the per-user vote-percentage gate matters.
    return {
      items: items.map((b) => ({
        id: b.id,
        songId: b.songId,
        title: b.title,
        performanceAId: b.performanceAId,
        performanceBId: b.performanceBId,
        votingOpensAt: b.votingOpensAt,
        votingClosesAt: b.votingClosesAt,
        status: b.status,
        createdAt: b.createdAt,
        closedAt: b.closedAt,
        winnerPerformanceId: b.winnerPerformanceId,
      })),
      hasMore,
      nextOffset,
    };
  }

  /**
   * Detail page — gates standings behind whether the requesting user has
   * voted on this battle (Vincent's decision C). Admins always see standings
   * since the admin dashboard needs them to monitor live battles.
   */
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  async getOne(@Req() req: any, @Param('id') id: string) {
    const battle = await this.battles.findOne(id);
    const userId: string | undefined = req.user?.userId;

    let requesterHasVoted = false;
    if (userId) {
      const user = await this.users.findOne({ where: { id: userId } });
      if (user?.isAdmin) {
        requesterHasVoted = true;
      } else {
        requesterHasVoted = await this.battles.hasUserVoted(id, userId);
      }
    }
    return this.battles.toPublic(battle, requesterHasVoted);
  }

  // ─── Voting ─────────────────────────────────────────────────────

  @Post(':id/vote')
  @UseGuards(JwtAuthGuard)
  async vote(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: CastVoteDto,
  ) {
    const battle = await this.battles.castVote(
      id,
      req.user.userId,
      dto.performanceId,
    );
    if (!battle) {
      // Should never happen — castVote always returns the updated battle
      return null;
    }
    return this.battles.toPublic(battle, true);
  }

  // ─── Admin endpoints ────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async create(@Req() req: any, @Body() dto: CreateBattleDto) {
    const battle = await this.battles.create(dto, req.user.userId);
    return this.battles.toPublic(battle, true);
  }

  @Post(':id/close')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async close(@Param('id') id: string) {
    const battle = await this.battles.closeBattle(id);
    return this.battles.toPublic(battle, true);
  }

  @Post(':id/resolve-tie')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async resolveTie(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ResolveTieDto,
  ) {
    const battle = await this.battles.resolveTie(id, dto, req.user.userId);
    return this.battles.toPublic(battle, true);
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async cancel(@Param('id') id: string) {
    const battle = await this.battles.cancel(id);
    return this.battles.toPublic(battle, true);
  }
}
