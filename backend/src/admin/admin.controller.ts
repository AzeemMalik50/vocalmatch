import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AuditAction } from './audit-action.decorator';
import { AdminAuditLog } from './admin-audit-log.entity';
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
import { SkipThrottle } from '@nestjs/throttler';

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
@SkipThrottle()
@UseInterceptors(AdminAuditInterceptor)
@Controller('admin/users')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AdminAuditLog)
    private readonly auditLogs: Repository<AdminAuditLog>,
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

  @AuditAction('user.flags.update', { targetType: 'user' })
  @Patch(':id/flags')
  @ApiOperation({
    summary: "Admin — toggle a user's admin / songwriter flags",
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

  @AuditAction('user.unlock', { targetType: 'user' })
  @Post(':id/unlock')
  @ApiOperation({
    summary: 'Admin — clear brute-force lockout for a user',
    description:
      'Resets failedLoginCount to 0 and clears lockoutUntil. ' +
      'Allows the user to log in immediately.',
  })
  async unlock(@Param('id') id: string) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    user.failedLoginCount = 0;
    user.lockoutUntil = null;
    await this.users.save(user);
    return {
      unlocked: true,
      userId: user.id,
      at: new Date().toISOString(),
    };
  }

  @Get('/audit-log')
  @ApiOperation({
    summary: 'Admin — paginated audit log (most recent first)',
    description:
      'Filterable by adminUserId, action, targetType, targetId. ' +
      'Max limit 200. Joins username for display.',
  })
  @ApiQuery({ name: 'adminUserId', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'targetType', required: false, type: String })
  @ApiQuery({ name: 'targetId', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async listAuditLog(
    @Query('adminUserId') adminUserId?: string,
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ) {
    const limit = Math.min(parseInt(limitRaw ?? '50', 10) || 50, 200);
    const offset = parseInt(offsetRaw ?? '0', 10) || 0;

    const qb = this.auditLogs
      .createQueryBuilder('l')
      .leftJoin(User, 'u', 'u.id = l.adminUserId')
      .addSelect('u.username', 'adminUsername')
      .orderBy('l.at', 'DESC')
      .take(limit + 1)
      .skip(offset);
    if (adminUserId) qb.andWhere('l.adminUserId = :a', { a: adminUserId });
    if (action) qb.andWhere('l.action = :ac', { ac: action });
    if (targetType) qb.andWhere('l.targetType = :tt', { tt: targetType });
    if (targetId) qb.andWhere('l.targetId = :ti', { ti: targetId });

    const raws = await qb.getRawAndEntities();
    const items = raws.entities.slice(0, limit).map((row, i) => ({
      id: row.id,
      at: row.at.toISOString(),
      adminUserId: row.adminUserId,
      adminUsername: (raws.raw[i] as any).adminUsername ?? null,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      payloadSnapshot: row.payloadSnapshot,
    }));
    const hasMore = raws.entities.length > limit;
    return {
      items,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    };
  }
}