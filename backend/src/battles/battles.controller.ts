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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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

@ApiTags('Battles')
@Controller('battles')
export class BattlesController {
  constructor(
    private readonly battles: BattlesService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  // ─── Public reads ───────────────────────────────────────────────

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'List battles (paginated)',
    description:
      'Anonymous-readable. Card-level data only — vote counts and percentages are NOT included here, regardless of whether the caller has voted. Use `GET /battles/:id` for standings.',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['scheduled', 'live', 'needs_admin_decision', 'completed', 'cancelled'] })
  @ApiQuery({ name: 'songId', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
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

  @Get('dethronements/recent')
  @ApiOperation({
    summary: 'Recent dethronements',
    description:
      'Public feed of recent crown changes — completed battles where the winning user is NOT the same as the previous battle winner for that song. Each item bundles former + new champion (username + avatarUrl), the song title, dethronement timestamp, and the winner vote-percentage. Used by the homepage "Dethroned!" panel.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async dethronements(@Query('limit') limitRaw?: string) {
    const limit = limitRaw ? parseInt(limitRaw, 10) || 5 : 5;
    return this.battles.findRecentDethronements(Math.min(limit, 50));
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Get a battle by id',
    description:
      'Detail view. Vote percentages, leader, and total counts are GATED — they’re only included when the caller has voted on this battle (or is an admin). Anonymous and not-yet-voted callers still get status, performance ids, voting window, and winner (if completed).',
  })
  async getOne(@Req() req: any, @Param('id') id: string) {
    const battle = await this.battles.findOne(id);
    const userId: string | undefined = req.user?.userId;

    // `requesterHasVoted` is LITERAL — true only when the caller actually has
    // a vote row. `canSeeStandings` is the gate for counts/percentages and
    // is admin-elevated. The frontend uses these for two different decisions
    // (vote-button visibility vs. standings panel visibility), so we keep
    // them separate to avoid the "admin sees Vote locked in with 0 votes" bug.
    let requesterHasVoted = false;
    let canSeeStandings = false;
    if (userId) {
      const user = await this.users.findOne({ where: { id: userId } });
      requesterHasVoted = await this.battles.hasUserVoted(id, userId);
      canSeeStandings = requesterHasVoted || !!user?.isAdmin;
    }

    // Pre-fetch the winner's user snapshot so the UI can render their
    // identity even when the winning video has been soft-deleted —
    // previously the frontend fell back to fetching the (now-404'd)
    // video and showed a generic "Crowned" label.
    const winnerUser = battle.winnerUserId
      ? await this.users.findOne({ where: { id: battle.winnerUserId } })
      : null;

    return this.battles.toPublic(battle, {
      requesterHasVoted,
      canSeeStandings,
      winnerUser,
    });
  }

  // ─── Voting ─────────────────────────────────────────────────────

  @Post(':id/vote')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Cast a vote on a battle',
    description:
      'One vote per user per battle. Returns the updated battle with standings now unlocked for this caller. Voting also opens the SSE battle channel for this user.',
  })
  @ApiResponse({ status: 200, description: 'Vote recorded.' })
  @ApiResponse({ status: 409, description: 'You have already voted on this battle.' })
  @ApiResponse({ status: 400, description: 'Battle is not currently accepting votes (not live, or window closed).' })
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
    // The caller just voted: requesterHasVoted is genuinely true,
    // and standings unlock as a consequence.
    return this.battles.toPublic(battle, {
      requesterHasVoted: true,
      canSeeStandings: true,
    });
  }

  // ─── Admin endpoints ────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Admin — create a battle',
    description:
      'Admin only. Pairs two performances of the same song with different uploaders into a live battle. Enforces same-song / different-uploader / one-live-per-song invariants.',
  })
  async create(@Req() req: any, @Body() dto: CreateBattleDto) {
    const battle = await this.battles.create(dto, req.user.userId);
    // Admin who just created this hasn't voted on it yet — but as admin
    // they're allowed to see standings (which are 0–0 at this point anyway).
    return this.battles.toPublic(battle, {
      requesterHasVoted: false,
      canSeeStandings: true,
    });
  }

  @Post(':id/close')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Admin — manually close a battle now',
    description: 'Admin only. Force-finalizes a live battle before its `votingClosesAt`. Ties end in `needs_admin_decision`.',
  })
  async close(@Param('id') id: string) {
    const battle = await this.battles.closeBattle(id);
    return this.battles.toPublic(battle, {
      requesterHasVoted: false,
      canSeeStandings: true,
    });
  }

  @Post(':id/resolve-tie')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Admin — resolve a tied battle',
    description:
      'Admin only. Pick the winner manually when a battle ended with equal vote counts. Updates the champion + streak fields on the song.',
  })
  async resolveTie(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ResolveTieDto,
  ) {
    const battle = await this.battles.resolveTie(id, dto, req.user.userId);
    return this.battles.toPublic(battle, {
      requesterHasVoted: false,
      canSeeStandings: true,
    });
  }

  @Post(':id/cancel')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Admin — cancel a battle',
    description: 'Admin only. Marks the battle `status=cancelled` so it stops appearing publicly. No champion impact.',
  })
  async cancel(@Param('id') id: string) {
    const battle = await this.battles.cancel(id);
    return this.battles.toPublic(battle, {
      requesterHasVoted: false,
      canSeeStandings: true,
    });
  }
}
