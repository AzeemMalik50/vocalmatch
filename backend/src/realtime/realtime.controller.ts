import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { RealtimeService } from './realtime.service';
import { BattlesService } from '../battles/battles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * Server-Sent Events endpoint.
 *
 *   GET /api/stream?token=<jwt>&battleId=<uuid>
 *
 * Auth is handled by JwtAuthGuard — the same guard that protects every
 * other authenticated route. JwtStrategy reads the token from either the
 * Authorization header (REST clients) or a ?token= query parameter
 * (EventSource clients), so the SSE controller doesn't need its own
 * verification logic.
 *
 * Always subscribes to the requester's user channel; optionally also
 * subscribes to a battle channel when the requester has already voted on
 * that battle (so we respect the vote-gating rule the REST endpoint
 * enforces — a not-yet-voter doesn't get live counts streamed). Admins
 * bypass that gate, mirroring GET /battles/:id.
 */
@ApiTags('Realtime (SSE)')
@Controller('stream')
@UseGuards(JwtAuthGuard)
export class RealtimeController {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly battles: BattlesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Open a Server-Sent Events stream for live updates',
    description:
      'Returns `text/event-stream`. Always subscribes to the caller’s user channel (push notifications). When `battleId` is supplied and the caller has already voted on that battle (or is admin), also subscribes to the battle channel for live vote counts. Heartbeats every 25s. The JWT is passed via `?token=` because EventSource cannot set headers. Frame types: `ready` (initial), `notification`, `vote`, `status`, plus SSE comment heartbeats.',
  })
  @ApiQuery({
    name: 'token',
    required: true,
    type: String,
    description: 'JWT — same value as the `Authorization: Bearer …` token, supplied in the URL because EventSource can’t set headers.',
  })
  @ApiQuery({
    name: 'battleId',
    required: false,
    type: String,
    description: 'Subscribe to this battle’s live vote counts. Ignored if the caller hasn’t voted (and isn’t admin).',
  })
  async stream(
    @Req() req: Request & { user: { userId: string; isAdmin: boolean } },
    @Res() res: Response,
    @Query('battleId') battleId?: string,
  ): Promise<void> {
    const { userId, isAdmin } = req.user;

    const channels = [RealtimeService.userChannel(userId)];
    if (battleId) {
      const allowed =
        isAdmin || (await this.battles.hasUserVoted(battleId, userId));
      if (allowed) {
        channels.push(RealtimeService.battleChannel(battleId));
      }
    }

    // SSE headers. `X-Accel-Buffering: no` keeps nginx/Railway proxies from
    // buffering the stream and breaking real-time delivery.
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    // Initial frame so the client knows the connection is alive.
    res.write(`event: ready\ndata: ${JSON.stringify({ channels })}\n\n`);

    const unsubscribe = this.realtime.subscribe(channels, res);

    // Heartbeat every 25s — well under the typical 60s idle proxy timeout —
    // so the connection isn't dropped during a quiet stretch.
    const heartbeat = setInterval(() => {
      try {
        res.write(`: ping\n\n`);
      } catch {
        // ignore; close handler will clean up
      }
    }, 25_000);

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
    };
    req.on('close', cleanup);
    req.on('aborted', cleanup);
  }
}
