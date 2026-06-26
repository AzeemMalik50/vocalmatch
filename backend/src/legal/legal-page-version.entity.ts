import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

// Versions are immutable history rows — no @UpdateDateColumn by design.
// Edits create a new version, never mutate an old one.
@Entity('legal_page_versions')
@Unique('uq_legal_page_versions_page_version', ['pageId', 'versionNumber'])
export class LegalPageVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  pageId: string;

  @Column('int')
  versionNumber: number;

  @Column('text')
  bodyMarkdown: string;

  @CreateDateColumn({ type: 'timestamptz' })
  publishedAt: Date;

  // Null when seeded by the system; set to the admin's user.id otherwise.
  @Column({ type: 'uuid', nullable: true })
  publishedById: string | null;
}
