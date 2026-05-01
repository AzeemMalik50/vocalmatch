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

  @CreateDateColumn()
  createdAt: Date;
}
