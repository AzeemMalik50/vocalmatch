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

interface Loaded {
  battle: BattleSummaryDto;
  song: SongDto | null;
  winner: VideoDto | null;
}

const COUNT = 5;

/**
 * Last few completed battles, with winner + song + relative time. A
 * return-behavior hook: visitors who missed a battle can see who took
 * the crown and click through. Auto-hides if no completed battles yet.
 */
export default function RecentWinners() {
  const [items, setItems] = useState<Loaded[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const resp = await api.listBattles({
        status: 'completed',
        limit: COUNT,
      });
      const loaded = await Promise.all(
        resp.items.map(async (b) => {
          const [song, winner] = await Promise.all([
            api.getSong(b.songId).catch(() => null),
            b.winnerPerformanceId
              ? api.getVideo(b.winnerPerformanceId).catch(() => null)
              : Promise.resolve(null),
          ]);
          return { battle: b, song, winner };
        }),
      );
      setItems(loaded);
    } catch {
      // Non-fatal — section just won't render.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // When a battle closes, it joins this list — pick it up via the lobby
  // stream so visitors don't have to refresh.
  useLobby((e) => {
    if (e.change === 'closed') void refetch();
  });

  if (loading || items.length === 0) return null;

  return (
    <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 py-12 border-b border-stage-700/40">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-2">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-gold font-bold mb-2">
            Recent winners
          </p>
          <h2 className="font-display text-3xl md:text-4xl font-bold">
            Who took the crown.
          </h2>
        </div>
      </div>
      <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map(({ battle, song, winner }) => (
          <li key={battle.id}>
            <Link
              href={`/battle/${battle.id}`}
              className="group block bg-stage-900 border border-stage-600 rounded-xl p-4 hover:border-gold/40 transition-colors h-full"
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-widest font-bold rounded-full bg-gold/15 text-gold border border-gold/30">
                  🏆 Winner
                </span>
                {battle.closedAt && (
                  <span className="text-[10px] text-haze/60 tabular-nums">
                    {timeAgo(battle.closedAt)}
                  </span>
                )}
              </div>
              {winner?.uploader ? (
                <div className="flex items-center gap-3">
                  {winner.uploader.avatarUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={winner.uploader.avatarUrl}
                      alt=""
                      className="w-12 h-12 rounded-full object-cover border-2 border-gold/40"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-stage-800 border-2 border-gold/40 flex items-center justify-center font-bold text-haze">
                      {winner.uploader.username[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-display font-bold text-lg leading-tight group-hover:text-gold transition-colors truncate">
                      @{winner.uploader.username}
                    </p>
                    {winner.uploader.currentStreak >= 2 && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-gold/15 text-gold rounded mt-1">
                        🔥 {winner.uploader.currentStreak} streak
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <p className="font-display font-bold text-lg">Crowned</p>
              )}
              <p className="text-xs text-haze mt-3 truncate">
                on{' '}
                <span className="text-white font-semibold">
                  {song?.title ?? battle.title ?? 'a Centerstage Song'}
                </span>
                {song?.artist && (
                  <span className="text-haze/60"> · {song.artist}</span>
                )}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
