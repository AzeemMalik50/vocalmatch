import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';
// NOTE: deliberately not importing Song/Battle here to avoid a circular type
// graph at compile time. Phase 2A links via songId column only; the
// FK is declared on the Song side and via SQL relations.

export type VideoCategory = 'solo' | 'battle_entry' | 'challenge_entry';
export type VideoVisibility = 'public' | 'unlisted' | 'private';

/**
 * A user-uploaded performance.
 *
 * `category` distinguishes how the video is used in the system:
 *   - solo:            Phase 1 — a standalone upload on the feed
 *   - battle_entry:    Phase 2 — one half of a battle pairing
 *   - challenge_entry: Phase 2 — submitted via Red Phone, awaiting selection
 *
 * `songTitle` is required by Phase 2 (battles must be over the same song).
 * Phase 1 keeps it optional but encouraged.
 */
@Entity('videos')
export class Video {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ nullable: true, type: 'text' })
  description: string | null;

  @Index()
  @Column({ nullable: true })
  songTitle: string | null;

  @Column()
  url: string;

  @Column({ nullable: true })
  thumbnailUrl: string | null;

  @Column({ nullable: true, type: 'integer' })
  durationSeconds: number | null;

  @Column()
  cloudinaryPublicId: string;

  @Index()
  @Column({ type: 'varchar', default: 'solo' })
  category: VideoCategory;

  @Index()
  @Column({ type: 'varchar', default: 'public' })
  visibility: VideoVisibility;

  @Column({ type: 'simple-array', default: '' })
  tags: string[];

  @ManyToOne(() => User, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'uploaderId' })
  uploader: User;

  @Index()
  @Column()
  uploaderId: string;

  // Light per-video stats — counted at write time so we never compute on read
  @Column({ default: 0 })
  viewCount: number;

  // ─── Phase 2A: Centerstage Song link ────────────────────────────
  // Optional. Required when this video competes in a battle.
  @Index()
  @Column({ nullable: true, type: 'uuid' })
  songId: string | null;

  // ─── Phase 2A: soft-delete (Vincent's decision D) ───────────────
  // Once a performance has been used in a battle, hard-delete is blocked.
  // Setting deletedAt hides the video from feed/profile while leaving the
  // battle history intact.
  @Index()
  @Column({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
