import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
} from 'typeorm';
import { Video } from '../videos/video.entity';
import { Vote } from '../votes/vote.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  username: string;

  @Column()
  passwordHash: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Video, (video) => video.uploader)
  videos: Video[];

  @OneToMany(() => Vote, (vote) => vote.user)
  votes: Vote[];
}
