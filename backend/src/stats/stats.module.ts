import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Battle } from '../battles/battle.entity';
import { Vote } from '../battles/vote.entity';
import { Video } from '../videos/video.entity';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

@Module({
  imports: [TypeOrmModule.forFeature([Vote, Battle, Video])],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
