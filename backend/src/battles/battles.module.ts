import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Battle } from './battle.entity';
import { Vote } from './vote.entity';
import { Video } from '../videos/video.entity';
import { User } from '../users/user.entity';
import { BattlesService } from './battles.service';
import { BattlesController } from './battles.controller';
import { BattlesScheduler } from './battles.scheduler';
import { AuthModule } from '../auth/auth.module';
import { AdminModule } from '../admin/admin.module';
import { SongsModule } from '../songs/songs.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Battle, Vote, Video, User]),
    AuthModule,
    AdminModule,
    SongsModule,
    NotificationsModule,
  ],
  controllers: [BattlesController],
  providers: [BattlesService, BattlesScheduler],
  exports: [BattlesService, TypeOrmModule],
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
  }
}
