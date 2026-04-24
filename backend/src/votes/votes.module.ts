import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VotesController } from './votes.controller';
import { VotesService } from './votes.service';
import { Vote } from './vote.entity';
import { Video } from '../videos/video.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Vote, Video]), AuthModule],
  controllers: [VotesController],
  providers: [VotesService],
  exports: [TypeOrmModule],
})
export class VotesModule {}
