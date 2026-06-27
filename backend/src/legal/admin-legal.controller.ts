import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { LegalService } from './legal.service';
import { SkipThrottle } from '@nestjs/throttler';

const MAX_BODY = 50 * 1024;

export class UpdateLegalPageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_BODY, {
    message: `bodyMarkdown must be at most ${MAX_BODY} characters`,
  })
  bodyMarkdown: string;
}

@ApiTags('Admin – Legal')
@ApiBearerAuth('bearer')
@SkipThrottle()
@Controller('admin/legal')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminLegalController {
  constructor(private readonly legal: LegalService) {}

  @Get('pages')
  @ApiOperation({ summary: 'List all legal pages with current-version metadata' })
  async list() {
    return this.legal.listAdmin();
  }

  @Get('pages/:slug')
  @ApiOperation({ summary: 'Get a legal page with current version + history' })
  async get(@Param('slug') slug: string) {
    return this.legal.getAdminPage(slug);
  }

  @Get('pages/:slug/versions/:versionNumber')
  @ApiOperation({ summary: 'Read-only fetch of a historical version' })
  async getVersion(
    @Param('slug') slug: string,
    @Param('versionNumber') versionNumber: string,
  ) {
    return this.legal.getAdminVersion(slug, parseInt(versionNumber, 10));
  }

  @Put('pages/:slug')
  @ApiOperation({ summary: 'Publish a new version (immutable). Becomes current.' })
  async update(
    @Param('slug') slug: string,
    @Body() body: UpdateLegalPageDto,
    @Req() req: any,
  ) {
    return this.legal.publishVersion(
      slug,
      body.title,
      body.bodyMarkdown,
      req.adminUser.id,
    );
  }
}
