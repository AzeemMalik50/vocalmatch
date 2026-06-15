import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Video } from '../videos/video.entity';
import { Song } from '../songs/song.entity';
import { Vote } from '../battles/vote.entity';
import { Battle } from '../battles/battle.entity';
import { AdminGuard } from './admin.guard';
import { AdminController } from './admin.controller';
import { AdminPerformancesController } from './admin-performances.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * Cross-cutting admin authorization + user/performance management endpoints.
 *   - AdminGuard is exported so other modules (songs, battles) can compose it
 *   - AdminController hosts /admin/users
 *   - AdminPerformancesController hosts /admin/performances (list, assign song, soft-delete)
 */
@Module({
  imports: [TypeOrmModule.forFeature([User, Video, Song, Vote, Battle]), AuthModule],
  controllers: [AdminController, AdminPerformancesController],
  providers: [AdminGuard],
  exports: [AdminGuard, TypeOrmModule],
})
export class AdminModule {}
