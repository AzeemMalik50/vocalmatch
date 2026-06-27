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
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  Equals,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';
import { VideosService, VideoSort } from './videos.service';
import { VideoCategory, VideoVisibility } from './video.entity';
import { BattlesService } from '../battles/battles.service';
import { LegalService } from '../legal/legal.service';

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

  // FormData fields arrive as strings. Transform 'true' → true, anything
  // else → false so @Equals(true) rejects missing/false correctly.
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @Equals(true, {
    message:
      'You must acknowledge ownership and grant the platform license to upload',
  })
  uploadAcknowledged: boolean;
}

@ApiTags('Videos')
@Controller('videos')
export class VideosController {
  constructor(
    private readonly videos: VideosService,
    private readonly battles: BattlesService,
    private readonly legal: LegalService,
  ) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'List performances (paginated, filterable)',
    description:
      'Anonymous-readable. Supports filtering by category, uploader, voice type, genre, free-text search, and whether a thumbnail is set. Sort is one of `newest`, `most_viewed`, `trending`.',
  })
  @ApiQuery({ name: 'category', required: false, enum: ['solo', 'battle_entry', 'challenge_entry'] })
  @ApiQuery({ name: 'uploaderId', required: false, type: String })
  @ApiQuery({ name: 'voiceType', required: false, type: String })
  @ApiQuery({ name: 'genre', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'hasThumbnail', required: false, type: String })
  @ApiQuery({ name: 'sort', required: false, enum: ['newest', 'most_viewed', 'trending'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
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
  @ApiOperation({
    summary: 'Get a performance by id',
    description:
      'Records one view per unique signed-in viewer (self-views excluded). If the performance is currently in a live or completed battle, the `battle` field surfaces it so the frontend can redirect / annotate.',
  })
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
  @ApiBearerAuth('bearer')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['video', 'title'],
      properties: {
        video: { type: 'string', format: 'binary' },
        title: { type: 'string', maxLength: 120 },
        description: { type: 'string', maxLength: 1000 },
        songTitle: { type: 'string', maxLength: 120 },
        songId: { type: 'string', format: 'uuid' },
        category: { type: 'string', enum: ['solo', 'battle_entry', 'challenge_entry'] },
        visibility: { type: 'string', enum: ['public', 'unlisted', 'private'] },
        tags: { type: 'string', description: 'Comma-separated, max 10 tags, 30 chars each.' },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload a performance',
    description:
      'Multipart upload. 100MB cap; `video/*` only. The video is stored on Cloudinary; the returned record includes the public URL and thumbnail. Tags must be comma-separated; leading `#` is stripped.',
  })
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
    const versions = await this.legal.getCurrentVersionIds(['terms']);
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
      uploadAckTermsVersionId: versions.terms,
      uploadAckAt: new Date(),
    });
    return this.videos.toPublic(created);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Soft-delete a performance',
    description:
      'Only the uploader can call this. Soft-deletes (`deletedAt` set) so battle history is preserved. Returns 409 if the performance has already participated in a battle — admins can override via `DELETE /admin/performances/:id`.',
  })
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.videos.delete(id, req.user.userId);
  }
}
