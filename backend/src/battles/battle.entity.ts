import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type BattleStatus =
  | 'live'
  | 'needs_decision'
  | 'completed'
  | 'cancelled';

/**
 * 1v1 battle between two performances of the same Centerstage Song.
 *
 * State machine (see PHASE_2A_SCHEMA.md §8):
 *   live ──(timer expires, clear winner)──▶ completed
 *   live ──(timer expires, tie)─────────▶ needs_decision ──(admin)──▶ completed
 *   live ──(admin cancels)──────────────▶ cancelled
 *
 * Vote counts are denormalized (`voteCountA`, `voteCountB`) so the live page
 * never has to COUNT(*) on every load. The authoritative tally lives in the
 * `votes` table and counts are kept in sync inside a transaction at vote time.
 *
 * Battle history = `SELECT * FROM battles WHERE status = 'completed'`. There
 * is no separate history table.
 *
 * The "only one live battle per song" invariant is enforced by a partial
 * unique index, declared in the BattlesModule init via raw SQL on Postgres.
 */
@Entity('battles')
export class Battle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  songId: string;

  @Column({ type: 'text', nullable: true })
  title: string | null;

  @Column({ type: 'uuid' })
  performanceAId: string;

  @Column({ type: 'uuid' })
  performanceBId: string;

  @Column({ type: 'timestamp' })
  votingOpensAt: Date;

  @Index()
  @Column({ type: 'timestamp' })
  votingClosesAt: Date;

  @Index()
  @Column({ type: 'varchar', default: 'live' })
  status: BattleStatus;

  // ─── Set on close ───────────────────────────────────────────────
  @Column({ type: 'uuid', nullable: true })
  winnerPerformanceId: string | null;

  @Column({ type: 'uuid', nullable: true })
  winnerUserId: string | null;

  // ─── Denormalized vote counts (source: votes table) ─────────────
  @Column({ default: 0 })
  voteCountA: number;

  @Column({ default: 0 })
  voteCountB: number;

  // ─── Audit ──────────────────────────────────────────────────────
  @Column({ type: 'uuid' })
  createdByAdminId: string;

  @Column({ type: 'uuid', nullable: true })
  tieResolvedByAdminId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  closedAt: Date | null;
}
