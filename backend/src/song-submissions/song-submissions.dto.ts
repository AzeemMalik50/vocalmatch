import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { SongSubmissionStatus } from './song-submission.entity';

const trim = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

const STATUSES: SongSubmissionStatus[] = ['pending', 'approved', 'rejected'];

export class CreateSongSubmissionDto {
  @trim() @IsString() @MinLength(1) @MaxLength(120)
  title: string;

  @trim() @IsString() @MinLength(1) @MaxLength(120)
  songwriter: string;

  @trim() @IsString() @MinLength(1) @MaxLength(10_000)
  lyrics: string;

  @trim() @IsString() @MinLength(1) @MaxLength(120)
  contactName: string;

  @trim() @IsEmail() @MaxLength(254)
  contactEmail: string;

  @trim() @IsOptional() @IsString() @MaxLength(2000)
  notes?: string;
}

export class ReviewSongSubmissionDto {
  @IsIn(STATUSES)
  status: SongSubmissionStatus;

  @trim() @IsOptional() @IsString() @MaxLength(2000)
  reviewNotes?: string;
}
