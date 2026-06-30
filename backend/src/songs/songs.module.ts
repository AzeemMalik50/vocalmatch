import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Song } from './song.entity';
import { SongsService } from './songs.service';
import { SongsController } from './songs.controller';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { Battle } from '../battles/battle.entity';
import { ChallengeSubmission } from '../battles/challenge-submission.entity';
import { User } from '../users/user.entity';
import { Video } from '../videos/video.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Song, Battle, ChallengeSubmission, User, Video]),
    AuthModule,
    AdminModule,
  ],
  controllers: [SongsController],
  providers: [SongsService],
  exports: [SongsService, TypeOrmModule],
})
export class SongsModule {}
