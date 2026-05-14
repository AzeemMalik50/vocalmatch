'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import CountdownTimer from '@/components/CountdownTimer';
import { StageLoader } from '@/components/Loaders';
import {
  api,
  BattleDto,
  BATTLE_STATUS_LABELS,
  BattleStatus,
  SongDto,
  VideoDto,
} from '@/lib/api';

/**
 * Admin-facing battle detail. Shows participants, live vote counts (admins
 * bypass the per-user gate server-side), winner callout, and inline action
 * buttons matching the row controls on the list page.
 */
export default function AdminBattleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id;

  const [battle, setBattle] = useState<BattleDto | null>(null);
  const [song, setSong] = useState<SongDto | null>(null);
  const [perfA, setPerfA] = useState<VideoDto | null>(null);
  const [perfB, setPerfB] = useState<VideoDto | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    try {
      const b = await api.getBattle(id);
      setBattle(b);
      // Fire each sub-fetch independently — a slow video shouldn't block the
      // header / vote-count panel from rendering.
      api.getSong(b.songId).then(setSong).catch(() => setSong(null));
      api.getVideo(b.performanceAId).then(setPerfA).catch(() => setPerfA(null));
      api.getVideo(b.performanceBId).then(setPerfB).catch(() => setPerfB(null));
    } catch (e: any) {
      setLoadError(e.message || 'Could not load this battle');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleClose = async () => {
    if (!battle) return;
    if (!confirm('Close this battle now?')) return;
    setWorking('close');
    setActionError(null);
    try {
      const updated = await api.closeBattle(battle.id);
      setBattle(updated);
    } catch (e: any) {
      setActionError(e.message || 'Could not close battle');
    } finally {
      setWorking(null);
    }
  };

  const handleCancel = async () => {
    if (!battle) return;
    if (!confirm('Cancel this battle? Stats will not be updated.')) return;
    setWorking('cancel');
    setActionError(null);
    try {
      const updated = await api.cancelBattle(battle.id);
      setBattle(updated);
    } catch (e: any) {
      setActionError(e.message || 'Could not cancel battle');
    } finally {
      setWorking(null);
    }
  };

  const handleResolveTie = async (winnerPerformanceId: string) => {
    if (!battle) return;
    setWorking(`tie-${winnerPerformanceId}`);
    setActionError(null);
    try {
      const updated = await api.resolveTie(battle.id, winnerPerformanceId);
      setBattle(updated);
    } catch (e: any) {
      setActionError(e.message || 'Could not resolve tie');
    } finally {
      setWorking(null);
    }
  };

  if (loadError) {
    return (
      <AdminShell>
        <div className="text-center py-16">
          <p className="font-display text-3xl font-bold mb-2">
            Couldn&apos;t load this battle
          </p>
          <p className="text-haze mb-6">{loadError}</p>
          <button
            type="button"
            onClick={() => router.push('/admin/battles')}
            className="px-5 py-2.5 bg-spotlight text-white font-bold rounded-md hover:bg-spotlight-dim transition-colors"
          >
            Back to battles
          </button>
        </div>
      </AdminShell>
    );
  }

  if (!battle) {
    return (
      <AdminShell>
        <StageLoader message="Loading battle…" />
      </AdminShell>
    );
  }

  const totalVotes = battle.totalVotes ?? 0;
  const winnerSide: 'A' | 'B' | null =
    battle.winnerPerformanceId === battle.performanceAId
      ? 'A'
      : battle.winnerPerformanceId === battle.performanceBId
        ? 'B'
        : null;

  return (
    <AdminShell>
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm">
        <Link href="/admin/battles" className="text-haze hover:text-white">
          ← Battles
        </Link>
      </nav>

      {/* Header */}
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <StatusBadge status={battle.status} />
          {battle.status === 'live' && (
            <CountdownTimer
              endsAt={battle.votingClosesAt}
              onExpired={load}
              size="compact"
            />
          )}
        </div>
        <h1 className="font-display font-black text-3xl md:text-4xl mb-2">
          {battle.title || (song ? `Battle · ${song.title}` : 'Untitled battle')}
        </h1>
        {song && (
          <p className="text-haze text-sm">
            <span className="text-haze/60">Centerstage Song:</span>{' '}
            <span className="font-semibold text-white">{song.title}</span>
            {song.artist && <span className="text-haze/60"> · {song.artist}</span>}
          </p>
        )}
      </header>

      {/* Action bar */}
      {(battle.status === 'live' || battle.status === 'needs_decision') && (
        <div className="mb-6 bg-stage-900 border border-stage-700/60 rounded-xl p-4 flex flex-wrap items-center gap-2">
          {battle.status === 'live' && (
            <>
              <button
                type="button"
                onClick={handleClose}
                disabled={!!working}
                className="px-4 py-2 text-sm font-bold rounded-md bg-stage-800 border border-stage-700 hover:border-spotlight/40 text-haze hover:text-white disabled:opacity-50 transition-colors"
              >
                {working === 'close' ? 'Closing…' : 'Close now'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={!!working}
                className="px-4 py-2 text-sm font-bold rounded-md bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
              >
                {working === 'cancel' ? 'Cancelling…' : 'Cancel battle'}
              </button>
            </>
          )}
          {battle.status === 'needs_decision' && perfA && perfB && (
            <>
              <span className="text-sm font-bold text-yellow-300 mr-2">
                Tied at {battle.voteCountA ?? 0} – {battle.voteCountB ?? 0}. Pick a winner:
              </span>
              <button
                type="button"
                onClick={() => handleResolveTie(perfA.id)}
                disabled={!!working}
                className="px-4 py-2 text-sm font-bold rounded-md bg-spotlight text-white disabled:opacity-50"
              >
                @{perfA.uploader?.username} wins
              </button>
              <button
                type="button"
                onClick={() => handleResolveTie(perfB.id)}
                disabled={!!working}
                className="px-4 py-2 text-sm font-bold rounded-md bg-gold text-stage-950 disabled:opacity-50"
              >
                @{perfB.uploader?.username} wins
              </button>
            </>
          )}
          {actionError && (
            <p className="basis-full text-xs text-red-400 mt-1">{actionError}</p>
          )}
        </div>
      )}

      {/* Winner callout */}
      {battle.status === 'completed' && winnerSide && (
        <div className="mb-6 bg-gold/10 border border-gold/30 rounded-xl p-5 flex items-start gap-4">
          <span className="text-2xl" aria-hidden="true">
            🏆
          </span>
          <div>
            <p className="text-xs uppercase tracking-widest text-gold font-bold mb-1">
              Winner
            </p>
            <p className="font-display text-xl font-bold">
              {winnerSide === 'A'
                ? `@${perfA?.uploader?.username ?? '—'}`
                : `@${perfB?.uploader?.username ?? '—'}`}
              <span className="text-haze font-normal text-sm ml-2">
                (Side {winnerSide})
              </span>
            </p>
            <p className="text-xs text-haze/70 mt-1">
              Final tally: {battle.voteCountA ?? 0} – {battle.voteCountB ?? 0}
              {battle.closedAt && (
                <span> · closed {new Date(battle.closedAt).toLocaleString()}</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Participants */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <ParticipantCard
          side="A"
          performance={perfA}
          voteCount={battle.voteCountA}
          percent={battle.percentA}
          totalVotes={totalVotes}
          isWinner={winnerSide === 'A'}
        />
        <ParticipantCard
          side="B"
          performance={perfB}
          voteCount={battle.voteCountB}
          percent={battle.percentB}
          totalVotes={totalVotes}
          isWinner={winnerSide === 'B'}
        />
      </div>

      {/* Meta panel */}
      <div className="bg-stage-900 border border-stage-700/60 rounded-xl p-5 grid sm:grid-cols-2 gap-4 text-sm">
        <Meta label="Battle ID" value={<code className="text-xs">{battle.id}</code>} />
        <Meta
          label="Total votes"
          value={<span className="tabular-nums">{totalVotes}</span>}
        />
        <Meta
          label="Created"
          value={new Date(battle.createdAt).toLocaleString()}
        />
        <Meta
          label="Voting opens"
          value={new Date(battle.votingOpensAt).toLocaleString()}
        />
        <Meta
          label="Voting closes"
          value={new Date(battle.votingClosesAt).toLocaleString()}
        />
        {battle.closedAt && (
          <Meta
            label="Closed at"
            value={new Date(battle.closedAt).toLocaleString()}
          />
        )}
      </div>
    </AdminShell>
  );
}

function StatusBadge({ status }: { status: BattleStatus }) {
  const tone =
    status === 'live'
      ? 'bg-spotlight/15 text-spotlight border-spotlight/40'
      : status === 'completed'
        ? 'bg-gold/15 text-gold border-gold/40'
        : status === 'needs_decision'
          ? 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40'
          : 'bg-stage-800 text-haze border-stage-700';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] uppercase tracking-widest font-bold rounded border ${tone}`}
    >
      {status === 'live' && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-spotlight opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-spotlight" />
        </span>
      )}
      {BATTLE_STATUS_LABELS[status]}
    </span>
  );
}

function ParticipantCard({
  side,
  performance,
  voteCount,
  percent,
  totalVotes,
  isWinner,
}: {
  side: 'A' | 'B';
  performance: VideoDto | null;
  voteCount: number | null;
  percent: number | null;
  totalVotes: number;
  isWinner: boolean;
}) {
  const accent =
    side === 'A' ? 'border-spotlight/40' : 'border-gold/40';
  const accentBar =
    side === 'A' ? 'bg-spotlight' : 'bg-gold';

  return (
    <div
      className={`bg-stage-900 border-2 rounded-xl overflow-hidden ${
        isWinner ? 'border-gold' : accent
      }`}
    >
      {performance ? (
        <div className="aspect-video bg-stage-950">
          <video
            src={performance.url}
            poster={performance.thumbnailUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="w-full h-full object-contain bg-black"
          />
        </div>
      ) : (
        <div className="aspect-video bg-stage-800 animate-pulse" />
      )}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] uppercase tracking-widest text-haze/60 font-bold">
            Side {side}
            {isWinner && (
              <span className="ml-2 text-gold">· Winner</span>
            )}
          </p>
          <p className="text-xs tabular-nums text-haze">
            {voteCount ?? 0} {voteCount === 1 ? 'vote' : 'votes'}
            {percent !== null && totalVotes > 0 && (
              <span className="ml-1 text-haze/60">({percent}%)</span>
            )}
          </p>
        </div>
        <p className="font-display font-bold text-lg leading-tight mb-1">
          {performance?.title ?? '—'}
        </p>
        {performance?.uploader && (
          <Link
            href={`/u/${performance.uploader.username}`}
            className="inline-flex items-center gap-2 text-sm text-haze hover:text-white"
          >
            @{performance.uploader.username}
            {performance.uploader.championTitle && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-gold/15 text-gold rounded">
                {performance.uploader.championTitle}
              </span>
            )}
          </Link>
        )}
        {/* Vote share bar */}
        <div className="mt-3 h-1.5 bg-stage-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${accentBar} transition-all`}
            style={{ width: `${percent ?? 0}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function Meta({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-haze/60 font-bold mb-0.5">
        {label}
      </p>
      <p className="text-sm">{value}</p>
    </div>
  );
}
