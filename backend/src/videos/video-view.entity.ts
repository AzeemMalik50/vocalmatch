import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/**
 * One row per unique (video, viewer-user) pair. The UNIQUE constraint is the
 * source of truth for "count each user once" — VideosService.recordView()
 * inserts here, catches the unique-violation, and only bumps videos.viewCount
 * on first insert.
 *
 * Anonymous (unauthenticated) views are not recorded — they have no userId,
 * so dedupe is impossible without an IP/cookie story. Phase 2A treats
 * "viewCount" as "unique signed-in viewers, excluding the uploader".
 */
@Entity('video_views')
@Unique('UQ_video_views_video_user', ['videoId', 'userId'])
export class VideoView {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  videoId: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
