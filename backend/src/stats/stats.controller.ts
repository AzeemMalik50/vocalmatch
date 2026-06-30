import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PublicStats, StatsService } from './stats.service';

@ApiTags('Stats')
@Controller('stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get()
  @ApiOperation({
    summary: 'Public homepage stats',
    description:
      'Anonymous-readable aggregates: total votes cast, total battles held, distinct challengers (users with an active uploaded performance), and voices raised (distinct users who have voted).',
  })
  async get(): Promise<PublicStats> {
    return this.stats.getPublicStats();
  }
}
