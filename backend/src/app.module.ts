import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

// ─── Domain modules ───────────────────────────────────────────────
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { VideosModule } from './videos/videos.module';
import { SongsModule } from './songs/songs.module';
import { SongSubmissionsModule } from './song-submissions/song-submissions.module';
import { BattlesModule } from './battles/battles.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AdminModule } from './admin/admin.module';
import { RealtimeModule } from './realtime/realtime.module';
import { StatsModule } from './stats/stats.module';
import { LegalModule } from './legal/legal.module';
import { SecurityModule } from './security/security.module';
import { QrModule } from './qr/qr.module';
import { HealthController } from './health/health.controller';

// ─── Entities (registered with TypeORM at the root) ───────────────
import { User } from './users/user.entity';
import { Video } from './videos/video.entity';
import { VideoView } from './videos/video-view.entity';
import { Song } from './songs/song.entity';
import { SongSubmission } from './song-submissions/song-submission.entity';
import { Battle } from './battles/battle.entity';
import { Vote } from './battles/vote.entity';
import { ChallengeSubmission } from './battles/challenge-submission.entity';
import { Notification } from './notifications/notification.entity';
import { LegalPage } from './legal/legal-page.entity';
import { LegalPageVersion } from './legal/legal-page-version.entity';
import { AdminAuditLog } from './admin/admin-audit-log.entity';

const entities = [
  User,
  Video,
  VideoView,
  Song,
  SongSubmission,
  Battle,
  Vote,
  ChallengeSubmission,
  Notification,
  LegalPage,
  LegalPageVersion,
  AdminAuditLog,
];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(), // enables @Cron in BattlesScheduler
    ThrottlerModule.forRoot([
      { name: 'short',  ttl: 1_000,     limit: 10 },
      { name: 'medium', ttl: 60_000,    limit: 100 },
      { name: 'long',   ttl: 3_600_000, limit: 1000 },
    ]),
    TypeOrmModule.forRoot(
      process.env.DATABASE_URL
        ? {
            type: 'postgres',
            url: process.env.DATABASE_URL,
            entities,
            // Auto-sync is fine for dev/staging during Phase 2A iteration, but
            // disabled in production so a stray entity edit can't silently
            // ALTER prod columns. From Phase 3 onward, all schema moves happen
            // through hand-written migrations.
            //
            // Escape hatch: `TYPEORM_SYNCHRONIZE=true` forces synchronize on
            // even when NODE_ENV=production. Used exactly ONCE on QA /
            // staging to bootstrap the empty database, then turned back
            // OFF. Never leave this on in real prod — a stray entity edit
            // would silently reshape the schema.
            synchronize:
              process.env.TYPEORM_SYNCHRONIZE === 'true' ||
              process.env.NODE_ENV !== 'production',
            ssl: { rejectUnauthorized: false },
          }
        : {
            type: 'sqlite',
            database: 'vocalmatch.sqlite',
            entities,
            synchronize: true,
          },
    ),

    // Order: AdminModule before SongsModule/BattlesModule so the AdminGuard
    // is available when those modules' controllers are wired up.
    AuthModule,
    AdminModule,
    UsersModule,
    VideosModule,
    SongsModule,
    SongSubmissionsModule,
    BattlesModule,
    NotificationsModule,
    RealtimeModule,
    StatsModule,
    LegalModule,
    SecurityModule,
    QrModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
