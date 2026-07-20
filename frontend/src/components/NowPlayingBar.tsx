'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  api,
  BattleSummaryDto,
  SongDto,
  FeaturedSongRiskDto,
} from '@/lib/api';
import { useLobby } from '@/lib/useLobby';

/**
 * Spec: "Now Playing Bar" — sits directly beneath the Nav on every page.
 * Surfaces the currently-live Centerstage Song at a glance:
 *   CENTERSTAGE SONG · <title> — <songwriter> · Official Voice @<user>
 *   · LIVE · HH:MM:SS · [WATCH NOW]
 *
 * Data flow:
 *   - Mount + lobby SSE tick: `GET /battles?status=live&limit=1` to grab
 *     the featured live battle (sorted by createdAt DESC on the server).
 *   - When a battle is present, hydrate the song (title + artist) and
 *     the featured champion (username) so the bar can render the full
 *     "Official Voice" line.
 *   - A 1s tick drives the HH:MM:SS countdown; runs only when a battle
 *     is present so we don't burn timers on empty state.
 *   - Auto-hides when no live battle is running.
 */

function formatTimeUntil(iso: string, now: number): string {
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return '00:00:00';
  const totalSeconds = Math.floor(diff / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Spec: during the final three days, automatically escalate the
 * urgency label — FINAL 72 HOURS → FINAL 48 HOURS → FINAL 24 HOURS.
 * Returns null outside the final 72-hour window; the standard LIVE
 * pill renders instead.
 */
function finalHoursLabel(iso: string, now: number): string | null {
  const msLeft = new Date(iso).getTime() - now;
  if (msLeft <= 0) return null;
  const hoursLeft = msLeft / (1000 * 60 * 60);
  if (hoursLeft > 72) return null;
  if (hoursLeft > 48) return 'Final 72 Hours';
  if (hoursLeft > 24) return 'Final 48 Hours';
  return 'Final 24 Hours';
}

export default function NowPlayingBar() {
  const [battle, setBattle] = useState<BattleSummaryDto | null>(null);
  const [song, setSong] = useState<SongDto | null>(null);
  const [featured, setFeatured] = useState<FeaturedSongRiskDto | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refetch = useCallback(async () => {
    try {
      const resp = await api.listBattles({ status: 'live', limit: 1 });
      const b = resp.items[0] ?? null;
      setBattle(b);
      if (!b) {
        setSong(null);
        setFeatured(null);
        return;
      }
      // Hydrate song + champion in parallel. Either can fail without
      // breaking the bar — we degrade to whatever we have.
      const [songResp, featuredResp] = await Promise.allSettled([
        api.getSong(b.songId),
        api.getFeaturedRisk(),
      ]);
      setSong(songResp.status === 'fulfilled' ? songResp.value : null);
      setFeatured(
        featuredResp.status === 'fulfilled' ? featuredResp.value : null,
      );
    } catch {
      setBattle(null);
      setSong(null);
      setFeatured(null);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useLobby(() => {
    void refetch();
  });

  useEffect(() => {
    if (!battle) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [battle]);

  if (!battle) return null;

  const timeStr = formatTimeUntil(battle.votingClosesAt, now);
  if (timeStr === '00:00:00') return null;
  const finalLabel = finalHoursLabel(battle.votingClosesAt, now);
  const isFinalWindow = finalLabel !== null;

  const songTitle = song?.title ?? battle.title ?? 'Centerstage Song';
  const songwriter = song?.artist ?? null;
  // Only show the "Official Voice" line when the featured champion is
  // for THIS song — otherwise it's a stale credit from a different song.
  const championUsername =
    featured && song && featured.song.id === song.id
      ? featured.champion?.username ?? null
      : null;

  return (
    <div
      // Sticky right under the Nav (which is `sticky top-0 z-30`). This
      // bar rides just beneath at z-20 so Nav's shadow always overlaps
      // cleanly. Solid black background per brand spec.
      className="sticky top-0 z-20 bg-black border-b border-spotlight/40 text-white shadow-lg shadow-spotlight/10"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-2 flex items-center gap-3 sm:gap-4 flex-wrap">
        {/* CENTERSTAGE SONG label + song / songwriter */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded bg-spotlight/20 border border-spotlight/60 text-[9px] font-black uppercase tracking-[0.25em] text-spotlight whitespace-nowrap">
            Centerstage Song
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-xs sm:text-sm font-bold truncate">
              {songTitle}
              {songwriter && (
                <span className="font-normal text-white/60">
                  {' '}
                  · {songwriter}
                </span>
              )}
            </p>
            {championUsername && (
              <p className="text-[10px] sm:text-[11px] uppercase tracking-[0.2em] text-gold font-semibold truncate">
                Official Voice · @{championUsername}
              </p>
            )}
          </div>
        </div>

        {/* Voting status + time + WATCH NOW. During the final 72 hours
            the LIVE pill escalates to FINAL 72 / 48 / 24 HOURS per
            spec, and the timer chip pulses to reinforce the urgency. */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <span
            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-white text-[10px] font-black uppercase tracking-[0.2em] whitespace-nowrap ${
              isFinalWindow
                ? 'bg-gold text-black animate-pulse'
                : 'bg-spotlight/90'
            }`}
          >
            <span className="relative inline-flex h-1.5 w-1.5">
              <span
                aria-hidden="true"
                className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isFinalWindow ? 'bg-black' : 'bg-white'
                }`}
              />
              <span
                className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
                  isFinalWindow ? 'bg-black' : 'bg-white'
                }`}
              />
            </span>
            {finalLabel ?? 'Live'}
          </span>
          <span
            className={`tabular-nums text-white bg-black border px-2 py-0.5 rounded text-xs sm:text-sm font-black tracking-widest ${
              isFinalWindow ? 'border-gold' : 'border-spotlight/60'
            }`}
          >
            {timeStr}
          </span>
          <Link
            href={`/battle/${battle.id}`}
            aria-label={`Watch the current live battle — voting ends in ${timeStr}`}
            className="inline-flex items-center bg-spotlight hover:bg-spotlight-dim text-white text-[10px] sm:text-xs font-black uppercase tracking-[0.2em] px-3 py-1.5 rounded transition-colors whitespace-nowrap"
          >
            Watch Now
          </Link>
        </div>
      </div>
    </div>
  );
}
