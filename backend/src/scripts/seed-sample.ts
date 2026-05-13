/**
 * Seed sample songs, performances, and battles so the Phase 2A flow can be
 * tested end-to-end without hand-uploading videos through the UI.
 *
 * Usage:
 *   npm run seed:sample              Create sample data (idempotent — skips
 *                                    items that already exist by title)
 *   npm run seed:sample -- --reset   Wipe sample data and re-seed
 *
 * What gets created:
 *   - 3 Centerstage Songs (Hallelujah, Wonderwall, Stand By Me)
 *   - 4 demo performances using public sample video URLs (Cloudinary samples)
 *     attributed to the existing @johntest_ddw2 / @ddwqa* test users
 *   - 1 LIVE battle (Hallelujah, closes in 24h) — the admin can vote
 *   - 1 COMPLETED battle (Wonderwall) with realistic vote counts and a winner
 *
 * Sample data is tagged via a Cloudinary public-id prefix `vm_sample_` so
 * the --reset path can find and remove it without touching real uploads.
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcryptjs';
import { DataSource, In } from 'typeorm';
import { User } from '../users/user.entity';
import { Video } from '../videos/video.entity';
import { Song } from '../songs/song.entity';
import { Battle } from '../battles/battle.entity';
import { Vote } from '../battles/vote.entity';
import { Notification } from '../notifications/notification.entity';

dotenv.config();

const SAMPLE_PREFIX = 'vm_sample_';
const entities = [User, Video, Song, Battle, Vote, Notification];

// Public Cloudinary sample videos — playable without auth, durable URLs.
const SAMPLE_VIDEOS = {
  dog: {
    url: 'https://res.cloudinary.com/demo/video/upload/dog.mp4',
    thumb: 'https://res.cloudinary.com/demo/video/upload/dog.jpg',
  },
  elephants: {
    url: 'https://res.cloudinary.com/demo/video/upload/elephants.mp4',
    thumb: 'https://res.cloudinary.com/demo/video/upload/elephants.jpg',
  },
  sea_turtle: {
    url: 'https://res.cloudinary.com/demo/video/upload/sea_turtle.mp4',
    thumb: 'https://res.cloudinary.com/demo/video/upload/sea_turtle.jpg',
  },
  snow: {
    url: 'https://res.cloudinary.com/demo/video/upload/snow.mp4',
    thumb: 'https://res.cloudinary.com/demo/video/upload/snow.jpg',
  },
};

interface SeedSong {
  title: string;
  artist: string;
}

const SONGS: SeedSong[] = [
  { title: 'Hallelujah', artist: 'Leonard Cohen' },
  { title: 'Wonderwall', artist: 'Oasis' },
  { title: 'Stand By Me', artist: 'Ben E. King' },
];

async function reset(ds: DataSource) {
  // Order matters: votes → battles → videos → songs (FKs are not declared in
  // entities but we delete bottom-up to avoid orphaning queries during seeding)
  console.log('Wiping sample data…');

  const sampleVideos = await ds
    .getRepository(Video)
    .createQueryBuilder()
    .where('cloudinaryPublicId LIKE :p', { p: `${SAMPLE_PREFIX}%` })
    .getMany();
  const sampleVideoIds = sampleVideos.map((v) => v.id);

  if (sampleVideoIds.length > 0) {
    const sampleBattles = await ds.getRepository(Battle).find({
      where: [
        { performanceAId: In(sampleVideoIds) },
        { performanceBId: In(sampleVideoIds) },
      ],
    });
    const sampleBattleIds = sampleBattles.map((b) => b.id);

    if (sampleBattleIds.length > 0) {
      await ds
        .getRepository(Vote)
        .createQueryBuilder()
        .delete()
        .where('battleId IN (:...ids)', { ids: sampleBattleIds })
        .execute();
      await ds
        .getRepository(Battle)
        .createQueryBuilder()
        .delete()
        .where('id IN (:...ids)', { ids: sampleBattleIds })
        .execute();
    }

    await ds
      .getRepository(Video)
      .createQueryBuilder()
      .delete()
      .where('id IN (:...ids)', { ids: sampleVideoIds })
      .execute();
  }

  await ds
    .getRepository(Song)
    .createQueryBuilder()
    .delete()
    .where('title IN (:...titles)', { titles: SONGS.map((s) => s.title) })
    .execute();

  console.log('Sample data wiped.\n');
}

async function main() {
  const args = process.argv.slice(2);
  const shouldReset = args.includes('--reset');

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

  if (shouldReset) {
    await reset(ds);
  }

  // ─── 1. Find an admin to attribute song-creation to ────────────
  const admin = await ds.getRepository(User).findOne({ where: { isAdmin: true } });
  if (!admin) {
    console.error(
      '❌ No admin user found. Run `npm run seed:admin -- <username>` first.',
    );
    await ds.destroy();
    process.exit(1);
  }

  // ─── 2. Ensure at least 3 non-admin users exist as performers ──
  // existing users may have isAdmin=NULL (column added after they existed) —
  // treat NULL/false as not-admin.
  const usersRepo = ds.getRepository(User);
  let nonAdmins = (await usersRepo.find({ order: { createdAt: 'ASC' } }))
    .filter((u) => u.isAdmin !== true);

  const SAMPLE_USERS = [
    { username: 'sample_alex',  email: 'sample_alex@vocalmatch.test',  displayName: 'Alex' },
    { username: 'sample_jordan', email: 'sample_jordan@vocalmatch.test', displayName: 'Jordan' },
    { username: 'sample_morgan', email: 'sample_morgan@vocalmatch.test', displayName: 'Morgan' },
  ];
  const SAMPLE_PASSWORD = 'sample-pass-123';

  for (const s of SAMPLE_USERS) {
    if (nonAdmins.length >= 3) break;
    const exists = await usersRepo.findOne({ where: { username: s.username } });
    if (exists) {
      if (!nonAdmins.find((u) => u.id === exists.id)) nonAdmins.push(exists);
      continue;
    }
    const passwordHash = await bcrypt.hash(SAMPLE_PASSWORD, 10);
    const created = usersRepo.create({
      email: s.email,
      username: s.username,
      passwordHash,
      displayName: s.displayName,
      bio: null,
      avatarUrl: null,
      voiceType: null,
      genres: [],
      location: null,
      instagramHandle: null,
      tiktokHandle: null,
      youtubeChannel: null,
      websiteUrl: null,
      profileCompleted: true,
      privateProfile: false,
      hideStatsUntilFirstBattle: false,
      tokenVersion: 0,
      winCount: 0,
      battleCount: 0,
      currentStreak: 0,
      championTitle: null,
      isAdmin: false,
      isSongwriter: false,
    });
    const saved = await usersRepo.save(created);
    nonAdmins.push(saved);
    console.log(`✓ Created sample user: @${saved.username} (password: ${SAMPLE_PASSWORD})`);
  }

  if (nonAdmins.length < 2) {
    console.error(
      `❌ Could not assemble at least 2 non-admin users (have ${nonAdmins.length}).`,
    );
    await ds.destroy();
    process.exit(1);
  }
  const performers = nonAdmins.slice(0, 3);
  const [pA, pB, pC] = performers;
  console.log(
    `Using @${pA.username}${pB ? ', @' + pB.username : ''}${pC ? ', @' + pC.username : ''} as performers.\n`,
  );

  // ─── 3. Create songs (idempotent on title) ─────────────────────
  const songsRepo = ds.getRepository(Song);
  const songs: Song[] = [];
  for (const s of SONGS) {
    let song = await songsRepo.findOne({ where: { title: s.title } });
    if (!song) {
      song = songsRepo.create({
        title: s.title,
        artist: s.artist,
        status: 'active',
        currentChampionStreak: 0,
        createdByAdminId: admin.id,
        currentChampionUserId: null,
        currentChampionPerformanceId: null,
        trackUrl: null,
        coverArtUrl: null,
        submittedBySongwriterId: null,
      });
      song = await songsRepo.save(song);
      console.log(`✓ Song: "${song.title}" — ${song.artist}`);
    } else {
      console.log(`· Song already exists: "${song.title}"`);
    }
    songs.push(song);
  }

  const [hallelujah, wonderwall] = songs;

  // ─── 4. Create demo performances ───────────────────────────────
  const videosRepo = ds.getRepository(Video);

  const ensurePerformance = async (params: {
    title: string;
    uploaderId: string;
    songId: string;
    songTitle: string;
    sample: { url: string; thumb: string };
    durationSeconds: number;
  }) => {
    const publicId = `${SAMPLE_PREFIX}${params.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    let v = await videosRepo.findOne({
      where: { cloudinaryPublicId: publicId },
    });
    if (!v) {
      v = videosRepo.create({
        title: params.title,
        description: `Sample performance — ${params.songTitle}`,
        songTitle: params.songTitle,
        songId: params.songId,
        url: params.sample.url,
        thumbnailUrl: params.sample.thumb,
        durationSeconds: params.durationSeconds,
        cloudinaryPublicId: publicId,
        uploaderId: params.uploaderId,
        category: 'battle_entry',
        visibility: 'public',
        tags: [],
        viewCount: 0,
      });
      v = await videosRepo.save(v);
      console.log(`✓ Performance: "${v.title}" (@${performers.find((p) => p.id === v!.uploaderId)?.username})`);
    } else {
      console.log(`· Performance already exists: "${v.title}"`);
    }
    return v;
  };

  const hallelujahA = await ensurePerformance({
    title: 'Hallelujah — take 1',
    uploaderId: pA.id,
    songId: hallelujah.id,
    songTitle: hallelujah.title,
    sample: SAMPLE_VIDEOS.dog,
    durationSeconds: 8,
  });
  const hallelujahB = await ensurePerformance({
    title: 'Hallelujah — take 2',
    uploaderId: pB.id,
    songId: hallelujah.id,
    songTitle: hallelujah.title,
    sample: SAMPLE_VIDEOS.elephants,
    durationSeconds: 12,
  });
  const wonderwallA = await ensurePerformance({
    title: 'Wonderwall — take 1',
    uploaderId: pA.id,
    songId: wonderwall.id,
    songTitle: wonderwall.title,
    sample: SAMPLE_VIDEOS.sea_turtle,
    durationSeconds: 10,
  });
  const wonderwallB = await ensurePerformance({
    title: 'Wonderwall — take 2',
    uploaderId: pC ? pC.id : pB.id,
    songId: wonderwall.id,
    songTitle: wonderwall.title,
    sample: SAMPLE_VIDEOS.snow,
    durationSeconds: 9,
  });

  // ─── 5. Battles ────────────────────────────────────────────────
  const battlesRepo = ds.getRepository(Battle);

  // 5a. Live battle for Hallelujah (closes in 24h) — admin can vote on it
  const existingLive = await battlesRepo
    .createQueryBuilder('b')
    .where('b.songId = :songId', { songId: hallelujah.id })
    .andWhere('b.status IN (:...statuses)', { statuses: ['live', 'needs_decision'] })
    .getOne();

  let liveBattle: Battle;
  if (!existingLive) {
    liveBattle = battlesRepo.create({
      songId: hallelujah.id,
      title: 'Round 1 · Hallelujah',
      performanceAId: hallelujahA.id,
      performanceBId: hallelujahB.id,
      votingOpensAt: new Date(),
      votingClosesAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: 'live',
      voteCountA: 0,
      voteCountB: 0,
      createdByAdminId: admin.id,
      tieResolvedByAdminId: null,
      winnerPerformanceId: null,
      winnerUserId: null,
      closedAt: null,
    });
    liveBattle = await battlesRepo.save(liveBattle);
    console.log(`\n✓ LIVE battle: ${liveBattle.title} → /battle/${liveBattle.id}`);
  } else {
    liveBattle = existingLive;
    console.log(
      `\n· Live battle for Hallelujah already exists → /battle/${liveBattle.id}`,
    );
  }

  // 5b. Completed battle for Wonderwall (closed yesterday, A won 7-3)
  const existingCompleted = await battlesRepo.findOne({
    where: { songId: wonderwall.id, status: 'completed' },
  });
  let completedBattle: Battle;
  if (!existingCompleted) {
    completedBattle = battlesRepo.create({
      songId: wonderwall.id,
      title: 'Round 1 · Wonderwall',
      performanceAId: wonderwallA.id,
      performanceBId: wonderwallB.id,
      votingOpensAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      votingClosesAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      status: 'completed',
      voteCountA: 7,
      voteCountB: 3,
      winnerPerformanceId: wonderwallA.id,
      winnerUserId: wonderwallA.uploaderId,
      createdByAdminId: admin.id,
      tieResolvedByAdminId: null,
      closedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    completedBattle = await battlesRepo.save(completedBattle);
    console.log(
      `✓ COMPLETED battle: ${completedBattle.title} → /battle/${completedBattle.id}`,
    );

    // Update song's defending champion + winner stats
    wonderwall.currentChampionUserId = wonderwallA.uploaderId;
    wonderwall.currentChampionPerformanceId = wonderwallA.id;
    wonderwall.currentChampionStreak = 1;
    await songsRepo.save(wonderwall);

    const winner = await ds
      .getRepository(User)
      .findOne({ where: { id: wonderwallA.uploaderId } });
    if (winner) {
      winner.battleCount += 1;
      winner.winCount += 1;
      winner.currentStreak += 1;
      await ds.getRepository(User).save(winner);
    }
  } else {
    completedBattle = existingCompleted;
    console.log(
      `· Completed battle for Wonderwall already exists → /battle/${completedBattle.id}`,
    );
  }

  // ─── 6. Summary ────────────────────────────────────────────────
  console.log(`
${'─'.repeat(60)}
Sample data ready. Test the flow:

  1. Sign in as @${admin.username}
  2. Open the homepage — featured live battle card should appear
  3. Visit /battle/${liveBattle.id} (live)
       — try voting; standings reveal only after you vote
  4. Visit /battle/${completedBattle.id} (completed)
       — winner badge + standings visible from the start
  5. /admin/battles → see both, plus filter by status
  6. /admin/songs → see all 3 songs

To reset: npm run seed:sample -- --reset
${'─'.repeat(60)}
`);

  await ds.destroy();
}

main().catch(async (err) => {
  console.error('Failed to seed sample data:', err);
  process.exit(1);
});
