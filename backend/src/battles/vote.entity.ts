import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

/**
 * One vote per user per battle. UNIQUE(battleId, userId) is the
 * single source of truth for the "vote is final" rule — the API
 * relies on the DB raising a unique-violation error to return 409,
 * matching Phase 1's reject-second-vote pattern.
 */
@Entity('votes')
@Unique('UQ_votes_battle_user', ['battleId', 'userId'])
export class Vote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  battleId: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  /** A or B side — must equal one of the two performance ids on the battle. */
  @Column({ type: 'uuid' })
  performanceId: string;

  @CreateDateColumn()
  createdAt: Date;
}
