import {
  Controller,
  Get,
  Param,
  Patch,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  async list(@Req() req: any) {
    const items = await this.notifications.findForUser(req.user.userId);
    const unread = await this.notifications.unreadCount(req.user.userId);
    return {
      items: items.map((n) => this.notifications.toPublic(n)),
      unreadCount: unread,
    };
  }

  @Patch(':id/read')
  async markRead(@Req() req: any, @Param('id') id: string) {
    await this.notifications.markRead(id, req.user.userId);
    return { ok: true };
  }

  @Patch('read-all')
  async markAllRead(@Req() req: any) {
    await this.notifications.markAllRead(req.user.userId);
    return { ok: true };
  }
}
