import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type ChallengeStatus = 'pending' | 'selected' | 'rejected';

/**
 * Red Phone challenge submission. A user uploads a performance of a
 * Centerstage Song to challenge the current champion. Admin picks one
 * from the queue and promotes it into the next battle.
 *
 * Invariant: at most one row with status IN ('pending', 'selected') per
 * song. Enforced by a partial unique index on Postgres
 * (`one_active_challenger_per_song`, installed in BattlesModule.onModuleInit)
 * and a defensive app-layer check on SQLite.
 *
 * Lifecycle:
 *   pending  ──(admin selects)──▶ selected ──(battle created)──▶ used (still 'selected')
 *   pending  ──(admin rejects)──▶ rejected
 *
 * Once `selected`, the row stays selected even after the battle is created —
 * `decidedAt` and `decidedByAdminId` record the action, and a later admin
 * audit can still trace which submission produced which battle.
 */
@Entity('challenge_submissions')
export class ChallengeSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  songId: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  /** The performance video the user uploaded as their challenge entry. */
  @Index()
  @Column({ type: 'uuid' })
  videoId: string;

  @Index()
  @Column({ type: 'varchar', default: 'pending' })
  status: ChallengeStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  /** When admin selected or rejected. NULL while pending. */
  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  decidedByAdminId: string | null;

  /** Set once the battle has been created from this challenge. */
  @Column({ type: 'uuid', nullable: true })
  resultingBattleId: string | null;
}
