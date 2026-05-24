import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';

/**
 * In-process pub/sub for Server-Sent Events. Each SSE client subscribes
 * to one or more channels (`user:<uuid>`, `battle:<uuid>`); writers
 * (NotificationsService, BattlesService) publish events to those channels.
 *
 * Scale note: this is in-memory and single-instance. If the Railway service
 * ever runs more than one Node process, replace the Map with a Redis pub/sub
 * adapter — the publish/subscribe surface stays identical, only the
 * transport changes. Each channel keeps a Set of active res streams; on
 * client disconnect we remove the entry so leaks don't accumulate.
 */
@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);
  private readonly channels = new Map<string, Set<Response>>();

  /** Channel name builders so callers don't typo `user:` vs `users:`. */
  static userChannel(userId: string): string {
    return `user:${userId}`;
  }
  static battleChannel(battleId: string): string {
    return `battle:${battleId}`;
  }

  /**
   * Register an SSE response object as a subscriber to one or more channels.
   * Returns a cleanup callback the controller should call on client
   * disconnect.
   */
  subscribe(channelKeys: string[], res: Response): () => void {
    for (const key of channelKeys) {
      let set = this.channels.get(key);
      if (!set) {
        set = new Set();
        this.channels.set(key, set);
      }
      set.add(res);
    }
    return () => {
      for (const key of channelKeys) {
        const set = this.channels.get(key);
        if (!set) continue;
        set.delete(res);
        if (set.size === 0) this.channels.delete(key);
      }
    };
  }

  /**
   * Publish an event to every subscriber on a channel. SSE wire format:
   *   event: <name>\n
   *   data: <JSON>\n\n
   * Slow / dead consumers are detected via res.write returning false or
   * throwing — we just skip and let the disconnect handler clean them up.
   */
  publish(channelKey: string, eventName: string, payload: unknown): void {
    const set = this.channels.get(channelKey);
    if (!set || set.size === 0) return;
    const frame = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of set) {
      try {
        res.write(frame);
      } catch (err) {
        this.logger.warn(`Failed to write SSE frame to ${channelKey}: ${err}`);
      }
    }
  }

  /** Returns a snapshot of how many connections each channel has — used in
   * the health endpoint to confirm the service is doing work. */
  stats(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [key, set] of this.channels) out[key] = set.size;
    return out;
  }
}
