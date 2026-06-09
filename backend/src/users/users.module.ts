import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserStakesController } from './user-stakes.controller';
import { UserStakesService } from './user-stakes.service';
import { User } from './user.entity';
import { AuthModule } from '../auth/auth.module';
import { VideosModule } from '../videos/videos.module';
import { SongsModule } from '../songs/songs.module';
import { BattlesModule } from '../battles/battles.module';
import { Song } from '../songs/song.entity';
import { Vote } from '../battles/vote.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Song, Vote]),
    AuthModule,
    VideosModule, // for CloudinaryService
    SongsModule,
    forwardRef(() => BattlesModule),
  ],
  controllers: [UsersController, UserStakesController],
  providers: [UsersService, UserStakesService],
  exports: [UsersService, TypeOrmModule],
})
export class UsersModule {}
