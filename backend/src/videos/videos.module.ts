import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { CloudinaryService } from './cloudinary.service';
import { Video } from './video.entity';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Video]), AuthModule],
  controllers: [VideosController],
  providers: [VideosService, CloudinaryService],
  exports: [VideosService, CloudinaryService, TypeOrmModule],
})
export class VideosModule {}
