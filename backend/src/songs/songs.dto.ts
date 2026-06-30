import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { SongStatus } from './song.entity';

const STATUSES: SongStatus[] = ['active', 'retired'];

export class CreateSongDto {
  @IsString() @MinLength(1) @MaxLength(200)
  title: string;

  @IsString() @MinLength(1) @MaxLength(200)
  artist: string;

  @IsOptional() @IsString() @MaxLength(2000)
  trackUrl?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  coverArtUrl?: string;
}

export class UpdateSongDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  title?: string;

  @IsOptional() @IsString() @MinLength(1) @MaxLength(200)
  artist?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  trackUrl?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  coverArtUrl?: string;

  @IsOptional() @IsIn(STATUSES)
  status?: SongStatus;
}
