import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChallengesService } from './challenges.service';

class CreateChallengeDto {
  @IsUUID()
  videoId: string;
}

/**
 * Public-facing challenge endpoints.
 *
 * Mounted at `/songs/:songId/challenges` for the submit path, and
 * `/me/challenges` for the user's own list, so the URL reads naturally
 * from the consumer's POV.
 */
@Controller()
export class ChallengesController {
  constructor(private readonly challenges: ChallengesService) {}

  @Post('songs/:songId/challenges')
  @UseGuards(JwtAuthGuard)
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

  /** "My pending challenges" — feeds the profile section. */
  @Get('me/challenges')
  @UseGuards(JwtAuthGuard)
  async listMine(@Req() req: any) {
    const rows = await this.challenges.findByUser(req.user.userId);
    return { items: rows.map((r) => this.challenges.toUserPublic(r)) };
  }
}
