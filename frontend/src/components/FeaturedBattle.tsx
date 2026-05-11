'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, BattleSummaryDto, SongDto, VideoDto } from '@/lib/api';
import CountdownTimer from './CountdownTimer';
import { FeaturedBattleSkeleton } from './Loaders';

interface Loaded {
  battle: BattleSummaryDto;
  song: SongDto | null;
  performanceA: VideoDto | null;
  performanceB: VideoDto | null;
}

interface Props {
  /** Rendered when there are no live battles (e.g. the static "First Battle" teaser). */
  fallback: ReactNode;
}

/**
 * Homepage hero card. Shows the most-recently-created live battle if any
 * exist; otherwise renders the provided fallback.
 */
export default function FeaturedBattle({ fallback }: Props) {
  const [data, setData] = useState<Loaded | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const resp = await api.listBattles({ status: 'live' });
        const battle = resp.items[0];
        if (!battle) {
          setLoaded(true);
          return;
        }
        const [song, performanceA, performanceB] = await Promise.all([
          api.getSong(battle.songId).catch(() => null),
          api.getVideo(battle.performanceAId).catch(() => null),
          api.getVideo(battle.performanceBId).catch(() => null),
        ]);
        setData({ battle, song, performanceA, performanceB });
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  if (!loaded) return <FeaturedBattleSkeleton />;
  if (!data) return <>{fallback}</>;

  const { battle, song, performanceA, performanceB } = data;

  return (
    <div className="relative bg-stage-900 border border-stage-700 rounded-2xl p-6 overflow-hidden">
      <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full bg-spotlight/20 blur-3xl" />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-spotlight opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-spotlight" />
          </span>
          <p className="text-xs uppercase tracking-widest text-spotlight font-bold">
            Live battle
          </p>
        </div>
        <h3 className="font-display text-2xl font-bold mb-2 leading-tight">
          {battle.title || (song ? song.title : 'A VocalMatch battle')}
        </h3>
        {song && (
          <p className="text-sm text-haze mb-4">
            {song.title}
            {song.artist && <span className="text-haze/60"> · {song.artist}</span>}
          </p>
        )}
        <div className="flex items-center justify-center gap-4 py-4 border-y border-stage-700/60 mb-4">
          <Performer label="A" username={performanceA?.uploader?.username} accent="spotlight" />
          <span className="font-display font-black text-2xl text-spotlight italic">
            vs
          </span>
          <Performer label="B" username={performanceB?.uploader?.username} accent="gold" />
        </div>
        <div className="text-center mb-4">
          <CountdownTimer endsAt={battle.votingClosesAt} size="compact" />
          <p className="text-[10px] uppercase tracking-widest text-haze/60 mt-1">
            until voting closes
          </p>
        </div>
        <Link
          href={`/battle/${battle.id}`}
          className="block w-full text-center px-4 py-3 bg-spotlight text-white font-bold rounded-md hover:bg-spotlight-dim transition-colors uppercase tracking-widest text-sm"
        >
          Watch &amp; Vote →
        </Link>
      </div>
    </div>
  );
}

function Performer({
  label,
  username,
  accent,
}: {
  label: string;
  username?: string;
  accent: 'spotlight' | 'gold';
}) {
  const border = accent === 'spotlight' ? 'border-spotlight/40' : 'border-gold/40';
  return (
    <div className="flex flex-col items-center">
      <div
        className={`w-12 h-12 rounded-full bg-stage-800 border-2 ${border} flex items-center justify-center font-bold text-haze`}
      >
        {username ? username[0]?.toUpperCase() : label}
      </div>
      <span className="text-[10px] uppercase tracking-widest text-haze/60 mt-1 max-w-[80px] truncate">
        {username ? `@${username}` : 'Singer'}
      </span>
    </div>
  );
}
