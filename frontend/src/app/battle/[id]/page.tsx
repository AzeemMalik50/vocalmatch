'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import CountdownTimer from '@/components/CountdownTimer';
import BattleVotePanel from '@/components/BattleVotePanel';
import { BattlePageSkeleton, PerformancePaneSkeleton, StageLoader } from '@/components/Loaders';
import {
  api,
  BattleDto,
  BATTLE_STATUS_LABELS,
  buildStreamUrl,
  SongDto,
  VideoDto,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

/**
 * Public battle page (Phase 2A primary surface).
 *
 * Renders progressively:
 *   1. As soon as the battle endpoint responds, the header (status + timer)
 *      and overall layout appear.
 *   2. Performances and the song name fill in as their fetches resolve.
 *   3. The vote panel waits for both performances since voting needs them.
 *
 * This prevents a slow video fetch from blocking the timer from appearing.
 */
export default function BattlePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const id = params?.id;

  const [battle, setBattle] = useState<BattleDto | null>(null);
  const [song, setSong] = useState<SongDto | null>(null);
  const [performanceA, setPerformanceA] = useState<VideoDto | null>(null);
  const [performanceB, setPerformanceB] = useState<VideoDto | null>(null);
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  // Bug #20 — tracked failure per side so the page can replace the
  // permanently-spinning skeleton with an explicit "unavailable" state
  // instead of looking like it's still loading.
  const [perfErrorA, setPerfErrorA] = useState<string | null>(null);
  const [perfErrorB, setPerfErrorB] = useState<string | null>(null);
  const perfError = perfErrorA || perfErrorB;
  const [shareState, setShareState] = useState<'idle' | 'copied'>('idle');

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const b = await api.getBattle(id);
      setBattle(b);

      // Fire each sub-fetch independently so a slow/failing one can't block
      // the others. The timer + status pill render off `battle` alone.
      api.getSong(b.songId).then(setSong).catch(() => setSong(null));
      api
        .getVideo(b.performanceAId)
        .then(setPerformanceA)
        .catch((e) =>
          setPerfErrorA(e.message || 'Performance A is unavailable.'),
        );
      api
        .getVideo(b.performanceBId)
        .then(setPerformanceB)
        .catch((e) =>
          setPerfErrorB(e.message || 'Performance B is unavailable.'),
        );
    } catch (e: any) {
      setTopLevelError(e.message || 'Could not load this battle');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Live vote counts via SSE. The backend only subscribes us to the battle
  // channel when we're allowed to see standings (admin or already-voted) so
  // we mirror that gate here using `canSeeStandings`. Re-runs when it flips
  // from false → true (i.e. right after the user casts their vote).
  useEffect(() => {
    if (!id) return;
    if (!user) return; // anonymous viewers don't get live counts
    if (!battle?.canSeeStandings) return;

    const url = buildStreamUrl({ battleId: id });
    if (!url) return;
    const es = new EventSource(url);

    const merge = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data) as Partial<BattleDto> & {
          battleId: string;
        };
        if (payload.battleId !== id) return;
        setBattle((prev) =>
          prev
            ? {
                ...prev,
                voteCountA: payload.voteCountA ?? prev.voteCountA,
                voteCountB: payload.voteCountB ?? prev.voteCountB,
                percentA: payload.percentA ?? prev.percentA,
                percentB: payload.percentB ?? prev.percentB,
                currentLeader: payload.currentLeader ?? prev.currentLeader,
                totalVotes: payload.totalVotes ?? prev.totalVotes,
                status: payload.status ?? prev.status,
                winnerPerformanceId:
                  payload.winnerPerformanceId ?? prev.winnerPerformanceId,
                winnerUserId: payload.winnerUserId ?? prev.winnerUserId,
                closedAt: payload.closedAt ?? prev.closedAt,
              }
            : prev,
        );
      } catch {
        // Skip malformed frames.
      }
    };
    es.addEventListener('vote', merge);
    es.addEventListener('status', merge);

    return () => {
      es.close();
    };
  }, [id, user, battle?.canSeeStandings]);

  const handleShare = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const url = window.location.href;
    const title =
      battle?.title || (song ? `VocalMatch battle: ${song.title}` : 'VocalMatch battle');
    const text = song?.title
      ? `Watch and vote on this 1v1 of "${song.title}" on VocalMatch.`
      : 'Watch and vote on this 1v1 on VocalMatch.';

    try {
      if (typeof navigator !== 'undefined' && 'share' in navigator) {
        await navigator.share({ title, text, url });
        return;
      }
    } catch (err: any) {
      // User cancelled the share sheet — silently ignore.
      if (err?.name === 'AbortError') return;
      // Anything else falls through to clipboard.
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareState('copied');
      setTimeout(() => setShareState('idle'), 2000);
    } catch {
      // Last-ditch: select-and-copy is not worth the complexity here.
    }
  }, [battle, song]);

  if (topLevelError) {
    return (
      <>
        <Nav />
        <main className="max-w-3xl mx-auto px-4 sm:px-6 py-20 text-center">
          <p className="font-display text-3xl font-bold mb-3">
            We couldn&apos;t load this battle.
          </p>
          <p className="text-haze mb-8">{topLevelError}</p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-spotlight text-white font-bold rounded-md hover:bg-spotlight-dim transition-colors"
          >
            Back to the stage
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  if (!battle) {
    return (
      <>
        <Nav />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-12">
          <BattlePageSkeleton />
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        {/* Header */}
        <header className="mb-6 md:mb-8">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <StatusPill status={battle.status} />
            {battle.status === 'live' && (
              <CountdownTimer endsAt={battle.votingClosesAt} onExpired={load} size="compact" />
            )}
            <button
              type="button"
              onClick={handleShare}
              className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 text-xs uppercase tracking-widest font-bold rounded-full border border-stage-700 bg-stage-900 text-haze hover:text-white hover:border-stage-500 transition-colors"
              aria-label="Share this battle"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              {shareState === 'copied' ? 'Link copied' : 'Share'}
            </button>
          </div>
          <h1 className="font-display font-black text-3xl md:text-5xl leading-tight mb-2">
            {battle.title || (song ? `Battle: ${song.title}` : 'A VocalMatch battle')}
          </h1>
          {song && (
            <p className="text-haze">
              <span className="text-haze/70">Centerstage Song:</span>{' '}
              <span className="font-semibold text-white">{song.title}</span>
              {song.artist && (
                <span className="text-haze/70"> · {song.artist}</span>
              )}
            </p>
          )}
        </header>

        {/* Winner callout — replaces the countdown for completed battles.
            The single most prestigious surface in the app: full-width gold
            banner naming the winner. Returning visitors see this first and
            know immediately who took the crown. */}
        {battle.status === 'completed' && battle.winnerPerformanceId && (
          <WinnerBanner
            battle={battle}
            performanceA={performanceA}
            performanceB={performanceB}
          />
        )}

        {/* Big countdown for live battles */}
        {battle.status === 'live' && (
          <div className="mb-8 flex justify-center">
            <CountdownTimer endsAt={battle.votingClosesAt} onExpired={load} size="large" />
          </div>
        )}

        {perfError && (
          <div className="bg-red-950/30 border border-red-900/40 rounded-lg p-3 text-sm text-red-300 mb-4">
            {perfError}
          </div>
        )}

        {/* The two videos */}
        <div className="grid md:grid-cols-2 gap-4 md:gap-6 mb-8">
          {performanceA ? (
            <PerformancePane
              performance={performanceA}
              side="A"
              isDefendingChampion={
                !!song?.currentChampionPerformanceId &&
                song.currentChampionPerformanceId === performanceA.id
              }
            />
          ) : perfErrorA ? (
            <PerformancePaneUnavailable side="A" message={perfErrorA} />
          ) : (
            <PerformancePaneSkeleton side="A" />
          )}
          {performanceB ? (
            <PerformancePane
              performance={performanceB}
              side="B"
              isDefendingChampion={
                !!song?.currentChampionPerformanceId &&
                song.currentChampionPerformanceId === performanceB.id
              }
            />
          ) : perfErrorB ? (
            <PerformancePaneUnavailable side="B" message={perfErrorB} />
          ) : (
            <PerformancePaneSkeleton side="B" />
          )}
        </div>

        {/* Vote panel — needs both performances loaded. When either
            side failed to load (e.g. soft-deleted media) we replace the
            indefinite "loading" state with a clear explanation so the
            page doesn't appear stuck. */}
        {performanceA && performanceB ? (
          <BattleVotePanel
            battle={battle}
            performanceA={performanceA}
            performanceB={performanceB}
            onVoted={(updated) => setBattle(updated)}
          />
        ) : perfError ? (
          <div className="bg-stage-900 border border-red-900/40 rounded-2xl p-8 text-center">
            <p className="font-display text-xl font-bold text-white mb-2">
              Voting is paused for this battle.
            </p>
            <p className="text-sm text-haze">
              One or both performance videos are no longer available. An admin
              has been notified — check back later or browse other live battles.
            </p>
          </div>
        ) : (
          <div className="bg-stage-900 border border-stage-700 rounded-2xl p-8">
            <StageLoader message="Tuning in to both performers…" />
          </div>
        )}

        {/* Challenge CTA — the WATCH → VOTE → CHALLENGE bridge.
            Only shown when:
              - the song has a current champion (someone to dethrone)
              - the viewer isn't that champion (no self-challenge)
              - the viewer isn't already a participant in this battle */}
        {song?.currentChampionUserId &&
          performanceA &&
          performanceB &&
          user?.id !== song.currentChampionUserId &&
          user?.id !== performanceA.uploader?.id &&
          user?.id !== performanceB.uploader?.id && (
            <ChallengeCta song={song} authed={!!user} />
          )}

        {/* Back link */}
        <div className="mt-10 text-center">
          <Link
            href="/"
            className="text-sm text-haze hover:text-white transition-colors"
          >
            ← Back to the stage
          </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}

/**
 * Winner banner — the prestige moment. Renders only on completed battles
 * with a confirmed winnerPerformanceId. Pulls the winner's username +
 * avatar from whichever side won so it reads instantly.
 */
function WinnerBanner({
  battle,
  performanceA,
  performanceB,
}: {
  battle: BattleDto;
  performanceA: VideoDto | null;
  performanceB: VideoDto | null;
}) {
  const winnerSide: 'A' | 'B' | null =
    battle.winnerPerformanceId === battle.performanceAId
      ? 'A'
      : battle.winnerPerformanceId === battle.performanceBId
        ? 'B'
        : null;
  const winnerPerf =
    winnerSide === 'A' ? performanceA : winnerSide === 'B' ? performanceB : null;
  const username = winnerPerf?.uploader?.username ?? null;
  const streak = winnerPerf?.uploader?.currentStreak ?? 0;
  const totalVotes = battle.totalVotes ?? 0;

  return (
    <div className="mb-8 relative overflow-hidden rounded-2xl border-2 border-gold bg-gradient-to-br from-gold/15 via-stage-900 to-stage-900 px-5 py-5 sm:px-6 sm:py-6 md:px-8 md:py-7">
      <div className="absolute -top-16 -left-12 w-64 h-64 rounded-full bg-gold/20 blur-3xl pointer-events-none" />
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center gap-4">
        <span className="inline-flex items-center justify-center text-3xl sm:text-4xl" aria-hidden="true">
          🏆
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] sm:text-xs uppercase tracking-[0.3em] text-gold font-bold mb-1">
            Winner · Side {winnerSide ?? '—'}
          </p>
          <p className="font-display text-2xl md:text-3xl font-black leading-tight">
            {username ? (
              <Link href={`/u/${username}`} className="hover:opacity-90">
                @{username}
              </Link>
            ) : (
              <span>Crowned</span>
            )}
            {streak >= 2 && (
              <span className="ml-3 inline-flex items-center gap-1 px-2 py-1 text-[11px] uppercase tracking-widest font-bold bg-gold/20 text-gold rounded align-middle">
                🔥 {streak} wins in a row
              </span>
            )}
          </p>
          <p className="text-sm text-haze mt-1 tabular-nums">
            {battle.voteCountA ?? 0} – {battle.voteCountB ?? 0} · {totalVotes}{' '}
            {totalVotes === 1 ? 'vote' : 'votes'} total
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Post-vote call to action — the "CHALLENGE → RETURN" half of the loop.
 *
 * Copy varies with stakes: when the current champion is on a streak (>=2),
 * the button leans into it ("Beat the 3-time champion") so the emotional
 * weight of toppling them is front-and-center. Mobile-first padding +
 * single-column on small screens; one tap to either upload or sign up.
 */
function ChallengeCta({ song, authed }: { song: SongDto; authed: boolean }) {
  const streak = song.currentChampionStreak ?? 0;
  const headline =
    streak >= 2
      ? `Think you can beat the ${streak}-time champion?`
      : `Think you can sing it better?`;
  const subline =
    streak >= 2
      ? `Upload your version of "${song.title}". If admin picks you, you're in the next battle.`
      : `Upload your version of "${song.title}" and step into the next battle.`;

  // Authed users go straight to upload; unauthed users go to login with the
  // upload page (challenge mode) as the post-login destination.
  const uploadHref = `/upload?songId=${encodeURIComponent(song.id)}&challenge=1`;
  const href = authed
    ? uploadHref
    : `/login?next=${encodeURIComponent(uploadHref)}`;

  return (
    <section className="mt-8 relative overflow-hidden rounded-2xl border border-spotlight/40 bg-gradient-to-br from-spotlight/10 via-stage-900 to-stage-900 p-5 sm:p-6 md:p-8">
      <div className="absolute -top-20 -right-20 w-48 h-48 md:w-64 md:h-64 rounded-full bg-spotlight/20 blur-3xl pointer-events-none" />
      <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-5">
        <div className="flex-1 min-w-0">
          <p className="text-xs uppercase tracking-[0.3em] text-spotlight font-bold mb-2">
            The Challenge
          </p>
          <h3 className="font-display text-2xl md:text-3xl font-black leading-tight mb-2">
            {headline}
          </h3>
          <p className="text-sm md:text-base text-haze">{subline}</p>
        </div>
        <Link
          href={href}
          className="inline-flex items-center justify-center px-5 py-3 md:py-3.5 bg-spotlight text-white font-bold rounded-md hover:bg-spotlight-dim transition-colors uppercase tracking-widest text-sm shadow-lg shadow-spotlight/30 whitespace-nowrap"
        >
          {authed ? 'Upload your version →' : 'Sign up to challenge →'}
        </Link>
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: BattleDto['status'] }) {
  const tone =
    status === 'live'
      ? 'bg-spotlight/15 border-spotlight/40 text-spotlight'
      : status === 'completed'
        ? 'bg-gold/15 border-gold/40 text-gold'
        : status === 'needs_decision'
          ? 'bg-yellow-500/15 border-yellow-500/40 text-yellow-300'
          : 'bg-stage-800 border-stage-700 text-haze';
  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 text-xs uppercase tracking-widest font-bold rounded-full border ${tone}`}
    >
      {status === 'live' && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-spotlight opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-spotlight" />
        </span>
      )}
      {BATTLE_STATUS_LABELS[status]}
    </span>
  );
}

function PerformancePaneUnavailable({
  side,
  message,
}: {
  side: 'A' | 'B';
  message: string;
}) {
  // Bug #20 — replaces the indefinite skeleton when the performance
  // can't be loaded (typical cause: the uploader soft-deleted the
  // video). Gives the user a clear "this side is gone" state instead
  // of a permanent loading spinner.
  const accent = side === 'A' ? 'border-spotlight/30' : 'border-gold/30';
  return (
    <div
      role="status"
      className={`bg-stage-900 border-2 ${accent} rounded-xl overflow-hidden`}
    >
      <div className="aspect-video bg-stage-950 flex items-center justify-center">
        <div className="text-center px-6">
          <p className="font-display text-2xl font-bold text-haze mb-1">
            Side {side}
          </p>
          <p className="text-sm text-haze/70">Performance unavailable</p>
        </div>
      </div>
      <div className="p-4">
        <p className="text-[11px] uppercase tracking-widest text-haze/60 font-bold mb-1">
          Side {side}
        </p>
        <p className="text-sm text-haze leading-relaxed">{message}</p>
      </div>
    </div>
  );
}

function PerformancePane({
  performance,
  side,
  isDefendingChampion,
}: {
  performance: VideoDto;
  side: 'A' | 'B';
  isDefendingChampion?: boolean;
}) {
  const accent = side === 'A' ? 'border-spotlight/30' : 'border-gold/30';
  return (
    <div className={`relative bg-stage-900 border-2 ${accent} rounded-xl overflow-hidden`}>
      {/* Champion identity: a single, unmissable badge so returning visitors
          instantly recognize who's defending. Drives prestige. */}
      {isDefendingChampion && (
        <span className="absolute top-3 left-3 z-10 inline-flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-widest font-bold rounded-full bg-gold text-stage-950 shadow-lg">
          <span aria-hidden="true">👑</span>
          Defending Champion
        </span>
      )}
      <div className="aspect-video bg-stage-950">
        <video
          key={performance.id}
          src={performance.url}
          poster={performance.thumbnailUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          className="w-full h-full object-contain bg-black"
        />
      </div>
      <div className="p-4">
        <p className="text-[11px] uppercase tracking-widest text-haze/60 font-bold mb-1">
          Side {side}
        </p>
        <p className="font-display font-bold text-lg leading-tight">
          {performance.title}
        </p>
        {performance.uploader && (
          <Link
            href={`/u/${performance.uploader.username}`}
            className="inline-flex items-center gap-2 mt-2 text-sm text-haze hover:text-white transition-colors flex-wrap"
          >
            {/* Singer avatar next to the @username so the side reads as
                a person, not just a handle. */}
            <span
              className={`relative inline-block h-7 w-7 shrink-0 overflow-hidden rounded-full border ${
                side === 'A' ? 'border-spotlight/50' : 'border-gold/50'
              } bg-stage-800`}
            >
              {performance.uploader.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={performance.uploader.avatarUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[11px] font-bold text-haze">
                  {performance.uploader.username[0]?.toUpperCase()}
                </span>
              )}
            </span>
            @{performance.uploader.username}
            {performance.uploader.championTitle && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-gold/15 text-gold rounded">
                {performance.uploader.championTitle}
              </span>
            )}
            {performance.uploader.currentStreak >= 2 && (
              <span
                className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-gold/15 text-gold rounded"
                title={`${performance.uploader.currentStreak} wins in a row`}
              >
                <span aria-hidden="true">🔥</span>
                {performance.uploader.currentStreak} streak
              </span>
            )}
          </Link>
        )}
      </div>
    </div>
  );
}
