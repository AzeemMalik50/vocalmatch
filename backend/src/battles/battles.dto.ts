import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { BattleStatus } from './battle.entity';

export class CreateBattleDto {
  @IsUUID() songId: string;
  @IsUUID() performanceAId: string;
  @IsUUID() performanceBId: string;

  @IsOptional() @IsString() @MaxLength(200)
  title?: string;

  /** ISO date strings. Voting opens at votingOpensAt and closes at votingClosesAt. */
  @IsOptional() @IsDateString()
  votingOpensAt?: string;

  @IsDateString()
  votingClosesAt: string;
}

export class CastVoteDto {
  @IsUUID() performanceId: string;
}

export class ResolveTieDto {
  @IsUUID() winnerPerformanceId: string;
}

export class ListBattlesQueryDto {
  @IsOptional() @IsIn(['live', 'needs_decision', 'completed', 'cancelled'])
  status?: BattleStatus;

  @IsOptional() @IsUUID()
  songId?: string;
}
