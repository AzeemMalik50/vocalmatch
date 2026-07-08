import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { SongStatus } from './song.entity';

const STATUSES: SongStatus[] = ['active', 'retired'];

// Trim strings before length validation runs so `" "` (whitespace-only)
// fails `@MinLength(1)` at the API layer instead of squeaking through
// with the raw untrimmed value. Guards against any client that skips
// the frontend's per-field validation (curl, alternate admin tooling).
const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

export class CreateSongDto {
  @trim() @IsString() @MinLength(1) @MaxLength(200)
  title: string;

  @trim() @IsString() @MinLength(1) @MaxLength(200)
  artist: string;

  @trim() @IsOptional() @IsString() @MaxLength(2000)
  trackUrl?: string;

  @trim() @IsOptional() @IsString() @MaxLength(2000)
  coverArtUrl?: string;
}

export class UpdateSongDto {
  @trim() @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  title?: string;

  @trim() @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  artist?: string;

  @trim() @IsOptional() @IsString() @MaxLength(2000)
  trackUrl?: string;

  @trim() @IsOptional() @IsString() @MaxLength(2000)
  coverArtUrl?: string;

  @IsOptional() @IsIn(STATUSES)
  status?: SongStatus;
}
