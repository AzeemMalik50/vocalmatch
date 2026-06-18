'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import { TableRowsSkeleton } from '@/components/Loaders';
import { useConfirm } from '@/lib/confirm-context';
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

const PAGE_SIZE = 20;

export default function AdminBattlesPage() {
  return (
    <Suspense
      fallback={
        <AdminShell>
          <TableRowsSkeleton rows={4} />
        </AdminShell>
      }
    >
      <AdminBattlesPageInner />
    </Suspense>
  );
}

function AdminBattlesPageInner() {
  const searchParams = useSearchParams();
  // Bug #43 — Backstage's "Needs your decision" list deep-links here as
  // `/admin/battles?focus=<id>`. The previous default filter was always
  // `live`, so admins landed on the wrong tab and had to manually switch
  // to find the battle they just clicked. We resolve the focus target's
  // status once and default the filter accordingly. The row also gets a
  // brief scroll-into-view + highlight so the right battle is obvious.
  const focusId = searchParams?.get('focus') ?? null;
  const [filter, setFilter] = useState<FilterStatus>(
    focusId ? 'needs_decision' : 'live',
  );
  const [items, setItems] = useState<BattleSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [working, setWorking] = useState<string | null>(null);
  const confirm = useConfirm();
  const focusedRef = useRef<HTMLLIElement | null>(null);

  // Resolve the focused battle's actual status the first time we mount
  // with `?focus=`, so the filter lands on the right tab regardless of
  // status (a focus into a completed battle still works, etc.).
  useEffect(() => {
    if (!focusId) return;
    let cancelled = false;
    api
      .getBattle(focusId)
      .then((b) => {
        if (cancelled) return;
        setFilter(b.status === 'live' ? 'live' : b.status);
      })
      .catch(() => {
        /* fall through — keep the default needs_decision tab */
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId]);

  // Scroll to the focused row once items have loaded.
  useEffect(() => {
    if (!focusId || loading) return;
    const node = focusedRef.current;
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusId, loading, items]);

  const load = async (status: FilterStatus) => {
    setLoading(true);
    try {
      const resp = await api.listBattles({
        status: status === 'all' ? undefined : status,
        limit: PAGE_SIZE,
        offset: 0,
      });
      setItems(resp.items);
      setHasMore(resp.hasMore);
      setNextOffset(resp.nextOffset ?? 0);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const resp = await api.listBattles({
        status: filter === 'all' ? undefined : filter,
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      setItems((prev) => [...prev, ...resp.items]);
      setHasMore(resp.hasMore);
      setNextOffset(resp.nextOffset ?? nextOffset + PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    load(filter);
  }, [filter]);

  const handleClose = async (id: string) => {
    const ok = await confirm({
      title: 'Close this battle now?',
      message: 'Voting will stop immediately and the current standings decide the winner.',
      confirmLabel: 'Close now',
    });
    if (!ok) return;
    setWorking(id);
    try {
      await api.closeBattle(id);
      await load(filter);
    } finally {
      setWorking(null);
    }
  };

  const handleCancel = async (id: string) => {
    const ok = await confirm({
      title: 'Cancel this battle?',
      message: 'Voting will stop and the battle ends with no winner.',
      detail: 'Stats won\'t be updated — neither performer gets credited.',
      confirmLabel: 'Cancel battle',
      cancelLabel: 'Keep it live',
      tone: 'danger',
    });
    if (!ok) return;
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
        <>
          <ul className="space-y-3">
            {items.map((b) => {
              const isFocused = focusId === b.id;
              return (
                <li
                  key={b.id}
                  ref={isFocused ? focusedRef : null}
                  className={
                    isFocused
                      ? 'ring-2 ring-yellow-400/70 ring-offset-2 ring-offset-stage-950 rounded-2xl'
                      : ''
                  }
                >
                  <BattleRow
                    battle={b}
                    busy={working === b.id}
                    onClose={() => handleClose(b.id)}
                    onCancel={() => handleCancel(b.id)}
                    onResolved={() => load(filter)}
                  />
                </li>
              );
            })}
          </ul>
          {hasMore && (
            <div className="flex justify-center mt-6">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="px-5 py-2.5 bg-stage-800 border border-stage-700 hover:border-spotlight/40 font-bold rounded-md transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
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
    // Returns a div now (was a li) so the parent ul can wrap each row in
    // its own li for focus highlighting; nesting <li> inside <li> would
    // be invalid HTML.
    <div className="relative bg-stage-900 border border-stage-700/60 rounded-xl p-4 md:p-5 hover:border-spotlight/40 transition-colors">
      {/* Full-card click target. Sits behind action buttons (z-0 vs z-10)
          so clicks on Close/Cancel/Resolve don't trigger navigation. */}
      <Link
        href={`/admin/battles/${battle.id}`}
        aria-label={`Open ${battle.title || 'battle'}`}
        className="absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-spotlight"
      />
      <div className="relative z-0 flex flex-wrap items-start justify-between gap-3 pointer-events-none">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge status={battle.status} />
            <span className="text-xs text-haze tabular-nums">
              {new Date(battle.createdAt).toLocaleDateString()}
            </span>
          </div>
          <p className="font-display font-bold text-lg">
            {battle.title || 'Untitled battle'}
          </p>
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

        {/* Action buttons re-enable pointer events and sit above the link. */}
        <div className="relative z-10 pointer-events-auto flex flex-wrap gap-2">
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
    </div>
  );
}

function StatusBadge({ status }: { status: BattleStatus }) {
  // Bug #38 — needs_decision badge sat at yellow-300 on a 15% yellow
  // wash, which fell well under the 4.5:1 contrast minimum against the
  // dark theme. Tightened to yellow-100 on a 25% wash with a stronger
  // border so the "this needs you" signal actually reads.
  const tone =
    status === 'live'
      ? 'bg-spotlight/15 text-spotlight border-spotlight/40'
      : status === 'completed'
        ? 'bg-gold/15 text-gold border-gold/40'
        : status === 'needs_decision'
          ? 'bg-yellow-500/25 text-yellow-100 border-yellow-300/70'
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
        // Bug #38 — see StatusBadge comment. Same low-contrast pattern
        // applied here.
        className="px-3 py-1.5 text-xs font-bold rounded-md bg-yellow-500/25 text-yellow-100 border border-yellow-300/70 hover:bg-yellow-500/35 transition-colors"
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
