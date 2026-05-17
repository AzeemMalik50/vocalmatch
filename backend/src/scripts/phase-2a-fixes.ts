/**
 * One-shot data migration for the Phase 2A bug-fix batch.
 *
 * Runs two independent fixes:
 *   1. songId backfill — links existing performances to Centerstage Songs so
 *      they can be used in battles under the tightened same-song validation.
 *      Strategy: first match by battle participation (authoritative), then
 *      by case-insensitive songTitle match against the songs catalog.
 *   2. timestamp -> timestamptz — converts the four naive `timestamp` columns
 *      to `timestamp with time zone`, treating existing values as UTC (which
 *      is how TypeORM was writing them anyway). Fixes the "created after
 *      closed" display bug where JS Date parsed naive timestamps as local.
 *
 * Idempotent — safe to re-run. Reads DATABASE_URL from .env.
 *
 * Usage:
 *   npm run fix:phase-2a
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

dotenv.config();

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Aborting.');
    process.exit(1);
  }

  const ds = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await ds.initialize();

  try {
    // ─── 1. songId backfill ────────────────────────────────────────
    console.log('Backfilling songId from battle participation…');
    const battleFill = await ds.query(`
      UPDATE videos v
      SET "songId" = b."songId"
      FROM battles b
      WHERE v."songId" IS NULL
        AND (v.id = b."performanceAId" OR v.id = b."performanceBId")
    `);
    console.log(`  → ${battleFill?.[1] ?? 0} rows updated`);

    console.log('Backfilling songId by songTitle match…');
    const titleFill = await ds.query(`
      UPDATE videos v
      SET "songId" = s.id
      FROM songs s
      WHERE v."songId" IS NULL
        AND v."songTitle" IS NOT NULL
        AND LOWER(TRIM(v."songTitle")) = LOWER(s.title)
    `);
    console.log(`  → ${titleFill?.[1] ?? 0} rows updated`);

    const unmatched = await ds.query(`
      SELECT id, title, "songTitle"
      FROM videos
      WHERE "songId" IS NULL
        AND "deletedAt" IS NULL
    `);
    if (unmatched.length > 0) {
      console.log(
        `  → ${unmatched.length} performances still have no song link ` +
          '(no battle, no songTitle match). Use /admin/performances to ' +
          'assign manually:',
      );
      for (const row of unmatched.slice(0, 10)) {
        console.log(`     ${row.id}  ${row.title}  (songTitle: ${row.songTitle ?? '—'})`);
      }
      if (unmatched.length > 10) {
        console.log(`     …and ${unmatched.length - 10} more`);
      }
    }

    // ─── 2. timestamp → timestamptz ────────────────────────────────
    console.log('Normalizing timestamp columns to timestamptz (treating existing values as UTC)…');

    const cols: { table: string; column: string }[] = [
      { table: 'battles', column: 'votingOpensAt' },
      { table: 'battles', column: 'votingClosesAt' },
      { table: 'battles', column: 'closedAt' },
      { table: 'videos', column: 'deletedAt' },
      // createdAt across all tables — @CreateDateColumn() defaulted to
      // `timestamp without time zone` here, which makes the read-side off
      // by the server's TZ offset. Convert each, treating existing values
      // as UTC (matching what TypeORM was writing). Run this BEFORE the
      // new code deploys so synchronize doesn't kick off an unsafe ALTER.
      { table: 'users', column: 'createdAt' },
      { table: 'songs', column: 'createdAt' },
      { table: 'videos', column: 'createdAt' },
      { table: 'battles', column: 'createdAt' },
      { table: 'votes', column: 'createdAt' },
      { table: 'notifications', column: 'createdAt' },
    ];

    for (const { table, column } of cols) {
      // Check current data type; skip if already timestamptz so the script
      // is idempotent on re-runs.
      const [{ data_type: dtype }] = await ds.query(
        `SELECT data_type FROM information_schema.columns
           WHERE table_name = $1 AND column_name = $2`,
        [table, column],
      );
      if (dtype === 'timestamp with time zone') {
        console.log(`  → ${table}.${column} already timestamptz, skipping`);
        continue;
      }
      await ds.query(
        `ALTER TABLE "${table}"
           ALTER COLUMN "${column}" TYPE timestamptz USING "${column}" AT TIME ZONE 'UTC'`,
      );
      console.log(`  → ${table}.${column} converted`);
    }

    console.log('\nDone. Phase 2A data fixes applied.');
  } finally {
    await ds.destroy();
  }
}

main().catch(async (err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
