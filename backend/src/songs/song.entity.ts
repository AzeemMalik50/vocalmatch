import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type SongStatus = 'active' | 'retired';

/**
 * Centerstage Song — a song the platform runs battles over.
 *
 * In Phase 2A admins create these directly. Phase 2C will add a
 * `song_submissions` queue where songwriters propose songs; admin
 * approval there promotes a submission into a Song row here.
 *
 * Champion lookup is denormalized for fast reads — `currentChampion*`
 * fields are written on each battle close. The full champion lineage
 * is derivable from `battles WHERE songId = ? AND status = 'completed'`.
 */
@Entity('songs')
export class Song {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  title: string;

  @Column()
  artist: string;

  @Column({ type: 'text', nullable: true })
  trackUrl: string | null;

  @Column({ type: 'text', nullable: true })
  coverArtUrl: string | null;

  @Index()
  @Column({ type: 'varchar', default: 'active' })
  status: SongStatus;

  // ─── Defending Champion (denormalized for fast reads) ───────────
  @Column({ type: 'uuid', nullable: true })
  currentChampionUserId: string | null;

  @Column({ type: 'uuid', nullable: true })
  currentChampionPerformanceId: string | null;

  @Column({ default: 0 })
  currentChampionStreak: number;

  // ─── Audit ──────────────────────────────────────────────────────
  @Column({ type: 'uuid', nullable: true })
  submittedBySongwriterId: string | null;

  @Column({ type: 'uuid' })
  createdByAdminId: string;

  @CreateDateColumn()
  createdAt: Date;
}
