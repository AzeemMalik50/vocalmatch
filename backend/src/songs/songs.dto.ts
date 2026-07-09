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

// Song title / artist caps — tightened from 200 → 80 to keep the UI
// consistent across every render surface (battle detail heading, admin
// list rows, Crown At Risk, dethroned panel, etc.). 80 chars comfortably
// fits every real-world song title and typical band name while blocking
// pathological repeated-word test data that was breaking mobile layouts
// even after the app-wide line-clamp / break-words additions.
const SONG_TITLE_MAX = 80;
const SONG_ARTIST_MAX = 80;

export class CreateSongDto {
  @trim() @IsString() @MinLength(1) @MaxLength(SONG_TITLE_MAX)
  title: string;

  @trim() @IsString() @MinLength(1) @MaxLength(SONG_ARTIST_MAX)
  artist: string;

  @trim() @IsOptional() @IsString() @MaxLength(2000)
  trackUrl?: string;

  @trim() @IsOptional() @IsString() @MaxLength(2000)
  coverArtUrl?: string;
}

export class UpdateSongDto {
  @trim() @IsOptional() @IsString() @MinLength(1) @MaxLength(SONG_TITLE_MAX)
  title?: string;

  @trim() @IsOptional() @IsString() @MinLength(1) @MaxLength(SONG_ARTIST_MAX)
  artist?: string;

  @trim() @IsOptional() @IsString() @MaxLength(2000)
  trackUrl?: string;

  @trim() @IsOptional() @IsString() @MaxLength(2000)
  coverArtUrl?: string;

  @IsOptional() @IsIn(STATUSES)
  status?: SongStatus;
}
