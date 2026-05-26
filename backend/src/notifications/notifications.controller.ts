import {
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiBearerAuth('bearer')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiOperation({
    summary: 'List the caller’s notifications',
    description:
      'Returns the caller’s notification feed (most recent first) plus the current unread count. New notifications also stream over `GET /stream` as `event: notification` frames.',
  })
  async list(@Req() req: any) {
    const items = await this.notifications.findForUser(req.user.userId);
    const unread = await this.notifications.unreadCount(req.user.userId);
    return {
      items: items.map((n) => this.notifications.toPublic(n)),
      unreadCount: unread,
    };
  }

  @Patch(':id/read')
  @ApiOperation({
    summary: 'Mark a single notification as read',
    description: 'No-op if the notification was already read or doesn’t belong to the caller.',
  })
  async markRead(@Req() req: any, @Param('id') id: string) {
    await this.notifications.markRead(id, req.user.userId);
    return { ok: true };
  }

  @Patch('read-all')
  @ApiOperation({
    summary: 'Mark every notification as read',
    description: 'Bulk-clears the unread badge for this user.',
  })
  async markAllRead(@Req() req: any) {
    await this.notifications.markAllRead(req.user.userId);
    return { ok: true };
  }
}
