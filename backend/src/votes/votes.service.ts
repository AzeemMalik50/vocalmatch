import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vote } from './vote.entity';
import { Video } from '../videos/video.entity';

@Injectable()
export class VotesService {
  constructor(
    @InjectRepository(Vote) private readonly votes: Repository<Vote>,
    @InjectRepository(Video) private readonly videos: Repository<Video>,
  ) {}

  /**
   * One vote per user per video. If the user already voted, reject the request
   * so the count stays stable and the UI can show "You already voted".
   */
  async toggleVote(userId: string, videoId: string) {
    const video = await this.videos.findOne({ where: { id: videoId } });
    if (!video) throw new NotFoundException('Video not found');

    const existing = await this.votes.findOne({
      where: { userId, videoId },
    });

    if (existing) {
      throw new ConflictException('You already voted');
    }

    try {
      const vote = this.votes.create({ userId, videoId });
      await this.votes.save(vote);
    } catch (err: any) {
      if (err?.code === 'SQLITE_CONSTRAINT' || err?.code === '23505') {
        throw new ConflictException('You already voted');
      }
      throw err;
    }

    const voteCount = await this.votes.count({ where: { videoId } });
    return { videoId, hasVoted: true, voteCount };
  }

  async getCount(videoId: string) {
    const voteCount = await this.votes.count({ where: { videoId } });
    return { videoId, voteCount };
  }
}
