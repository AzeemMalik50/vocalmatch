import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, VoiceType } from './user.entity';

export interface ProfilePatch {
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  voiceType?: VoiceType | null;
  genres?: string[];
  location?: string | null;
  instagramHandle?: string | null;
  tiktokHandle?: string | null;
  youtubeChannel?: string | null;
  websiteUrl?: string | null;
  privateProfile?: boolean;
  hideStatsUntilFirstBattle?: boolean;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async findById(id: string) {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByUsername(username: string) {
    // Case-insensitive lookup
    const user = await this.users
      .createQueryBuilder('u')
      .where('LOWER(u.username) = LOWER(:username)', { username })
      .getOne();
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  toPublic(user: User) {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      voiceType: user.voiceType,
      genres: user.genres ?? [],
      location: user.location,
      instagramHandle: user.instagramHandle,
      tiktokHandle: user.tiktokHandle,
      youtubeChannel: user.youtubeChannel,
      websiteUrl: user.websiteUrl,
      profileCompleted: user.profileCompleted,
      privateProfile: !!user.privateProfile,
      hideStatsUntilFirstBattle: !!user.hideStatsUntilFirstBattle,
      winCount: user.winCount,
      battleCount: user.battleCount,
      currentStreak: user.currentStreak,
      championTitle: user.championTitle,
      createdAt: user.createdAt,
    };
  }

  /**
   * Patch any subset of profile fields. Auto-marks profile as completed
   * once at least display name OR bio is set (one personal touch).
   */
  async updateProfile(id: string, patch: ProfilePatch) {
    const user = await this.findById(id);

    const fields: (keyof ProfilePatch)[] = [
      'displayName',
      'bio',
      'avatarUrl',
      'voiceType',
      'genres',
      'location',
      'instagramHandle',
      'tiktokHandle',
      'youtubeChannel',
      'websiteUrl',
      'privateProfile',
      'hideStatsUntilFirstBattle',
    ];

    for (const f of fields) {
      if (patch[f] !== undefined) {
        // Coerce empty strings to null for nullable text columns
        const v = patch[f];
        (user as any)[f] =
          typeof v === 'string' && v.trim() === '' ? null : v;
      }
    }

    if (user.displayName || user.bio) {
      user.profileCompleted = true;
    }

    return this.users.save(user);
  }

  async markCompleted(id: string) {
    const user = await this.findById(id);
    user.profileCompleted = true;
    return this.users.save(user);
  }
}
