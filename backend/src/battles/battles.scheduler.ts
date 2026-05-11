import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BattlesService } from './battles.service';

/**
 * Every minute, find live battles whose `votingClosesAt` has passed and
 * close them. Idempotent — closing an already-closed battle is a no-op.
 *
 * Why a cron and not a setTimeout per-battle?
 *   - Robust to restarts (no in-memory timers to lose)
 *   - Survives multi-instance deployments without coordination (worst case
 *     two instances try to close the same battle in the same minute; the
 *     transactional finalize step guards against double-application)
 *   - Trivial to reason about and test
 */
@Injectable()
export class BattlesScheduler {
  private readonly logger = new Logger(BattlesScheduler.name);

  constructor(private readonly battles: BattlesService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async closeExpiredBattles() {
    const expired = await this.battles.findExpiredLive();
    if (expired.length === 0) return;
    this.logger.log(`Closing ${expired.length} expired battle(s)`);
    for (const b of expired) {
      try {
        await this.battles.closeBattle(b.id);
      } catch (err) {
        this.logger.error(`Failed to close battle ${b.id}: ${err}`);
      }
    }
  }
}
