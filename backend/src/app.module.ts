import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { VideosModule } from './videos/videos.module';

import { User } from './users/user.entity';
import { Video } from './videos/video.entity';

const entities = [User, Video];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(
      process.env.DATABASE_URL
        ? {
            type: 'postgres',
            url: process.env.DATABASE_URL,
            entities,
            synchronize: true, // OK for Phase 1; use migrations from Phase 3
            ssl: { rejectUnauthorized: false },
          }
        : {
            type: 'sqlite',
            database: 'vocalmatch.sqlite',
            entities,
            synchronize: true,
          },
    ),
    AuthModule,
    UsersModule,
    VideosModule,
  ],
})
export class AppModule {}
