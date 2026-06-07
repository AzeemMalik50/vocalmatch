import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Vote } from '../battles/vote.entity';
import { Battle } from '../battles/battle.entity';
import { Video } from '../videos/video.entity';

export interface PublicStats {
  totalVotes: number;
  totalBattles: number;
  totalChallengers: number;
  voicesRaised: number;
}

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(Vote) private readonly votes: Repository<Vote>,
    @InjectRepository(Battle) private readonly battles: Repository<Battle>,
    @InjectRepository(Video) private readonly videos: Repository<Video>,
  ) {}

  async getPublicStats(): Promise<PublicStats> {
    const [totalVotes, totalBattles, distinctChallengers, distinctVoters] =
      await Promise.all([
        this.votes.count(),
        this.battles.count(),
        this.videos
          .createQueryBuilder('v')
          .select('COUNT(DISTINCT v.uploaderId)', 'n')
          .where({ deletedAt: IsNull() })
          .getRawOne<{ n: string }>(),
        this.votes
          .createQueryBuilder('v')
          .select('COUNT(DISTINCT v.userId)', 'n')
          .getRawOne<{ n: string }>(),
      ]);

    return {
      totalVotes,
      totalBattles,
      totalChallengers: Number(distinctChallengers?.n ?? 0),
      voicesRaised: Number(distinctVoters?.n ?? 0),
    };
  }
}
