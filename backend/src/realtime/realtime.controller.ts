import {
  Controller,
  Get,
  Query,
  Req,
  Res,
  UnauthorizedException,
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
import { OptionalJwtAuthGuard } from '../auth/jwt-auth.guard';

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
// OptionalJwtAuthGuard so anonymous homepage visitors can still subscribe
// to the public `lobby` channel for battle lifecycle events. Authenticated
// callers additionally get user / battle channels as before.
@UseGuards(OptionalJwtAuthGuard)
export class RealtimeController {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly battles: BattlesService,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Open a Server-Sent Events stream for live updates',
    description:
      'Returns `text/event-stream`. Subscribes to a combination of channels based on what the caller requests:\n' +
      '• `?lobby=1` — public homepage feed of battle lifecycle events (no auth required).\n' +
      '• Authenticated callers always also get their user channel (push notifications).\n' +
      '• `?battleId=<uuid>` adds the battle channel for live vote counts, but only if the caller has voted on that battle (or is admin).\n\n' +
      'A request that resolves to zero channels returns 401. JWT travels via `?token=` because EventSource cannot set headers. Heartbeats every 25s. Frame types: `ready` (initial), `notification`, `vote`, `status`, `lifecycle`, plus SSE comment heartbeats.',
  })
  @ApiQuery({
    name: 'token',
    required: false,
    type: String,
    description: 'JWT — required for the user channel and battle subscriptions. Omit when only subscribing to the public `lobby` channel.',
  })
  @ApiQuery({
    name: 'battleId',
    required: false,
    type: String,
    description: 'Subscribe to this battle’s live vote counts. Ignored if the caller hasn’t voted (and isn’t admin).',
  })
  @ApiQuery({
    name: 'lobby',
    required: false,
    type: String,
    description: 'Pass `1` to subscribe to the public lobby channel that broadcasts battle lifecycle events (created / cancelled / closed / needs_decision). Safe for anonymous callers — carries only public fields.',
  })
  async stream(
    @Req() req: Request & {
      user?: { userId: string; isAdmin: boolean };
    },
    @Res() res: Response,
    @Query('battleId') battleId?: string,
    @Query('lobby') lobby?: string,
  ): Promise<void> {
    const wantsLobby = lobby === '1' || lobby === 'true';
    const user = req.user;
    const channels: string[] = [];

    if (user) {
      channels.push(RealtimeService.userChannel(user.userId));
      if (battleId) {
        const allowed =
          user.isAdmin ||
          (await this.battles.hasUserVoted(battleId, user.userId));
        if (allowed) {
          channels.push(RealtimeService.battleChannel(battleId));
        }
      }
    }
    if (wantsLobby) {
      channels.push(RealtimeService.lobbyChannel());
    }

    // Reject when there's nothing to subscribe to — keeps unauthenticated
    // probes from holding an empty connection open. (Anonymous callers must
    // ask for `?lobby=1`; authenticated callers always have at least the
    // user channel.)
    if (channels.length === 0) {
      throw new UnauthorizedException(
        'No subscribable channels. Provide a token, ?lobby=1, or both.',
      );
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
