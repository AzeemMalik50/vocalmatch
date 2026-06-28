//
// Idempotently inserts the 6 default legal pages + their v1 versions.
// Safe to re-run: skips any slug whose page row already exists.
//
// Usage:
//   npm run seed:legal

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Video } from '../videos/video.entity';
import { VideoView } from '../videos/video-view.entity';
import { Song } from '../songs/song.entity';
import { Battle } from '../battles/battle.entity';
import { Vote } from '../battles/vote.entity';
import { ChallengeSubmission } from '../battles/challenge-submission.entity';
import { Notification } from '../notifications/notification.entity';
import { LegalPage } from '../legal/legal-page.entity';
import { LegalPageVersion } from '../legal/legal-page-version.entity';
import { DEFAULT_LEGAL_PAGES } from '../legal/seed-content';

dotenv.config();

const entities = [
  User,
  Video,
  VideoView,
  Song,
  Battle,
  Vote,
  ChallengeSubmission,
  Notification,
  LegalPage,
  LegalPageVersion,
];

async function main() {
  const ds = new DataSource(
    process.env.DATABASE_URL
      ? {
          type: 'postgres',
          url: process.env.DATABASE_URL,
          entities,
          synchronize: false,
          ssl: { rejectUnauthorized: false },
        }
      : {
          type: 'sqlite',
          database: 'vocalmatch.sqlite',
          entities,
          synchronize: true,
        },
  );
  await ds.initialize();

  const pages = ds.getRepository(LegalPage);
  const versions = ds.getRepository(LegalPageVersion);

  for (const seed of DEFAULT_LEGAL_PAGES) {
    const existing = await pages.findOne({ where: { slug: seed.slug } });
    if (existing) {
      console.log(`  skipped ${seed.slug} (already seeded)`);
      continue;
    }
    await ds.transaction(async (mgr) => {
      const pageRow = await mgr.getRepository(LegalPage).save({
        slug: seed.slug,
        title: seed.title,
        currentVersionId: null,
      } as any);
      const versionRow = await mgr.getRepository(LegalPageVersion).save({
        pageId: pageRow.id,
        versionNumber: 1,
        bodyMarkdown: seed.bodyMarkdown,
        publishedAt: new Date(),
        publishedById: null,
      } as any);
      await mgr
        .getRepository(LegalPage)
        .update({ id: pageRow.id }, { currentVersionId: versionRow.id });
    });
    console.log(`  seeded ${seed.slug}`);
  }

  await ds.destroy();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
