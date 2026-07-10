'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, BattleSummaryDto } from '@/lib/api';
import { useLobby } from '@/lib/useLobby';

/**
 * Global "LIVE VOTING ENDS IN HH:MM:SS" urgency ribbon. Sits directly
 * under the Nav on every page that renders <Nav />, so a visitor deep
 * in an admin-adjacent flow still sees that a battle is live and can
 * one-tap through to it.
 *
 * Data flow:
 *  - Mount: single `GET /battles?status=live&limit=1` to grab the
 *    "featured" live battle (server sorts by createdAt DESC).
 *  - Lobby SSE re-fetches when any battle lifecycle event fires so the
 *    ribbon appears / disappears live without a page refresh.
 *  - A 1s tick drives the HH:MM:SS countdown; runs only when a battle
 *    is present so we don't burn timers on empty state.
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

export default function CountdownRibbon() {
  const [battle, setBattle] = useState<BattleSummaryDto | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refetch = useCallback(async () => {
    try {
      const resp = await api.listBattles({ status: 'live', limit: 1 });
      setBattle(resp.items[0] ?? null);
    } catch {
      // Non-fatal — the section quietly hides on network failure.
      setBattle(null);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Re-fetch on any lobby lifecycle event — includes battle created,
  // closed, cancelled, tied. Covers the "ribbon should appear the
  // moment a new battle goes live" and "should disappear the moment
  // it closes" cases without a page reload.
  useLobby(() => {
    void refetch();
  });

  // 1-second tick. Restarts whenever a battle appears / disappears so
  // an empty-state page doesn't run a needless interval indefinitely.
  useEffect(() => {
    if (!battle) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [battle]);

  if (!battle) return null;

  const timeStr = formatTimeUntil(battle.votingClosesAt, now);
  // If the timer has run out (server hasn't finalised yet), suppress
  // the ribbon so it doesn't sit at "00:00:00" for the brief gap.
  if (timeStr === '00:00:00') return null;

  return (
    <Link
      href={`/battle/${battle.id}`}
      aria-label={`Live battle voting ends in ${timeStr} — open the battle page`}
      // Sticky right under the Nav (which is `sticky top-0 z-30`). We
      // use position: sticky at top-14 (56 px = default Nav height on
      // most pages) so the ribbon locks under the header while
      // scrolling. `z-20` puts it above content but below the Nav so
      // the Nav's shadow always overlaps cleanly. On very small
      // viewports where Nav can be taller, the natural flow still
      // reveals the ribbon.
      className="sticky top-0 z-20 block bg-spotlight/95 text-white text-[11px] sm:text-xs font-black uppercase tracking-[0.25em] py-1.5 sm:py-2 px-3 sm:px-4 text-center hover:bg-spotlight transition-colors shadow-lg shadow-spotlight/30"
    >
      <span className="inline-flex items-center gap-2 sm:gap-3 flex-wrap justify-center">
        {/* Live pulse dot — Tailwind's animate-ping ring + a solid inner
            circle, white so it stays legible against the red bar. */}
        <span className="relative inline-flex h-2 w-2 shrink-0">
          <span
            aria-hidden="true"
            className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"
          />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
        </span>
        <span>Live Voting Ends In</span>
        <span className="tabular-nums text-white bg-black/40 border border-white/30 px-2 py-0.5 rounded">
          {timeStr}
        </span>
      </span>
    </Link>
  );
}
