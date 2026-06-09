import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Song } from '../songs/song.entity';
import { SongRisk, SongsService } from '../songs/songs.service';
import { Vote } from '../battles/vote.entity';
import { BattlesService } from '../battles/battles.service';
import { User } from './user.entity';

export interface AtRiskCrownDto {
  mode: 'champion' | 'voter';
  song: ReturnType<SongsService['toPublic']>;
  champion: { username: string; avatarUrl: string | null } | null;
  titleDefenses: number;
  risk: SongRisk;
}

export type PersonalDethronementDto = Awaited<
  ReturnType<BattlesService['findRecentDethronements']>
>[number] & {
  mode: 'champion' | 'voter';
  yourRole: 'former-champion' | 'voted-for-loser';
};

@Injectable()
export class UserStakesService {
  constructor(
    @InjectRepository(Song) private readonly songs: Repository<Song>,
    @InjectRepository(Vote) private readonly votes: Repository<Vote>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly songsService: SongsService,
    private readonly battlesService: BattlesService,
  ) {}

  async findMyAtRiskCrowns(userId: string): Promise<AtRiskCrownDto[]> {
    const owned = await this.songs.find({
      where: { currentChampionUserId: userId, status: 'active' as any },
    });

    if (owned.length > 0) {
      const users = await this.users.find({ where: { id: In([userId]) } });
      const me = users.find((u) => u.id === userId);
      const champion = me
        ? { username: me.username, avatarUrl: me.avatarUrl }
        : null;

      const items: AtRiskCrownDto[] = [];
      for (const s of owned) {
        const risk = await this.songsService.computeRisk(s.id);
        items.push({
          mode: 'champion',
          song: this.songsService.toPublic(s),
          champion,
          titleDefenses: Math.max(0, (s.currentChampionStreak ?? 0) - 1),
          risk,
        });
      }
      items.sort((a, b) => a.risk.survivalChance - b.risk.survivalChance);
      return items.slice(0, 3);
    }

    // Voter fallback: distinct songIds the user has voted in.
    const distinctSongs = await this.votes
      .createQueryBuilder('v')
      .select('DISTINCT b.songId', 'songId')
      .innerJoin('battles', 'b', 'b.id = v.battleId')
      .where('v.userId = :userId', { userId })
      .getRawMany<{ songId: string }>();

    if (distinctSongs.length === 0) return [];

    const items: AtRiskCrownDto[] = [];
    const championUserIds = new Set<string>();

    for (const { songId } of distinctSongs) {
      const song = await this.songs.findOne({ where: { id: songId } });
      if (!song || !song.currentChampionUserId) continue;
      const risk = await this.songsService.computeRisk(song.id);
      if (risk.riskLevel !== 'HIGH' && risk.riskLevel !== 'CRITICAL') continue;
      championUserIds.add(song.currentChampionUserId);
      items.push({
        mode: 'voter',
        song: this.songsService.toPublic(song),
        champion: null,
        titleDefenses: Math.max(0, (song.currentChampionStreak ?? 0) - 1),
        risk,
      });
    }

    if (items.length > 0 && championUserIds.size > 0) {
      const championUsers = await this.users.find({
        where: { id: In([...championUserIds]) },
      });
      const championMap = new Map(
        championUsers.map((u) => [
          u.id,
          { username: u.username, avatarUrl: u.avatarUrl },
        ]),
      );
      for (const item of items) {
        const champId = item.song.currentChampionUserId;
        if (champId) item.champion = championMap.get(champId) ?? null;
      }
    }

    items.sort((a, b) => a.risk.survivalChance - b.risk.survivalChance);
    return items.slice(0, 3);
  }

  async findMyRecentDethronements(
    userId: string,
  ): Promise<PersonalDethronementDto[]> {
    // Champion mode: dethronements where the *previous* winner was the caller.
    const championLosses = await this.battlesService.findRecentDethronements(
      3,
      ({ previous, current }) =>
        previous.winnerUserId === userId && current.winnerUserId !== userId,
    );

    if (championLosses.length > 0) {
      return championLosses.map((d) => ({
        ...d,
        mode: 'champion' as const,
        yourRole: 'former-champion' as const,
      }));
    }

    // Voter fallback: site-wide recent dethronements, filtered to those
    // where the caller has a vote row on the LOSER's performanceId.
    const recent = await this.battlesService.findRecentDethronements(10);
    if (recent.length === 0) return [];

    const battleIds = recent.map((d) => d.battleId);
    const myVotes = await this.votes.find({
      where: { userId, battleId: In(battleIds) },
    });
    if (myVotes.length === 0) return [];

    const voteByBattle = new Map(myVotes.map((v) => [v.battleId, v]));

    const losing = recent.filter((d) => {
      const myVote = voteByBattle.get(d.battleId);
      if (!myVote) return false;
      return myVote.performanceId === d.loserPerformanceId;
    });

    return losing.slice(0, 3).map((d) => ({
      ...d,
      mode: 'voter' as const,
      yourRole: 'voted-for-loser' as const,
    }));
  }
}
