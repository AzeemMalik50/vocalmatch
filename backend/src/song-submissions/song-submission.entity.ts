import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type SongSubmissionStatus = 'pending' | 'approved' | 'rejected';

/**
 * Public songwriter submissions ("YOUR SONG COULD BE NEXT" on the
 * homepage). Anyone — logged in or not — can propose a song. Admins
 * review the queue and either approve (which is a purely editorial
 * signal — actual Song creation still happens through the admin flow
 * in SongsModule) or reject.
 *
 * Kept as its own table so we don't pollute the Songs catalog with
 * unvetted user-submitted rows.
 */
@Entity('song_submissions')
export class SongSubmission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column()
  songwriter: string;

  @Column({ type: 'text' })
  lyrics: string;

  @Column()
  contactName: string;

  @Column()
  contactEmail: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Index()
  @Column({ type: 'varchar', default: 'pending' })
  status: SongSubmissionStatus;

  @Column({ type: 'uuid', nullable: true })
  reviewedByAdminId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  reviewNotes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
