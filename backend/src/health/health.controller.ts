import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

// @SkipThrottle so Railway's startup-burst probes can't trip the
// global rate limit and falsely mark the container unhealthy.
@ApiTags('health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Liveness probe — returns 200 if the process is up.' })
  check() {
    return {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
