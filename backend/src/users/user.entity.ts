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

  // ─── Phase 2A roles (boolean flags, not an enum — see PHASE_2A_SCHEMA.md §7) ─
  @Column({ default: false })
  isAdmin: boolean;

  @Column({ default: false })
  isSongwriter: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  // ─── Legal acceptance (A2) ──────────────────────────────────────
  // Null for users created before A2 (grandfathered). New signups
  // populate all three in a single transaction with the live
  // currentVersionId of each legal page at signup time.
  @Column({ type: 'uuid', nullable: true })
  acceptedTermsVersionId: string | null;

  @Column({ type: 'uuid', nullable: true })
  acceptedPrivacyVersionId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  legalAcceptedAt: Date | null;

  // ─── Brute-force lockout (B1) ──────────────────────────────────
  // Incremented on every failed login. Reset to 0 on a successful
  // login. When it reaches 5, lockoutUntil is set to now + 15 min.
  @Column({ default: 0 })
  failedLoginCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lockoutUntil: Date | null;
}
