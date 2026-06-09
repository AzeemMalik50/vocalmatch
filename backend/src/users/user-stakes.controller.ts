import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserStakesService } from './user-stakes.service';

@ApiTags('User Stakes')
@Controller('users/me')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
export class UserStakesController {
  constructor(private readonly stakes: UserStakesService) {}

  @Get('at-risk-crowns')
  @ApiOperation({
    summary:
      'Songs the caller is currently championing (or voting on) that are at risk',
    description:
      'Auth required. Hybrid: champion view (songs the user currently champions, ranked by lowest survival chance) with voter fallback (songs the user has voted on whose champion is HIGH or CRITICAL risk). Up to 3 items. Empty array means the frontend should fall back to the marquee `/songs/featured/risk` endpoint.',
  })
  async atRisk(@Req() req: any) {
    return this.stakes.findMyAtRiskCrowns(req.user.userId);
  }

  @Get('recent-dethronements')
  @ApiOperation({
    summary: 'Crown changes that personally affect the caller',
    description:
      'Auth required. Hybrid: champion view (battles where the caller was the previous winner) with voter fallback (battles where the caller voted for the losing side). Up to 3 items, newest first. Empty array means the frontend should fall back to `/battles/dethronements/recent`.',
  })
  async dethronements(@Req() req: any) {
    return this.stakes.findMyRecentDethronements(req.user.userId);
  }
}
