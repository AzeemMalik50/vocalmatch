'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminShell from '@/components/AdminShell';
import { TableRowsSkeleton } from '@/components/Loaders';
import {
  api,
  BattleSummaryDto,
  BattleStatus,
  BATTLE_STATUS_LABELS,
  VideoDto,
} from '@/lib/api';

type FilterStatus = BattleStatus | 'all';

const FILTERS: { value: FilterStatus; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'needs_decision', label: 'Needs decision' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

export default function AdminBattlesPage() {
  const [filter, setFilter] = useState<FilterStatus>('live');
  const [items, setItems] = useState<BattleSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const load = async (status: FilterStatus) => {
    setLoading(true);
    try {
      const resp = await api.listBattles({
        status: status === 'all' ? undefined : status,
      });
      setItems(resp.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(filter);
  }, [filter]);

  const handleClose = async (id: string) => {
    if (!confirm('Close this battle now?')) return;
    setWorking(id);
    try {
      await api.closeBattle(id);
      await load(filter);
    } finally {
      setWorking(null);
    }
  };

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this battle? Stats will not be updated.')) return;
    setWorking(id);
    try {
      await api.cancelBattle(id);
      await load(filter);
    } finally {
      setWorking(null);
    }
  };

  return (
    <AdminShell>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display font-black text-3xl mb-1">Battles</h1>
          <p className="text-haze">Create, monitor, close, or resolve ties.</p>
        </div>
        <Link
          href="/admin/battles/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-spotlight text-white font-bold rounded-md hover:bg-spotlight-dim transition-colors"
        >
          + New battle
        </Link>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${
              filter === f.value
                ? 'bg-spotlight text-white'
                : 'bg-stage-900 border border-stage-700 text-haze hover:text-white'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <TableRowsSkeleton rows={4} />
      ) : items.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-stage-700 rounded-2xl">
          <p className="font-display text-2xl mb-2">No battles in this view</p>
          <p className="text-haze">Try a different filter, or create one.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((b) => (
            <BattleRow
              key={b.id}
              battle={b}
              busy={working === b.id}
              onClose={() => handleClose(b.id)}
              onCancel={() => handleCancel(b.id)}
              onResolved={() => load(filter)}
            />
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

function BattleRow({
  battle,
  busy,
  onClose,
  onCancel,
  onResolved,
}: {
  battle: BattleSummaryDto;
  busy: boolean;
  onClose: () => void;
  onCancel: () => void;
  onResolved: () => void;
}) {
  return (
    <li className="bg-stage-900 border border-stage-700/60 rounded-xl p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={battle.status} />
            <span className="text-xs text-haze tabular-nums">
              {new Date(battle.createdAt).toLocaleDateString()}
            </span>
          </div>
          <Link
            href={`/battle/${battle.id}`}
            className="font-display font-bold text-lg hover:text-spotlight transition-colors"
          >
            {battle.title || 'Untitled battle'}
          </Link>
          <p className="text-xs text-haze mt-1 tabular-nums">
            {battle.status === 'live' && (
              <>Closes {new Date(battle.votingClosesAt).toLocaleString()}</>
            )}
            {battle.status === 'completed' && battle.closedAt && (
              <>Completed {new Date(battle.closedAt).toLocaleString()}</>
            )}
            {battle.status === 'cancelled' && battle.closedAt && (
              <>Cancelled {new Date(battle.closedAt).toLocaleString()}</>
            )}
            {battle.status === 'needs_decision' && (
              <>Awaiting your decision</>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {battle.status === 'live' && (
            <>
              <ActionButton onClick={onClose} disabled={busy}>
                Close now
              </ActionButton>
              <ActionButton onClick={onCancel} disabled={busy} variant="danger">
                Cancel
              </ActionButton>
            </>
          )}
          {battle.status === 'needs_decision' && (
            <ResolveTieControl battleId={battle.id} onResolved={onResolved} />
          )}
        </div>
      </div>
    </li>
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
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-widest font-bold rounded border ${tone}`}
    >
      {BATTLE_STATUS_LABELS[status]}
    </span>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
  variant = 'default',
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
  variant?: 'default' | 'danger';
}) {
  const base =
    'px-3 py-1.5 text-xs font-bold rounded-md transition-colors disabled:opacity-50';
  const colors =
    variant === 'danger'
      ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30'
      : 'bg-stage-800 text-haze hover:text-white border border-stage-700 hover:border-spotlight/40';
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${colors}`}>
      {children}
    </button>
  );
}

/**
 * Inline tie-resolution control. Loads the battle's two performances and
 * lets the admin pick which one wins.
 */
function ResolveTieControl({
  battleId,
  onResolved,
}: {
  battleId: string;
  onResolved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [a, setA] = useState<VideoDto | null>(null);
  const [b, setB] = useState<VideoDto | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const expand = async () => {
    setOpen(true);
    setError(null);
    try {
      const battle = await api.getBattle(battleId);
      const [pa, pb] = await Promise.all([
        api.getVideo(battle.performanceAId),
        api.getVideo(battle.performanceBId),
      ]);
      setA(pa);
      setB(pb);
    } catch (e: any) {
      setError(e.message || 'Could not load battle');
    }
  };

  const pick = async (performanceId: string) => {
    setPicking(performanceId);
    setError(null);
    try {
      await api.resolveTie(battleId, performanceId);
      onResolved();
    } catch (e: any) {
      setError(e.message || 'Could not resolve tie');
      setPicking(null);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={expand}
        className="px-3 py-1.5 text-xs font-bold rounded-md bg-yellow-500/15 text-yellow-300 border border-yellow-500/40 hover:bg-yellow-500/25 transition-colors"
      >
        Resolve tie
      </button>
    );
  }

  if (!a || !b) {
    return <span className="text-xs text-haze">Loading…</span>;
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => pick(a.id)}
          disabled={!!picking}
          className="px-3 py-1.5 text-xs font-bold rounded-md bg-spotlight text-white disabled:opacity-50"
        >
          @{a.uploader?.username} wins
        </button>
        <button
          type="button"
          onClick={() => pick(b.id)}
          disabled={!!picking}
          className="px-3 py-1.5 text-xs font-bold rounded-md bg-gold text-stage-950 disabled:opacity-50"
        >
          @{b.uploader?.username} wins
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 text-xs font-bold rounded-md bg-stage-800 text-haze border border-stage-700"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
