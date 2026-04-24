import {
  Controller,
  Post,
  Get,
  UseInterceptors,
  UploadedFile,
  Body,
  UseGuards,
  Req,
  BadRequestException,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VideosService } from './videos.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IsOptional, IsString, MinLength } from 'class-validator';

class CreateVideoDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;
}

// Optional guard: reads JWT if present but doesn't reject if absent
import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
@Injectable()
class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
  handleRequest(err, user) {
    return user || null; // don't throw on missing/invalid token
  }
}

@Controller('videos')
export class VideosController {
  constructor(private readonly videosService: VideosService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(@Req() req: any) {
    return this.videosService.findAll(req.user?.userId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('video'))
  async upload(
    @Req() req: any,
    @Body() dto: CreateVideoDto,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 100 * 1024 * 1024 }), // 100 MB
          new FileTypeValidator({ fileType: /video\/.*/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.videosService.create({
      title: dto.title,
      description: dto.description,
      uploaderId: req.user.userId,
      fileBuffer: file.buffer,
    });
  }
}
