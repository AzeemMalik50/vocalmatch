import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type VoiceType =
  | 'soprano'
  | 'mezzo_soprano'
  | 'alto'
  | 'countertenor'
  | 'tenor'
  | 'baritone'
  | 'bass'
  | 'unsure';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  email: string;

  @Index({ unique: true })
  @Column()
  username: string;

  @Column()
  passwordHash: string;

  // ─── Profile basics ─────────────────────────────────────────────
  @Column({ nullable: true, type: 'text' })
  displayName: string | null;

  @Column({ nullable: true, type: 'text' })
  bio: string | null;

  @Column({ nullable: true })
  avatarUrl: string | null;

  // ─── Singer-specific profile ────────────────────────────────────
  @Column({ nullable: true, type: 'varchar' })
  voiceType: VoiceType | null;

  // Postgres + SQLite both support simple-array
  @Column({ type: 'simple-array', default: '' })
  genres: string[];

  @Column({ nullable: true })
  location: string | null;

  // ─── Social links ───────────────────────────────────────────────
  @Column({ nullable: true })
  instagramHandle: string | null;

  @Column({ nullable: true })
  tiktokHandle: string | null;

  @Column({ nullable: true })
  youtubeChannel: string | null;

  @Column({ nullable: true })
  websiteUrl: string | null;

  // ─── Onboarding state ───────────────────────────────────────────
  @Column({ default: false })
  profileCompleted: boolean;

  // ─── Privacy ────────────────────────────────────────────────────
  @Column({ default: false })
  privateProfile: boolean;

  @Column({ default: false })
  hideStatsUntilFirstBattle: boolean;

  // Bumped to invalidate every existing JWT for this user
  @Column({ default: 0 })
  tokenVersion: number;

  // ─── Main Stage fields ──────────────────────────────────────────
  @Column({ default: 0 })
  winCount: number;

  @Column({ default: 0 })
  battleCount: number;

  @Column({ default: 0 })
  currentStreak: number;

  @Column({ nullable: true, type: 'text' })
  championTitle: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
