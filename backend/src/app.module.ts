import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { VideosModule } from './videos/videos.module';
import { VotesModule } from './votes/votes.module';
import { User } from './auth/user.entity';
import { Video } from './videos/video.entity';
import { Vote } from './votes/vote.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot({
      type: 'sqlite',
      database: process.env.DB_NAME || 'database.sqlite',
      entities: [User, Video, Vote],
      synchronize: true, // auto-create tables; turn off in production
    }),
    AuthModule,
    VideosModule,
    VotesModule,
  ],
})
export class AppModule {}
