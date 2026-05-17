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
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { SongsService } from './songs.service';
import { CreateSongDto, UpdateSongDto } from './songs.dto';
import { SongStatus } from './song.entity';

@Controller('songs')
export class SongsController {
  constructor(private readonly songs: SongsService) {}

  /**
   * Public listing — anyone can browse the active Centerstage Song catalog.
   * Admins can pass ?status=retired or ?status=all.
   */
  @Get()
  @UseGuards(OptionalJwtAuthGuard)
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
  async getOne(@Param('id') id: string) {
    const song = await this.songs.findOne(id);
    return this.songs.toPublic(song);
  }

  // ─── Admin endpoints ────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, AdminGuard)
  async create(@Req() req: any, @Body() dto: CreateSongDto) {
    const song = await this.songs.create(dto, req.user.userId);
    return this.songs.toPublic(song);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  async update(@Param('id') id: string, @Body() dto: UpdateSongDto) {
    const song = await this.songs.update(id, dto);
    return this.songs.toPublic(song);
  }
}
