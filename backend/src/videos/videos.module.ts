import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VideosController } from './videos.controller';
import { VideosService } from './videos.service';
import { CloudinaryService } from './cloudinary.service';
import { Video } from './video.entity';
import { VideoView } from './video-view.entity';
import { Battle } from '../battles/battle.entity';
import { AuthModule } from '../auth/auth.module';
import { BattlesModule } from '../battles/battles.module';

@Module({
  // Battle entity is registered locally so VideosService can query it for the
  // "used in battle?" soft-delete check without going through BattlesModule.
  // We *also* import BattlesModule (forwardRef'd because BattlesModule depends
  // on the Video entity) so VideosController can call BattlesService to attach
  // battle context to /videos/:id responses.
  imports: [
    TypeOrmModule.forFeature([Video, VideoView, Battle]),
    AuthModule,
    forwardRef(() => BattlesModule),
  ],
  controllers: [VideosController],
  providers: [VideosService, CloudinaryService],
  exports: [VideosService, CloudinaryService, TypeOrmModule],
})
export class VideosModule {}
