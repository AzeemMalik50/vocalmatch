import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SongSubmission } from './song-submission.entity';
import { SongSubmissionsService } from './song-submissions.service';
import { SongSubmissionsController } from './song-submissions.controller';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SongSubmission]),
    AuthModule,
    AdminModule,
  ],
  controllers: [SongSubmissionsController],
  providers: [SongSubmissionsService],
  exports: [SongSubmissionsService],
})
export class SongSubmissionsModule {}
