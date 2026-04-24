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
   * Toggle behavior: if the user already voted, remove it. Otherwise create it.
   * Returns the current state for that video so UI can update instantly.
   */
  async toggleVote(userId: string, videoId: string) {
    const video = await this.videos.findOne({ where: { id: videoId } });
    if (!video) throw new NotFoundException('Video not found');

    const existing = await this.votes.findOne({
      where: { userId, videoId },
    });

    if (existing) {
      await this.votes.remove(existing);
    } else {
      try {
        const vote = this.votes.create({ userId, videoId });
        await this.votes.save(vote);
      } catch (err: any) {
        // Defensive: unique constraint race condition
        if (err?.code === 'SQLITE_CONSTRAINT' || err?.code === '23505') {
          throw new ConflictException('Already voted');
        }
        throw err;
      }
    }

    const voteCount = await this.votes.count({ where: { videoId } });
    return { videoId, hasVoted: !existing, voteCount };
  }

  async getCount(videoId: string) {
    const voteCount = await this.votes.count({ where: { videoId } });
    return { videoId, voteCount };
  }
}
