/**
 * Promote a user to admin (sets `isAdmin = true`).
 *
 * Usage:
 *   npm run seed:admin -- <email-or-username>
 *
 * Example:
 *   npm run seed:admin -- azeema@ohzsecurity.com
 *   npm run seed:admin -- azeem
 *
 * Reads DATABASE_URL from .env if present; otherwise falls back to the
 * local SQLite file at vocalmatch.sqlite (same as the running app).
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Video } from '../videos/video.entity';
import { Song } from '../songs/song.entity';
import { Battle } from '../battles/battle.entity';
import { Vote } from '../battles/vote.entity';
import { Notification } from '../notifications/notification.entity';

dotenv.config();

const entities = [User, Video, Song, Battle, Vote, Notification];

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage:');
    console.error('  npm run seed:admin -- <email-or-username>   Promote a user to admin');
    console.error('  npm run seed:admin -- --list                List all users');
    process.exit(1);
  }
  const listMode = target === '--list' || target === 'list';

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
          synchronize: false,
        },
  );

  await ds.initialize();
  const users = ds.getRepository(User);

  if (listMode) {
    const all = await users.find({ order: { createdAt: 'ASC' } });
    console.log(`\nFound ${all.length} user(s) on ${process.env.DATABASE_URL ? 'Postgres' : 'SQLite'}:\n`);
    if (all.length === 0) {
      console.log('  (no users yet — sign up via the app first)');
    } else {
      for (const u of all) {
        const flags = [u.isAdmin && 'ADMIN', u.isSongwriter && 'songwriter']
          .filter(Boolean)
          .join(', ');
        console.log(
          `  @${u.username.padEnd(20)} ${u.email.padEnd(35)} ${flags ? `[${flags}]` : ''}`,
        );
      }
    }
    await ds.destroy();
    return;
  }

  const isEmail = target.includes('@');
  const user = await users
    .createQueryBuilder('u')
    .where(
      isEmail
        ? 'LOWER(u.email) = LOWER(:t)'
        : 'LOWER(u.username) = LOWER(:t)',
      { t: target },
    )
    .getOne();

  if (!user) {
    console.error(
      `❌ No user found with ${isEmail ? 'email' : 'username'} "${target}".`,
    );
    console.error('   Sign up first, then re-run this script.');
    await ds.destroy();
    process.exit(1);
  }

  if (user.isAdmin) {
    console.log(`✓ @${user.username} (${user.email}) is already an admin.`);
    await ds.destroy();
    return;
  }

  user.isAdmin = true;
  await users.save(user);
  console.log(`✓ Promoted @${user.username} (${user.email}) to admin.`);
  console.log('  They can now access /admin in the app.');
  await ds.destroy();
}

main().catch(async (err) => {
  console.error('Failed to seed admin:', err);
  process.exit(1);
});
