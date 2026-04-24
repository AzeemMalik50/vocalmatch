import {
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  Column,
  CreateDateColumn,
  Unique,
  JoinColumn,
} from 'typeorm';
import { User } from '../auth/user.entity';
import { Video } from '../videos/video.entity';

@Entity('votes')
@Unique('UQ_user_video_vote', ['userId', 'videoId']) // <-- one vote per user per video
export class Vote {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, (user) => user.votes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @ManyToOne(() => Video, (video) => video.votes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'videoId' })
  video: Video;

  @Column()
  videoId: string;

  @CreateDateColumn()
  createdAt: Date;
}
