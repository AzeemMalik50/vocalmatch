import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  ForbiddenException,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { JwtAuthGuard, OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { CloudinaryService } from '../videos/cloudinary.service';
import { VoiceType } from './user.entity';

const VOICE_TYPES: VoiceType[] = [
  'soprano',
  'mezzo_soprano',
  'alto',
  'countertenor',
  'tenor',
  'baritone',
  'bass',
  'unsure',
];

class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(80)
  displayName?: string;

  @IsOptional() @IsString() @MaxLength(280)
  bio?: string;

  @IsOptional() @IsString()
  avatarUrl?: string;

  @IsOptional() @IsIn(VOICE_TYPES)
  voiceType?: VoiceType;

  @IsOptional() @IsArray() @ArrayMaxSize(8)
  @IsString({ each: true })
  genres?: string[];

  @IsOptional() @IsString() @MaxLength(120)
  location?: string;

  @IsOptional() @IsString() @MaxLength(60)
  instagramHandle?: string;

  @IsOptional() @IsString() @MaxLength(60)
  tiktokHandle?: string;

  @IsOptional() @IsString() @MaxLength(120)
  youtubeChannel?: string;

  @IsOptional() @IsString() @MaxLength(200)
  websiteUrl?: string;

  @IsOptional() @IsBoolean()
  privateProfile?: boolean;

  @IsOptional() @IsBoolean()
  hideStatsUntilFirstBattle?: boolean;
}

@ApiTags('Users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly cloudinary: CloudinaryService,
  ) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get the signed-in user’s profile',
    description: 'Returns the full public projection including private fields the user can see about themselves.',
  })
  async me(@Req() req: any) {
    const user = await this.users.findById(req.user.userId);
    return this.users.toPublic(user);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Update the signed-in user’s profile',
    description:
      'Partial update — only the fields present in the body are written. Use for onboarding completion, profile edits, social links, voice type, and privacy toggles.',
  })
  async update(@Req() req: any, @Body() dto: UpdateProfileDto) {
    const user = await this.users.updateProfile(req.user.userId, dto);
    return this.users.toPublic(user);
  }

  @Post('me/skip-onboarding')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Mark onboarding as completed',
    description: 'Sets `onboardingCompletedAt` to now so the onboarding wizard stops appearing.',
  })
  async skipOnboarding(@Req() req: any) {
    const user = await this.users.markCompleted(req.user.userId);
    return this.users.toPublic(user);
  }

  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { avatar: { type: 'string', format: 'binary' } },
      required: ['avatar'],
    },
  })
  @ApiOperation({
    summary: 'Upload an avatar image',
    description: '5MB cap; `image/*` only. Returns the updated public profile with the new avatar URL.',
  })
  @UseInterceptors(FileInterceptor('avatar'))
  async uploadAvatar(
    @Req() req: any,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /image\/.*/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const upload = await this.cloudinary.uploadImage(file.buffer, 'avatars');
    const user = await this.users.updateProfile(req.user.userId, {
      avatarUrl: upload.secure_url,
    });
    return this.users.toPublic(user);
  }

  @Delete('me/avatar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Remove the current avatar image',
    description:
      'Clears `avatarUrl` on the caller\'s profile so the avatar falls back to the username initial across the app. Idempotent — calling on an already-empty profile is a no-op. The Cloudinary asset is left for a later sweeper job to keep this endpoint fast.',
  })
  async removeAvatar(@Req() req: any) {
    const user = await this.users.updateProfile(req.user.userId, {
      avatarUrl: null,
    });
    return this.users.toPublic(user);
  }

  @Get(':username')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Get a public profile by username',
    description:
      'Anonymous-readable. If the profile is marked private and the requester isn’t the owner, returns 403.',
  })
  async byUsername(
    @Req() req: any,
    @Param('username') username: string,
  ) {
    const user = await this.users.findByUsername(username);
    if (user.privateProfile && req.user?.userId !== user.id) {
      throw new ForbiddenException('This profile is private');
    }
    return this.users.toPublic(user);
  }
}
