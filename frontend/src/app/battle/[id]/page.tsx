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
  SongDto,
  VideoDto,
} from '@/lib/api';

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
  const id = params?.id;

  const [battle, setBattle] = useState<BattleDto | null>(null);
  const [song, setSong] = useState<SongDto | null>(null);
  const [performanceA, setPerformanceA] = useState<VideoDto | null>(null);
  const [performanceB, setPerformanceB] = useState<VideoDto | null>(null);
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [perfError, setPerfError] = useState<string | null>(null);
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
        .catch((e) => setPerfError(e.message || 'Could not load performance A'));
      api
        .getVideo(b.performanceBId)
        .then(setPerformanceB)
        .catch((e) => setPerfError(e.message || 'Could not load performance B'));
    } catch (e: any) {
      setTopLevelError(e.message || 'Could not load this battle');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

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
            <PerformancePane performance={performanceA} side="A" />
          ) : (
            <PerformancePaneSkeleton side="A" />
          )}
          {performanceB ? (
            <PerformancePane performance={performanceB} side="B" />
          ) : (
            <PerformancePaneSkeleton side="B" />
          )}
        </div>

        {/* Vote panel — needs both performances loaded */}
        {performanceA && performanceB ? (
          <BattleVotePanel
            battle={battle}
            performanceA={performanceA}
            performanceB={performanceB}
            onVoted={(updated) => setBattle(updated)}
          />
        ) : (
          <div className="bg-stage-900 border border-stage-700 rounded-2xl p-8">
            <StageLoader message="Tuning in to both performers…" />
          </div>
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

function PerformancePane({
  performance,
  side,
}: {
  performance: VideoDto;
  side: 'A' | 'B';
}) {
  const accent = side === 'A' ? 'border-spotlight/30' : 'border-gold/30';
  return (
    <div className={`bg-stage-900 border-2 ${accent} rounded-xl overflow-hidden`}>
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
            className="inline-flex items-center gap-2 mt-2 text-sm text-haze hover:text-white transition-colors"
          >
            @{performance.uploader.username}
            {performance.uploader.championTitle && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-gold/15 text-gold rounded">
                {performance.uploader.championTitle}
              </span>
            )}
          </Link>
        )}
      </div>
    </div>
  );
}
