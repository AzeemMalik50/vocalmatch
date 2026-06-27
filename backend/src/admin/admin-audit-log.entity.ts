// backend/src/admin/admin-audit-log.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('admin_audit_logs')
// Drives "what did this admin do?" — recent-first per admin
@Index(['adminUserId', 'at'])
// Drives "what happened to this object?" — recent-first per (type, id)
@Index(['targetType', 'targetId', 'at'])
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  adminUserId: string;

  @Column({ length: 64 })
  action: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  targetType: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  targetId: string | null;

  // jsonb on Postgres; simple-json fallback on SQLite. The entity uses
  // `simple-json` so it works both ways; the column type ends up as
  // jsonb in prod automatically.
  @Column({ type: 'simple-json', nullable: true })
  payloadSnapshot: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  at: Date;
}
