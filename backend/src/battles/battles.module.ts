import { Module, OnModuleInit, Logger, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Battle } from './battle.entity';
import { Vote } from './vote.entity';
import { ChallengeSubmission } from './challenge-submission.entity';
import { Video } from '../videos/video.entity';
import { User } from '../users/user.entity';
import { BattlesService } from './battles.service';
import { BattlesController } from './battles.controller';
import { BattlesScheduler } from './battles.scheduler';
import { ChallengesService } from './challenges.service';
import { ChallengesController } from './challenges.controller';
import { AdminChallengesController } from './admin-challenges.controller';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { SongsModule } from '../songs/songs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Battle, Vote, ChallengeSubmission, Video, User]),
    AuthModule,
    AdminModule,
    SongsModule,
    NotificationsModule,
    // forwardRef because RealtimeModule needs BattlesService for the vote-gate
    // check in the SSE handler.
    forwardRef(() => RealtimeModule),
  ],
  controllers: [
    BattlesController,
    ChallengesController,
    AdminChallengesController,
  ],
  providers: [BattlesService, BattlesScheduler, ChallengesService],
  exports: [BattlesService, ChallengesService, TypeOrmModule],
})
export class BattlesModule implements OnModuleInit {
  private readonly logger = new Logger(BattlesModule.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Install the partial unique index that enforces "one live battle per
   * song" at the storage layer (Vincent's decision via John's note).
   *
   * Postgres supports partial indexes natively. SQLite (local dev) does
   * not — the index is skipped and the app-layer check in
   * BattlesService.create() carries the rule.
   */
  async onModuleInit() {
    const driver = this.dataSource.options.type;
    if (driver !== 'postgres') {
      this.logger.log(
        `Skipping partial unique index on ${driver}; relying on app-layer check`,
      );
      return;
    }
    try {
      await this.dataSource.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS one_live_battle_per_song
           ON battles ("songId")
           WHERE status IN ('live', 'needs_decision')`,
      );
      this.logger.log('Partial unique index one_live_battle_per_song ensured');
    } catch (err) {
      this.logger.error(`Failed to create partial unique index: ${err}`);
    }
    try {
      // Phase 2B: at most one pending or selected challenge per song so the
      // Red Phone queue can't be gamed by submitting many entries.
      await this.dataSource.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS one_active_challenger_per_song
           ON challenge_submissions ("songId")
           WHERE status IN ('pending', 'selected')`,
      );
      this.logger.log(
        'Partial unique index one_active_challenger_per_song ensured',
      );
    } catch (err) {
      this.logger.error(
        `Failed to create challenge unique index: ${err}`,
      );
    }

    // Bug #6 backfill — any submission that's still `selected` whose
    // resulting battle has already finalized (completed or cancelled)
    // should be released to `completed` so the per-song queue index
    // stops blocking new challengers. This handles rows created BEFORE
    // the lifecycle fix in BattlesService shipped — going forward,
    // finalizeWinner / cancel update them atomically.
    try {
      const result = await this.dataSource.query(
        `UPDATE challenge_submissions cs
            SET status = 'completed'
           FROM battles b
          WHERE cs."resultingBattleId" = b.id
            AND cs.status = 'selected'
            AND b.status IN ('completed', 'cancelled')`,
      );
      const rowCount = Array.isArray(result) ? result[1] : 0;
      if (rowCount && rowCount > 0) {
        this.logger.log(
          `Released ${rowCount} stale 'selected' challenge submission(s) to 'completed' (queue backfill).`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Failed to backfill completed challenge submissions: ${err}`,
      );
    }
  }
}
