import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';
import { VideosService, VideoSort } from './videos.service';
import { VideoCategory, VideoVisibility } from './video.entity';
import { BattlesService } from '../battles/battles.service';

const SORTS: VideoSort[] = ['newest', 'most_viewed', 'trending'];
const VISIBILITIES: VideoVisibility[] = ['public', 'unlisted', 'private'];

class CreateVideoDto {
  @IsString() @MinLength(1) @MaxLength(120)
  title: string;

  @IsOptional() @IsString() @MaxLength(1000)
  description?: string;

  @IsOptional() @IsString() @MaxLength(120)
  songTitle?: string;

  /** Optional Centerstage Song link. Required if uploading as a battle entry. */
  @IsOptional() @IsUUID()
  songId?: string;

  @IsOptional() @IsIn(['solo', 'battle_entry', 'challenge_entry'])
  category?: VideoCategory;

  @IsOptional() @IsIn(VISIBILITIES)
  visibility?: VideoVisibility;

  @IsOptional() @IsString() @MaxLength(500)
  // Comma-separated string from FormData; service parses
  tags?: string;
}

@Controller('videos')
export class VideosController {
  constructor(
    private readonly videos: VideosService,
    private readonly battles: BattlesService,
  ) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  async list(
    @Req() req: any,
    @Query('category') category?: VideoCategory,
    @Query('uploaderId') uploaderId?: string,
    @Query('voiceType') voiceType?: string,
    @Query('genre') genre?: string,
    @Query('search') search?: string,
    @Query('hasThumbnail') hasThumbnail?: string,
    @Query('sort') sort?: VideoSort,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const sortOpt = sort && SORTS.includes(sort) ? sort : 'newest';
    const result = await this.videos.findAll({
      category,
      uploaderId,
      voiceType: voiceType || undefined,
      genre: genre || undefined,
      search: search || undefined,
      hasThumbnail: hasThumbnail === 'true' || hasThumbnail === '1',
      sort: sortOpt,
      viewerId: req.user?.userId,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });
    return {
      items: result.items.map((v) => this.videos.toPublic(v)),
      hasMore: result.hasMore,
      nextOffset: result.nextOffset,
    };
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  async getOne(@Req() req: any, @Param('id') id: string) {
    const video = await this.videos.findOneAuthorized(id, req.user?.userId);
    // Count one view per unique signed-in user. Anonymous views are not
    // counted (no userId means no dedupe surface). Self-views (uploader
    // visiting their own page) are also excluded so the count reflects
    // real audience.
    const viewerId: string | undefined = req.user?.userId;
    if (viewerId && viewerId !== video.uploaderId) {
      this.videos.recordView(id, viewerId).catch(() => {});
    }
    // Phase 2A: surface the battle this video is in (if any) so the frontend
    // can transform /v/:id into a battle-aware view (redirect to /battle/:id
    // when live, show a "this performance was in..." banner when completed).
    const battle = await this.battles.findLatestBattleForVideo(id);
    return {
      ...this.videos.toPublic(video),
      battle: battle
        ? {
            id: battle.id,
            status: battle.status,
            title: battle.title,
            songId: battle.songId,
            votingClosesAt: battle.votingClosesAt,
            winnerPerformanceId: battle.winnerPerformanceId,
          }
        : null,
    };
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
          new MaxFileSizeValidator({ maxSize: 100 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /video\/.*/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const tags = (dto.tags ?? '')
      .split(',')
      .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
      .filter((t) => t.length > 0 && t.length <= 30)
      .slice(0, 10);

    const created = await this.videos.create({
      title: dto.title,
      description: dto.description,
      songTitle: dto.songTitle,
      songId: dto.songId,
      uploaderId: req.user.userId,
      fileBuffer: file.buffer,
      category: dto.category ?? 'solo',
      visibility: dto.visibility ?? 'public',
      tags,
    });
    return this.videos.toPublic(created);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.videos.delete(id, req.user.userId);
  }
}
