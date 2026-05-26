import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { User } from '../users/user.entity';

class UpdateUserFlagsDto {
  @IsOptional() @IsBoolean()
  isAdmin?: boolean;

  @IsOptional() @IsBoolean()
  isSongwriter?: boolean;
}

/**
 * Admin-only user management. All endpoints require BOTH JwtAuthGuard
 * (verify token) and AdminGuard (verify isAdmin === true at request time).
 */
@ApiTags('Admin – Users')
@ApiBearerAuth('bearer')
@Controller('admin/users')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Admin — list users (paginated, searchable)',
    description: 'Admin only. Search matches case-insensitive substrings on email and username.',
  })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Max 200. Default 50.' })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async list(
    @Query('search') search?: string,
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ) {
    const limit = Math.min(parseInt(limitRaw ?? '50', 10) || 50, 200);
    const offset = parseInt(offsetRaw ?? '0', 10) || 0;
    const qb = this.users
      .createQueryBuilder('u')
      .orderBy('u.createdAt', 'DESC')
      .take(limit + 1)
      .skip(offset);
    if (search) {
      const term = `%${search.trim().toLowerCase()}%`;
      qb.andWhere(
        '(LOWER(u.email) LIKE :term OR LOWER(u.username) LIKE :term)',
        { term },
      );
    }
    const rows = await qb.getMany();
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: items.map((u) => ({
        id: u.id,
        email: u.email,
        username: u.username,
        displayName: u.displayName,
        avatarUrl: u.avatarUrl,
        isAdmin: u.isAdmin,
        isSongwriter: u.isSongwriter,
        winCount: u.winCount,
        battleCount: u.battleCount,
        currentStreak: u.currentStreak,
        createdAt: u.createdAt,
      })),
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    };
  }

  @Patch(':id/flags')
  @ApiOperation({
    summary: 'Admin — toggle a user’s admin / songwriter flags',
    description: 'Admin only. Promote a user to admin, or grant the songwriter flag for upcoming songwriter-portal features.',
  })
  async updateFlags(
    @Param('id') id: string,
    @Body() dto: UpdateUserFlagsDto,
  ) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) return { ok: false };
    if (dto.isAdmin !== undefined) user.isAdmin = dto.isAdmin;
    if (dto.isSongwriter !== undefined) user.isSongwriter = dto.isSongwriter;
    await this.users.save(user);
    return {
      id: user.id,
      isAdmin: user.isAdmin,
      isSongwriter: user.isSongwriter,
    };
  }
}
