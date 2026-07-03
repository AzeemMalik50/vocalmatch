'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AdminShell from '@/components/AdminShell';
import { SkeletonBlock, TableRowsSkeleton } from '@/components/Loaders';
import { api, BattleSummaryDto, SongDto } from '@/lib/api';
import { useLobby } from '@/lib/useLobby';

interface Stats {
  liveBattles: number;
  needsDecision: number;
  completedBattles: number;
  activeSongs: number;
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [needsDecision, setNeedsDecision] = useState<BattleSummaryDto[]>([]);
  const [recentLive, setRecentLive] = useState<BattleSummaryDto[]>([]);
  const [songs, setSongs] = useState<SongDto[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      // `withTotal: true` makes the backend run a COUNT alongside the
      // page query so the dashboard cards reflect the real number of
      // matching battles rather than the first paginated page (default
      // 50). Previously this dashboard reported 50 completed battles
      // even when 84+ existed because items.length was capped by the
      // page size. Active songs uses a high limit because /songs
      // doesn't yet expose a withTotal hook; 200 (the backend cap)
      // covers any realistic catalog.
      const [live, awaiting, completed, songsResp] = await Promise.all([
        api.listBattles({ status: 'live', withTotal: true }),
        api.listBattles({ status: 'needs_decision', withTotal: true }),
        api.listBattles({ status: 'completed', withTotal: true }),
        api.listSongs({ status: 'all', limit: 200 }),
      ]);
      setStats({
        liveBattles: live.total ?? live.items.length,
        needsDecision: awaiting.total ?? awaiting.items.length,
        completedBattles: completed.total ?? completed.items.length,
        activeSongs: songsResp.items.filter((s) => s.status === 'active').length,
      });
      setRecentLive(live.items.slice(0, 5));
      setNeedsDecision(awaiting.items);
      setSongs(songsResp.items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Real-time refresh — every battle lifecycle event updates the
  // backstage counts and recent lists without a page reload.
  useLobby(() => {
    void refetch();
  });

  return (
    <AdminShell>
      <h1 className="font-display font-black text-3xl mb-1">Backstage</h1>
      <p className="text-haze mb-8">
        Everything happening on the stage right now — live battles, ties
        waiting on you, and songs in rotation.
      </p>

      {/* Stat cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
        <StatCard label="Live battles" value={stats?.liveBattles} tone="spotlight" />
        <StatCard
          label="Needs decision"
          value={stats?.needsDecision}
          tone={stats?.needsDecision ? 'warn' : 'neutral'}
        />
        <StatCard label="Completed" value={stats?.completedBattles} tone="neutral" />
        <StatCard label="Active songs" value={stats?.activeSongs} tone="neutral" />
      </div>

      {/* Needs decision queue (urgent) */}
      {needsDecision.length > 0 && (
        <section className="mb-10">
          <div className="flex items-end justify-between mb-3">
            <h2 className="font-display font-bold text-xl">
              Needs your decision
            </h2>
            <span className="text-xs uppercase tracking-widest text-yellow-300 font-bold">
              {needsDecision.length} tied
            </span>
          </div>
          <div className="space-y-2">
            {needsDecision.map((b) => (
              <Link
                key={b.id}
                href={`/admin/battles?focus=${b.id}`}
                className="block bg-yellow-500/10 border border-yellow-500/40 rounded-xl p-4 hover:bg-yellow-500/15 transition-colors"
              >
                <p className="font-bold">
                  {b.title || 'Untitled battle'}
                </p>
                <p className="text-sm text-haze mt-1">
                  Closed at {new Date(b.closedAt ?? b.votingClosesAt).toLocaleString()} —
                  pick a winner to release the streak update.
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <section>
          <div className="flex items-end justify-between mb-3">
            <h2 className="font-display font-bold text-xl">Live battles</h2>
            <Link href="/admin/battles" className="text-sm text-spotlight font-bold hover:opacity-90">
              View all →
            </Link>
          </div>
          {loading ? (
            <TableRowsSkeleton rows={3} />
          ) : recentLive.length === 0 ? (
            <p className="text-haze">No live battles right now.</p>
          ) : (
            <div className="space-y-2">
              {recentLive.map((b) => (
                <Link
                  key={b.id}
                  href={`/admin/battles/${b.id}`}
                  className="block bg-stage-900 border border-stage-600 rounded-xl p-4 hover:border-spotlight/40 transition-colors"
                >
                  <p className="font-semibold">{b.title || 'Untitled battle'}</p>
                  <p className="text-xs text-haze mt-1 tabular-nums">
                    Closes {new Date(b.votingClosesAt).toLocaleString()}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-end justify-between mb-3">
            <h2 className="font-display font-bold text-xl">Songs catalog</h2>
            <Link href="/admin/songs" className="text-sm text-spotlight font-bold hover:opacity-90">
              Manage →
            </Link>
          </div>
          {songs.length === 0 ? (
            <p className="text-haze">No songs yet — start with one in the Songs tab.</p>
          ) : (
            <div className="space-y-2">
              {songs.slice(0, 5).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between bg-stage-900 border border-stage-600 rounded-xl p-4"
                >
                  <div>
                    <p className="font-semibold">{s.title}</p>
                    <p className="text-xs text-haze mt-0.5">{s.artist}</p>
                  </div>
                  <span
                    className={`text-[10px] uppercase tracking-widest font-bold ${
                      s.status === 'active' ? 'text-spotlight' : 'text-haze/60'
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | undefined;
  tone: 'spotlight' | 'warn' | 'neutral';
}) {
  const colors =
    tone === 'spotlight'
      ? 'border-spotlight/40 bg-spotlight/5 text-spotlight'
      : tone === 'warn'
        ? 'border-yellow-500/40 bg-yellow-500/5 text-yellow-300'
        : 'border-stage-700 bg-stage-900 text-haze';
  return (
    <div className={`border rounded-xl p-4 ${colors}`}>
      <p className="text-xs uppercase tracking-widest font-bold opacity-80">
        {label}
      </p>
      {value === undefined ? (
        <SkeletonBlock className="h-9 w-12 mt-1" />
      ) : (
        <p className="font-display font-black text-3xl mt-1 tabular-nums">
          {value}
        </p>
      )}
    </div>
  );
}
