import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Video } from './video.entity';
import { Vote } from '../votes/vote.entity';
import { CloudinaryService } from './cloudinary.service';

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video) private readonly videos: Repository<Video>,
    @InjectRepository(Vote) private readonly votes: Repository<Vote>,
    private readonly cloudinary: CloudinaryService,
  ) {}

  async create(params: {
    title: string;
    description?: string;
    uploaderId: string;
    fileBuffer: Buffer;
  }) {
    const upload = await this.cloudinary.uploadVideo(params.fileBuffer);

    const video = this.videos.create({
      title: params.title,
      description: params.description,
      url: upload.secure_url,
      thumbnailUrl: upload.eager?.[0]?.secure_url ?? null,
      cloudinaryPublicId: upload.public_id,
      uploaderId: params.uploaderId,
    });

    return this.videos.save(video);
  }

  async findAll(currentUserId?: string) {
    const videos = await this.videos.find({
      order: { createdAt: 'DESC' },
    });

    // Get vote counts + whether current user voted, in one shot
    const result = await Promise.all(
      videos.map(async (v) => {
        const voteCount = await this.votes.count({ where: { videoId: v.id } });
        let hasVoted = false;
        if (currentUserId) {
          hasVoted = !!(await this.votes.findOne({
            where: { videoId: v.id, userId: currentUserId },
          }));
        }
        return {
          id: v.id,
          title: v.title,
          description: v.description,
          url: v.url,
          thumbnailUrl: v.thumbnailUrl,
          uploader: { id: v.uploader.id, username: v.uploader.username },
          voteCount,
          hasVoted,
          createdAt: v.createdAt,
        };
      }),
    );
    return result;
  }

  async findOne(id: string) {
    const v = await this.videos.findOne({ where: { id } });
    if (!v) throw new NotFoundException('Video not found');
    return v;
  }
}
