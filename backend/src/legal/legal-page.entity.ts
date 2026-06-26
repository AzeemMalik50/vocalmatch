import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('legal_pages')
export class LegalPage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ length: 64 })
  slug: string;

  @Column({ length: 200 })
  title: string;

  // Points at the live LegalPageVersion. Nullable so we can create the page
  // row first, then create v1, then update this pointer in a single
  // transaction. After seeding it's always set.
  @Column({ type: 'uuid', nullable: true })
  currentVersionId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
