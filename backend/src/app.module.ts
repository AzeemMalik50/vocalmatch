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
    TypeOrmModule.forRoot(
      process.env.DATABASE_URL
        ? {
            type: 'postgres',
            url: process.env.DATABASE_URL,
            entities: [User, Video, Vote],
            synchronize: true, // fine for a demo; use migrations in real prod
            ssl: { rejectUnauthorized: false }, // Neon requires SSL
          }
        : {
            type: 'sqlite',
            database: process.env.DB_NAME || 'database.sqlite',
            entities: [User, Video, Vote],
            synchronize: true,
          },
    ),
    AuthModule,
    VideosModule,
    VotesModule,
  ],
})
export class AppModule {}
