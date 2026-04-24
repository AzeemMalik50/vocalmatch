import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  JoinColumn,
} from 'typeorm';
import { User } from '../auth/user.entity';
import { Vote } from '../votes/vote.entity';

@Entity('videos')
export class Video {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column()
  url: string; // Cloudinary secure_url

  @Column({ nullable: true })
  thumbnailUrl: string;

  @Column()
  cloudinaryPublicId: string;

  @ManyToOne(() => User, (user) => user.videos, { onDelete: 'CASCADE', eager: true })
  @JoinColumn({ name: 'uploaderId' })
  uploader: User;

  @Column()
  uploaderId: string;

  @OneToMany(() => Vote, (vote) => vote.video)
  votes: Vote[];

  @CreateDateColumn()
  createdAt: Date;
}
