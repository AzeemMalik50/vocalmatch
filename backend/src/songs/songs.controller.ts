import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { SongsService } from './songs.service';
import { CreateSongDto, UpdateSongDto } from './songs.dto';
import { SongStatus } from './song.entity';

@ApiTags('Songs')
@Controller('songs')
export class SongsController {
  constructor(private readonly songs: SongsService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'List Centerstage Songs (paginated)',
    description:
      'Anonymous-readable. Defaults to `status=active`. Admins can pass `status=retired` or `status=all` from the admin dashboard.',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'retired', 'all'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async list(
    @Req() req: any,
    @Query('status') status?: SongStatus | 'all',
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ) {
    const isAdmin = req.user
      ? // We can't see isAdmin from the JWT alone; default to 'active' for
        // non-admins. Admins viewing the dashboard pass status explicitly.
        false
      : false;
    const limit = limitRaw ? parseInt(limitRaw, 10) || undefined : undefined;
    const offset = offsetRaw ? parseInt(offsetRaw, 10) || 0 : undefined;
    const { items, hasMore, nextOffset } = await this.songs.findAll({
      status: status ?? (isAdmin ? 'all' : 'active'),
      limit,
      offset,
    });
    return {
      items: items.map((s) => this.songs.toPublic(s)),
      hasMore,
      nextOffset,
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a Centerstage Song by id',
    description:
      'Returns title, artist, status, and the current champion fields (`currentChampionUserId`, `currentChampionPerformanceId`, `currentChampionStreak`).',
  })
  async getOne(@Param('id') id: string) {
    const song = await this.songs.findOne(id);
    return this.songs.toPublic(song);
  }

  // ─── Admin endpoints ────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Admin — create a Centerstage Song',
    description: 'Admin only. Newly created songs are `status=active` and immediately eligible for performance tagging + battles.',
  })
  async create(@Req() req: any, @Body() dto: CreateSongDto) {
    const song = await this.songs.create(dto, req.user.userId);
    return this.songs.toPublic(song);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Admin — update a song (rename, retire, restore)',
    description: 'Admin only. Set `status=retired` to remove from the public catalog without deleting historical battles.',
  })
  async update(@Param('id') id: string, @Body() dto: UpdateSongDto) {
    const song = await this.songs.update(id, dto);
    return this.songs.toPublic(song);
  }
}
