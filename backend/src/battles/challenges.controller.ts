import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Throttle } from '@nestjs/throttler';
import { ChallengesService } from './challenges.service';

class CreateChallengeDto {
  @IsUUID()
  videoId: string;
}

@ApiTags('Challenges (Red Phone)')
@Controller()
export class ChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

  @Throttle({ short: { limit: 5, ttl: 60_000 } })
  @Post('songs/:songId/challenges')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Submit a performance as a Red Phone challenge',
    description:
      'Submits an existing performance (uploaded by the caller, tagged with this song) into the Red Phone queue. The submission lives at `status=pending` until an admin selects or rejects it.',
  })
  @ApiResponse({ status: 201, description: 'Challenge queued.' })
  @ApiResponse({ status: 403, description: 'The performance does not belong to the caller.' })
  @ApiResponse({ status: 400, description: 'The performance is not tagged with this Centerstage Song.' })
  @ApiResponse({ status: 409, description: 'You are the current champion of this song, OR a pending/selected challenge already exists for this song.' })
  async submit(
    @Req() req: any,
    @Param('songId') songId: string,
    @Body() dto: CreateChallengeDto,
  ) {
    const row = await this.challenges.createSubmission({
      songId,
      userId: req.user.userId,
      videoId: dto.videoId,
    });
    return this.challenges.toUserPublic(row);
  }

  @Get('me/challenges')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'List the caller’s own challenge submissions',
    description:
      'Returns every submission the caller has made, regardless of status. Used by the MyChallenges profile section.',
  })
  async listMine(@Req() req: any) {
    const rows = await this.challenges.findByUser(req.user.userId);
    return { items: rows.map((r) => this.challenges.toUserPublic(r)) };
  }
}
