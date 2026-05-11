import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationKind } from './notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifications: Repository<Notification>,
  ) {}

  async create(params: {
    userId: string;
    kind: NotificationKind;
    title: string;
    body: string;
    href?: string;
  }) {
    const n = this.notifications.create({
      userId: params.userId,
      kind: params.kind,
      title: params.title,
      body: params.body,
      href: params.href ?? null,
    });
    return this.notifications.save(n);
  }

  async findForUser(userId: string, opts: { limit?: number } = {}) {
    return this.notifications.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(opts.limit ?? 50, 200),
    });
  }

  async unreadCount(userId: string) {
    return this.notifications.count({ where: { userId, read: false } });
  }

  async markRead(id: string, userId: string) {
    await this.notifications.update({ id, userId }, { read: true });
  }

  async markAllRead(userId: string) {
    await this.notifications.update({ userId, read: false }, { read: true });
  }

  toPublic(n: Notification) {
    return {
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      href: n.href,
      read: n.read,
      createdAt: n.createdAt,
    };
  }
}
