'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { api, BattleSummaryDto, BattleStatus } from '@/lib/api';

/**
 * Public /battles browser.
 *
 * Spec: "Battles" is a top-level nav destination. This page surfaces
 * every battle a visitor can watch (live now, plus recently closed) so
 * that new visitors landing directly on /battles from a share link
 * still get the full context without hunting through the homepage.
 *
 * Filters:
 *   - Live   : currently accepting votes
 *   - Recent : most recently completed (winners crowned)
 *
 * Voting itself lives on `/battle/[id]` — this page is a curated
 * gateway, not a vote surface.
 */

type Filter = Extract<BattleStatus, 'live' | 'completed'>;

const FILTERS: Array<{ key: Filter; label: string; subtitle: string }> = [
  {
    key: 'live',
    label: 'Live',
    subtitle: 'Voting is open right now',
  },
  {
    key: 'completed',
    label: 'Recently Crowned',
    subtitle: 'Battles that closed with a winner',
  },
];

export default function BattlesPage() {
  const [filter, setFilter] = useState<Filter>('live');
  const [items, setItems] = useState<BattleSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .listBattles({ status: filter, limit: 24 })
      .then((resp) => {
        if (!cancelled) setItems(resp.items);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter]);

  return (
    <>
      <Nav />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 md:py-16">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-[0.3em] text-spotlight font-black mb-2">
            The Arena Roster
          </p>
          <h1 className="font-display text-4xl md:text-6xl font-black text-white mb-2">
            All Battles
          </h1>
          <p className="text-base text-white/60 max-w-2xl">
            Two singers. One song. One Crown. Every battle open for voting,
            plus the last handful of decisions.
          </p>
        </header>

        <div className="flex flex-wrap gap-2 mb-8">
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                className={`px-4 py-2 rounded-full text-xs font-black uppercase tracking-[0.2em] border transition-colors ${
                  active
                    ? 'bg-spotlight text-white border-spotlight'
                    : 'bg-black/30 text-white/70 border-stage-700 hover:border-spotlight/60 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-40 rounded-2xl skeleton" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-24 bg-card/40 border border-stage-700 rounded-2xl">
            <p className="text-xl font-bold text-white mb-2">
              {filter === 'live'
                ? 'No live battles right now.'
                : 'No completed battles yet.'}
            </p>
            <p className="text-white/60">
              {filter === 'live'
                ? 'Check back soon — the next battle drops when the admin pairs the next contender.'
                : "Once battles finish, they'll appear here."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((b) => (
              <BattleCard key={b.id} battle={b} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function BattleCard({ battle }: { battle: BattleSummaryDto }) {
  const isLive = battle.status === 'live';
  return (
    <Link
      href={`/battle/${battle.id}`}
      className="group block bg-card/50 backdrop-blur border border-stage-700 hover:border-spotlight rounded-2xl p-5 transition-colors"
    >
      <div className="flex items-center gap-2 mb-3">
        {isLive ? (
          <>
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-spotlight opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-spotlight" />
            </span>
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-spotlight">
              Live
            </span>
          </>
        ) : (
          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-gold">
            Crowned
          </span>
        )}
        {battle.fromChallenge && (
          <span className="ml-auto text-[10px] font-bold uppercase tracking-widest text-white/60 border border-white/20 rounded px-1.5 py-0.5">
            Red Phone
          </span>
        )}
      </div>
      <h2 className="text-lg font-bold text-white truncate group-hover:text-spotlight transition-colors">
        {battle.title ?? 'Untitled Battle'}
      </h2>
      <p className="text-xs text-white/50 mt-1">
        Opened {new Date(battle.votingOpensAt).toLocaleDateString()}
      </p>
    </Link>
  );
}
