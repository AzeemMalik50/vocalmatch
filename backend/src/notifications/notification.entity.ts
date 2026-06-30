import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type NotificationKind =
  | 'challenger_selected'  // Phase 2B — admin picks your challenge
  | 'challenger_rejected'  // Phase 2B — admin doesn't pick your challenge
  | 'battle_starting'      // Phase 2B — your battle goes live (admin promoted)
  | 'battle_cancelled'     // Bug #60 — admin cancels a live battle
  | 'battle_result'        // Phase 2B reserved
  | 'system';

/**
 * In-app notification. Phase 2A creates the table and read/write APIs as a
 * foundation; Phase 2B writes `challenger_selected` notifications when admin
 * picks a challenger. Email is deferred to Phase 2C — we never send an email
 * from this module.
 */
@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar' })
  kind: NotificationKind;

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  body: string;

  /** Optional deep-link path the UI can use ("/battle/abc123"). */
  @Column({ type: 'text', nullable: true })
  href: string | null;

  @Index()
  @Column({ default: false })
  read: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
