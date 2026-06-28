import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { LegalService } from './legal.service';

@ApiTags('Legal')
@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Get('pages')
  @ApiOperation({ summary: 'List published legal pages (slug + title)' })
  async list() {
    return this.legal.listPublic();
  }

  @Get('pages/:slug')
  @ApiOperation({ summary: 'Get the current version of a legal page' })
  async get(@Param('slug') slug: string) {
    return this.legal.getPublicPage(slug);
  }
}
