import {
  Controller,
  Post,
  Get,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { VotesService } from './votes.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('videos/:videoId/votes')
export class VotesController {
  constructor(private readonly votesService: VotesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  toggle(@Req() req: any, @Param('videoId') videoId: string) {
    return this.votesService.toggleVote(req.user.userId, videoId);
  }

  @Get('count')
  count(@Param('videoId') videoId: string) {
    return this.votesService.getCount(videoId);
  }
}
