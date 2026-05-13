import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Song } from './song.entity';
import { SongsService } from './songs.service';
import { SongsController } from './songs.controller';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Song]),
    AuthModule,
    AdminModule,
  ],
  controllers: [SongsController],
  providers: [SongsService],
  exports: [SongsService, TypeOrmModule],
})
export class SongsModule {}
