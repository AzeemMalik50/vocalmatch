import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
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

  /**
   * Absolute voting close time. Legacy / explicit-schedule contract.
   * Callers using this take responsibility for any duration drift caused
   * by network latency between when they sample `Date.now()` and when
   * the backend samples `opensAt`. Prefer `hours` for new call sites.
   */
  @IsOptional() @IsDateString()
  votingClosesAt?: string;

  /**
   * Voting window duration in hours, 1–720 (30 days max). When set, the
   * backend derives BOTH `opensAt` and `closesAt` from a single clock
   * reading at save time so the actual window is exactly `hours` — no
   * drift from client/server latency. Exactly one of `hours` or
   * `votingClosesAt` must be supplied (service enforces).
   *
   * Spec: every Centerstage Song competition runs for 30 consecutive
   * days (720 hours). The cap allows the standard 30-day competition;
   * shorter windows are permitted for tie-break rematches and admin
   * exception cases.
   */
  @IsOptional() @IsInt() @Min(1) @Max(24 * 30)
  hours?: number;
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
