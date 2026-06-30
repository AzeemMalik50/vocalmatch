'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  api,
  BattleSummaryDto,
  SongDto,
  VideoDto,
} from '@/lib/api';
import { useLobby } from '@/lib/useLobby';
import CountdownTimer from './CountdownTimer';
import { BattleCardGridSkeleton } from './Loaders';

type State =
  | { kind: 'loading' }
  | { kind: 'no-battles' }
  | {
      kind: 'between';
      lastBattle: BattleSummaryDto;
      lastSong: SongDto | null;
      winnerVideo: VideoDto | null;
    }
  | { kind: 'live'; battles: BattleSummaryDto[]; songs: Record<string, SongDto> };

/**
 * The single section that owns the "what's the system doing right now?"
 * narrative on the homepage. Renders one of three states:
 *
 *   - **live**       at least one battle is accepting votes → show grid of
 *                    live battles with countdowns
 *   - **between**    no live battles but at least one has completed →
 *                    show "Between matchups" with the current champion
 *   - **no-battles** the system has never run a battle → show the
 *                    "First Battle Coming Soon" teaser (Phase 1 fallback)
 *
 * Renders nothing while the initial state resolution is in flight (the rest
 * of the homepage already provides plenty of content above).
 */
export default function HomeBattleStatus() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const refetch = useCallback(async () => {
    try {
      const [live, completed, needsDecision] = await Promise.all([
        api.listBattles({ status: 'live' }),
        api.listBattles({ status: 'completed' }),
        api.listBattles({ status: 'needs_decision' }),
      ]);

      if (live.items.length > 0) {
        const songIds = Array.from(new Set(live.items.map((b) => b.songId)));
        const songs: Record<string, SongDto> = {};
        await Promise.all(
          songIds.map(async (id) => {
            try {
              songs[id] = await api.getSong(id);
            } catch {
              // missing song — we'll just render with the battle title
            }
          }),
        );
        setState({ kind: 'live', battles: live.items, songs });
        return;
      }

      // "Between matchups" covers both completed history and tied battles
      // awaiting admin decision — neither is voteable, so the viewer sees
      // a quiet stage either way.
      const offline = [...completed.items, ...needsDecision.items];
      if (offline.length > 0) {
        const sorted = offline.sort((a, b) => {
          const aT = new Date(a.closedAt ?? a.createdAt).getTime();
          const bT = new Date(b.closedAt ?? b.createdAt).getTime();
          return bT - aT;
        });
        const lastBattle = sorted[0];
        const [lastSong, winnerVideo] = await Promise.all([
          lastBattle.songId
            ? api.getSong(lastBattle.songId).catch(() => null)
            : Promise.resolve(null),
          lastBattle.winnerPerformanceId
            ? api.getVideo(lastBattle.winnerPerformanceId).catch(() => null)
            : Promise.resolve(null),
        ]);
        setState({ kind: 'between', lastBattle, lastSong, winnerVideo });
        return;
      }

      setState({ kind: 'no-battles' });
    } catch {
      // On hard failure, fall through to the safe Phase-1-style teaser
      setState({ kind: 'no-battles' });
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Bug #17 — admin cancels / scheduler-driven closes / new battles being
  // created all need to reflect on the homepage immediately, including for
  // anonymous viewers. Subscribe to the public `lobby` SSE channel and
  // refetch the whole section on every lifecycle event. One stream covers
  // all live battles AND the "between matchups" → "live" transition when
  // a new battle is created, with no auth required.
  useLobby(() => {
    void refetch();
  });

  // Re-fetch when the user comes back to the tab — covers all the
  // status changes the SSE listener might have missed (e.g. anonymous
  // viewers who can't open EventSource against the SSE channel).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refetch]);

  if (state.kind === 'loading') {
    // Hold the layout open with a skeleton grid so the page doesn't shift
    // when the battle data resolves.
    return (
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-12 border-b border-stage-700/40">
        <div className="mb-6 space-y-2">
          <div className="h-3 w-16 skeleton rounded" />
          <div className="h-8 w-48 skeleton rounded" />
        </div>
        <BattleCardGridSkeleton count={3} />
      </section>
    );
  }

  if (state.kind === 'live') {
    return <LiveBattles battles={state.battles} songs={state.songs} />;
  }

  if (state.kind === 'between') {
    return (
      <BetweenMatchups
        lastBattle={state.lastBattle}
        lastSong={state.lastSong}
        winnerVideo={state.winnerVideo}
      />
    );
  }

  return <FirstBattleComingSoon />;
}

// ─── State: live ───────────────────────────────────────────────────

function LiveBattles({
  battles,
  songs,
}: {
  battles: BattleSummaryDto[];
  songs: Record<string, SongDto>;
}) {
  return (
    <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-12 border-b border-stage-700/40">
      <div className="flex items-end justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-spotlight font-bold mb-2">
            Live now
          </p>
          <h2 className="font-display text-3xl md:text-4xl font-bold">
            Open battles
          </h2>
        </div>
        <p className="hidden sm:block text-sm text-haze tabular-nums">
          {battles.length} {battles.length === 1 ? 'battle' : 'battles'} accepting votes
        </p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {battles.map((b) => (
          <LiveBattleCard key={b.id} battle={b} song={songs[b.songId]} />
        ))}
      </div>
    </section>
  );
}

function LiveBattleCard({
  battle,
  song,
}: {
  battle: BattleSummaryDto;
  song?: SongDto;
}) {
  return (
    <Link
      href={`/battle/${battle.id}`}
      className="group block bg-stage-900 border border-stage-700/60 rounded-xl p-5 hover:border-spotlight/50 transition-colors"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-spotlight opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-spotlight" />
        </span>
        <span className="text-[10px] uppercase tracking-widest font-bold text-spotlight">
          Live
        </span>
      </div>
      <h3 className="font-display font-bold text-xl mb-1 leading-tight group-hover:text-spotlight transition-colors">
        {battle.title || (song ? song.title : 'A VocalMatch battle')}
      </h3>
      {song && (
        <p className="text-sm text-haze/80 mb-4">
          {song.title}
          {song.artist && <span className="text-haze/60"> · {song.artist}</span>}
        </p>
      )}
      <div className="flex items-end justify-between pt-4 border-t border-stage-700/60">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-haze/60 font-bold mb-1">
            Closes in
          </p>
          <CountdownTimer endsAt={battle.votingClosesAt} size="compact" />
        </div>
        <span className="text-xs text-spotlight font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
          Vote →
        </span>
      </div>
    </Link>
  );
}

// ─── State: between matchups ───────────────────────────────────────

function BetweenMatchups({
  lastBattle,
  lastSong,
  winnerVideo,
}: {
  lastBattle: BattleSummaryDto;
  lastSong: SongDto | null;
  winnerVideo: VideoDto | null;
}) {
  const awaitingDecision = lastBattle.status === 'needs_decision';

  return (
    <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-12 border-b border-stage-700/40">
      <div className="grid md:grid-cols-12 gap-6 items-center">
        <div className="md:col-span-7">
          <p className="text-xs uppercase tracking-[0.3em] text-gold font-bold mb-2">
            {awaitingDecision ? 'Awaiting result' : 'Between matchups'}
          </p>
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-3 leading-tight">
            {awaitingDecision
              ? 'The last battle ended in a tie.'
              : 'The stage is quiet — for now.'}
          </h2>
          <p className="text-haze max-w-xl mb-4">
            {awaitingDecision
              ? 'Admin is reviewing — the winner will be announced shortly. The next battle drops once a champion is crowned.'
              : 'The last battle has wrapped. The next one drops as soon as the admin pairs the next contender. Sign up so you don’t miss the opening vote.'}
          </p>
          <Link
            href={`/battle/${lastBattle.id}`}
            className="inline-flex items-center gap-2 text-sm text-spotlight font-bold hover:opacity-90"
          >
            See the last result →
          </Link>
        </div>

        <div className="md:col-span-5">
          {awaitingDecision || !winnerVideo?.uploader ? (
            <div className="relative bg-stage-900 border border-yellow-500/40 rounded-2xl p-5 overflow-hidden">
              <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-yellow-500/10 blur-3xl" />
              <div className="relative z-10">
                <p className="text-[10px] uppercase tracking-widest text-yellow-300 font-bold mb-2">
                  Tiebreak pending
                </p>
                {lastSong && (
                  <p className="text-xs text-haze/80">
                    The crown for{' '}
                    <span className="font-semibold text-white">
                      {lastSong.title}
                    </span>{' '}
                    is unclaimed until the call is made.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="relative bg-stage-900 border border-gold/40 rounded-2xl p-5 overflow-hidden">
              <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full bg-gold/15 blur-3xl" />
              <div className="relative z-10">
                <p className="text-[10px] uppercase tracking-widest text-gold font-bold mb-2">
                  Defending Champion
                </p>
                {lastSong && (
                  <p className="text-xs text-haze/80 mb-3">
                    Currently holding{' '}
                    <span className="font-semibold text-white">
                      {lastSong.title}
                    </span>
                    {lastSong.artist && (
                      <span className="text-haze/60"> · {lastSong.artist}</span>
                    )}
                  </p>
                )}
                <Link
                  href={`/u/${winnerVideo.uploader.username}`}
                  className="flex items-center gap-3 group"
                >
                  {winnerVideo.uploader.avatarUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={winnerVideo.uploader.avatarUrl}
                      alt=""
                      className="w-12 h-12 rounded-full object-cover border-2 border-gold/60"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-stage-800 border-2 border-gold/60 flex items-center justify-center font-bold text-haze">
                      {winnerVideo.uploader.username[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-display font-bold text-lg group-hover:text-gold transition-colors">
                      @{winnerVideo.uploader.username}
                    </p>
                    {lastSong && lastSong.currentChampionStreak > 1 && (
                      <p className="text-xs text-gold tabular-nums">
                        {lastSong.currentChampionStreak} wins in a row
                      </p>
                    )}
                  </div>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── State: no battles ever ────────────────────────────────────────

function FirstBattleComingSoon() {
  return (
    <section className="relative z-10 border-b border-stage-700/40">
      <div className="max-w-7xl mx-auto px-6 py-12 text-center">
        <p className="text-xs uppercase tracking-[0.3em] text-spotlight font-bold mb-3">
          First Battle Coming Soon
        </p>
        <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">
          We&apos;re preparing the first matchup now.
        </h2>
        <p className="text-haze">Once ready, voting opens.</p>
      </div>
    </section>
  );
}
