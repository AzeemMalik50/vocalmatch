'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import { TableRowsSkeleton } from '@/components/Loaders';
import { useConfirm } from '@/lib/confirm-context';
import { useLobby } from '@/lib/useLobby';
import {
  api,
  BattleDto,
  BattleSummaryDto,
  BattleStatus,
  BATTLE_STATUS_LABELS,
  VideoDto,
} from '@/lib/api';

type FilterStatus = BattleStatus | 'all';
/**
 * Bug #82 — separate filter axis for "where did this battle come from?"
 * Independent of the status filter so admin can ask things like "show
 * me all completed Red Phone battles" or "show me live manual ones."
 */
type SourceFilter = 'all' | 'challenge' | 'manual';

const FILTERS: { value: FilterStatus; label: string }[] = [
  { value: 'live', label: 'Live' },
  { value: 'needs_decision', label: 'Needs decision' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

const SOURCE_FILTERS: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: 'Any source' },
  { value: 'challenge', label: '📞 Red Phone' },
  { value: 'manual', label: 'Manual' },
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
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [items, setItems] = useState<BattleSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [working, setWorking] = useState<string | null>(null);
  const confirm = useConfirm();
  const focusedRef = useRef<HTMLLIElement | null>(null);
  // Monotonically-increasing request id. Every list fetch captures the
  // id at dispatch and only writes its response back into state when
  // its id still matches. Guards against the tab-flicker bug — an
  // admin rapidly switching Selected ↔ Needs Decision could see the
  // previous tab's rows flash under the new tab if a slower earlier
  // response resolved after a newer one. With this guard, stale
  // responses are silently discarded.
  const requestIdRef = useRef(0);

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

  /**
   * Load the current page of battles.
   *
   * `reset` distinguishes the *why* of the reload:
   *   true  — filter/tab changed → clear old items immediately + show
   *           the skeleton so the admin never sees the previous tab's
   *           rows under a new tab label.
   *   false — silent background refetch (lobby SSE, post-action) →
   *           keep the current list on screen and swap when the
   *           response lands, so an admin who's mid-scroll doesn't get
   *           yanked back to a full-page skeleton on every real-time
   *           event.
   */
  const load = async (
    status: FilterStatus,
    source: SourceFilter,
    reset: boolean = true,
  ) => {
    const id = ++requestIdRef.current;
    if (reset) {
      // Clear immediately — the pill highlight moves the moment the
      // admin clicks a new tab, and the list below has to match. Any
      // in-flight response for the OLD tab is invalidated by the
      // request-id bump above and will be discarded when it lands.
      setItems([]);
      setHasMore(false);
      setNextOffset(0);
      setLoading(true);
    }
    try {
      const resp = await api.listBattles({
        status: status === 'all' ? undefined : status,
        source: source === 'all' ? undefined : source,
        limit: PAGE_SIZE,
        offset: 0,
      });
      // Stale response guard — a rapid tab switch (or a lobby event
      // that fired mid-fetch) will have bumped the counter. Ignore.
      if (id !== requestIdRef.current) return;
      setItems(resp.items);
      setHasMore(resp.hasMore);
      setNextOffset(resp.nextOffset ?? 0);
    } finally {
      // Only the latest request may flip the loading spinner off; a
      // stale one that resolved late must not clear a spinner that
      // belongs to a newer, still-in-flight request.
      if (id === requestIdRef.current) setLoading(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    // Same request-id counter — a tab switch mid-pagination must not
    // append the old tab's next page onto the new tab's list.
    const id = ++requestIdRef.current;
    setLoadingMore(true);
    try {
      const resp = await api.listBattles({
        status: filter === 'all' ? undefined : filter,
        source: sourceFilter === 'all' ? undefined : sourceFilter,
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      if (id !== requestIdRef.current) return;
      setItems((prev) => [...prev, ...resp.items]);
      setHasMore(resp.hasMore);
      setNextOffset(resp.nextOffset ?? nextOffset + PAGE_SIZE);
    } finally {
      if (id === requestIdRef.current) setLoadingMore(false);
    }
  };

  useEffect(() => {
    // Filter/tab change: reset = true so old rows clear instantly.
    void load(filter, sourceFilter, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, sourceFilter]);

  // Real-time refresh — any battle lifecycle (create / cancel / close /
  // tie) re-fetches the current filter view so the list never goes
  // stale. `reset = false` so the admin's current view isn't yanked
  // into a full-page skeleton on every SSE tick — the new data slides
  // in when it arrives.
  useLobby(() => {
    void load(filter, sourceFilter, false);
  });

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
      // Silent refetch — the admin just clicked a button, no need to
      // flash the skeleton on top of that already-obvious feedback.
      await load(filter, sourceFilter, false);
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
      await load(filter, sourceFilter, false);
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
      <div className="flex flex-wrap gap-2 mb-3">
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

      {/* Source filter — second axis. Combines with the status filter
          above, so e.g. (Completed) × (Red Phone) shows completed
          Red-Phone-promoted battles only. */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-[10px] uppercase tracking-widest font-bold text-haze/60 mr-1">
          Source:
        </span>
        {SOURCE_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setSourceFilter(f.value)}
            className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${
              sourceFilter === f.value
                ? 'bg-yellow-500/25 text-yellow-100 border border-yellow-300/60'
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
                    onResolved={() => load(filter, sourceFilter, false)}
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
                className="group inline-flex items-center gap-2 px-7 py-3 bg-stage-900 border-2 border-spotlight/60 text-spotlight font-bold uppercase tracking-widest text-xs rounded-md shadow-md shadow-spotlight/10 hover:bg-spotlight/10 hover:border-spotlight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spotlight focus-visible:ring-offset-2 focus-visible:ring-offset-stage-950 disabled:opacity-50"
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
    <div className="relative bg-stage-900 border border-stage-600 rounded-xl p-4 md:p-5 hover:border-spotlight/40 transition-colors">
      {/* Full-card click target. Sits behind action buttons (z-0 vs z-10)
          so clicks on Close/Cancel/Resolve don't trigger navigation. */}
      <Link
        href={`/admin/battles/${battle.id}`}
        aria-label={`Open ${battle.title || 'battle'}`}
        className="absolute inset-0 z-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-spotlight"
      />
      <div className="relative z-0 flex flex-wrap items-start justify-between gap-3 pointer-events-none">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <StatusBadge status={battle.status} />
            {/* Bug #82 — visual marker so admin can scan-spot which
                battles originated from a Red Phone challenge promotion
                vs. a direct admin create. Pairs with the source filter
                above. */}
            {battle.fromChallenge && (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-widest font-bold rounded border bg-yellow-500/15 text-yellow-200 border-yellow-400/40"
                title="Promoted from a Red Phone challenge"
              >
                📞 Red Phone
              </span>
            )}
            <span className="text-xs text-haze tabular-nums">
              {new Date(battle.createdAt).toLocaleDateString()}
            </span>
          </div>
          <p className="font-display font-bold text-lg">
            {battle.title || 'Untitled battle'}
          </p>
          {/* Timeline row — always show when voting opened (Started),
              then the status-specific companion line. Lets admins see
              start + close windows side by side without opening the
              detail page, matching the timeline metadata available
              elsewhere in the console. */}
          <div className="text-xs text-haze mt-1 tabular-nums space-y-0.5">
            <p>
              <span className="text-haze/60">Started:</span>{' '}
              {new Date(battle.votingOpensAt).toLocaleString()}
            </p>
            {battle.status === 'live' && (
              <p>
                <span className="text-haze/60">Closes:</span>{' '}
                {new Date(battle.votingClosesAt).toLocaleString()}
              </p>
            )}
            {battle.status === 'completed' && battle.closedAt && (
              <p>
                <span className="text-haze/60">Completed:</span>{' '}
                {new Date(battle.closedAt).toLocaleString()}
              </p>
            )}
            {battle.status === 'cancelled' && battle.closedAt && (
              <p>
                <span className="text-haze/60">Cancelled:</span>{' '}
                {new Date(battle.closedAt).toLocaleString()}
              </p>
            )}
            {battle.status === 'needs_decision' && (
              <p>Awaiting your decision</p>
            )}
          </div>
          {/* Engagement stats — admin-only. Total votes + Side A vs Side B
              so admins can scan-spot high-engagement battles without
              opening each row. Rendered only when the backend populated
              the fields (admin-authenticated) and there is at least one
              vote to talk about; a fresh 0–0 live battle stays clean. */}
          {battle.totalVotes !== null &&
            battle.voteCountA !== null &&
            battle.voteCountB !== null && (
              <VoteStats
                total={battle.totalVotes}
                a={battle.voteCountA}
                b={battle.voteCountB}
              />
            )}
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

/**
 * At-a-glance engagement row for the admin battle card. Shows total
 * votes plus a Side A / Side B split with a slim proportional bar so
 * the admin can visually gauge which battles are tight vs. lopsided
 * without opening each one.
 */
function VoteStats({ total, a, b }: { total: number; a: number; b: number }) {
  // Zero-vote battles skip the split bar — a 0/0 divisor would render
  // a solid Side-B bar and lie about the state. Show the counts only.
  const percentA = total > 0 ? Math.round((a / total) * 100) : 0;
  const percentB = total > 0 ? 100 - percentA : 0;
  const leading =
    a > b ? 'A' : b > a ? 'B' : total > 0 ? 'tie' : 'none';
  // Bug — `max-w-xs` was only a cap, letting the container shrink to the
  // width of its widest sibling (usually the battle title). Short titles
  // gave a narrow bar; long titles gave a wide bar — same vote counts,
  // different visual widths. Pin the container to a fixed 288px so every
  // row's bar renders identically; `max-w-full` still lets the container
  // shrink on very narrow viewports where 288px would overflow the card.
  return (
    <div className="mt-2 flex flex-col gap-1 w-72 max-w-full">
      <div className="flex items-center gap-3 text-xs tabular-nums">
        <span className="font-bold text-white">
          {total.toLocaleString()} {total === 1 ? 'vote' : 'votes'}
        </span>
        <span className="text-haze">·</span>
        <span
          className={
            leading === 'A' ? 'font-bold text-spotlight' : 'text-haze'
          }
        >
          A {a.toLocaleString()}
        </span>
        <span className="text-haze/50">vs</span>
        <span
          className={leading === 'B' ? 'font-bold text-gold' : 'text-haze'}
        >
          B {b.toLocaleString()}
        </span>
      </div>
      {total > 0 && (
        <div
          className="flex h-1 w-full overflow-hidden rounded-full bg-stage-800"
          aria-hidden="true"
        >
          <div className="bg-spotlight" style={{ width: `${percentA}%` }} />
          <div className="bg-gold" style={{ width: `${percentB}%` }} />
        </div>
      )}
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
  // Bug #86 — the previous version used `Promise.all` on both video
  // fetches, so if either performance had been soft-deleted the
  // 404 rejected the whole load and the "Loading…" placeholder
  // spun forever (the render branch `if (!a || !b) return Loading…`
  // never resolved). Track the BATTLE itself separately, use
  // `Promise.allSettled` for the videos so one 404 doesn't sink
  // the other, and key the loading state on a `loaded` flag rather
  // than the (potentially-null) video shapes. The pick handler now
  // sources its performance id from the battle row directly, so
  // admin can still resolve a tie even when one side's video is
  // gone — they're just picking the surviving performance.
  const [battle, setBattle] = useState<BattleDto | null>(null);
  const [a, setA] = useState<VideoDto | null>(null);
  const [b, setB] = useState<VideoDto | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const expand = async () => {
    setOpen(true);
    setError(null);
    setLoaded(false);
    try {
      const b = await api.getBattle(battleId);
      setBattle(b);
      const [paRes, pbRes] = await Promise.allSettled([
        api.getVideo(b.performanceAId),
        api.getVideo(b.performanceBId),
      ]);
      setA(paRes.status === 'fulfilled' ? paRes.value : null);
      setB(pbRes.status === 'fulfilled' ? pbRes.value : null);
    } catch (e: any) {
      // Battle lookup itself failed — surface it, but don't strand
      // the UI in Loading… forever.
      setError(e.message || 'Could not load battle');
    } finally {
      setLoaded(true);
    }
  };

  const pick = async (performanceId: string) => {
    setPicking(performanceId);
    setError(null);
    try {
      await api.resolveTie(battleId, performanceId);
      // Bug #68 — `setPicking(null)` lived only in the catch branch,
      // so on a successful resolve the local "picking" flag stayed
      // truthy forever, keeping both winner buttons disabled and the
      // UI pinned in a faux-loading state. The parent's `onResolved`
      // refetches the list, but the component does not always
      // unmount before the user reads the stuck buttons (the
      // skeleton swap depends on render timing, and on the All / Live
      // tabs the row stays mounted because the battle is now
      // `completed`, just with a different action column). Close the
      // control + clear `picking` explicitly on success so the
      // disabled state can't persist regardless of what the parent
      // chooses to do.
      setOpen(false);
      onResolved();
    } catch (e: any) {
      setError(e.message || 'Could not resolve tie');
    } finally {
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

  if (!loaded) {
    return <span className="text-xs text-haze">Loading…</span>;
  }

  // Battle itself failed to load — show the error + a way to retry/dismiss.
  if (!battle) {
    return (
      <div className="flex flex-col gap-2 w-full">
        <p className="text-xs text-red-400">
          {error ?? 'Could not load battle.'}
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="self-start px-3 py-1.5 text-xs font-bold rounded-md bg-stage-800 text-haze border border-stage-700"
        >
          Close
        </button>
      </div>
    );
  }

  // For each side, label by uploader if the video loaded; fall back to a
  // "Side X (deleted)" label when the video 404'd. Admin can still pick
  // the surviving performance as winner.
  const labelA = a?.uploader?.username
    ? `@${a.uploader.username} wins`
    : 'Side A (deleted) wins';
  const labelB = b?.uploader?.username
    ? `@${b.uploader.username} wins`
    : 'Side B (deleted) wins';

  return (
    // Right-aligned column so the action buttons sit flush with the
    // right edge of the battle row's action area, matching the
    // placement of every other admin row's controls. The
    // deleted-performance info message and error feedback right-align
    // too so the whole block reads as a single right-anchored stack
    // rather than letting the message visually "push" the buttons left.
    <div className="flex flex-col gap-2 w-full items-end">
      <div className="flex flex-wrap gap-2 justify-end">
        {/* Disable a side when ONLY that side is deleted — admin must
            pick the surviving performance as winner. When BOTH sides
            are deleted, both remain selectable so admin can release
            the streak update against either side. */}
        <button
          type="button"
          onClick={() => pick(battle.performanceAId)}
          disabled={!!picking || (!a && !!b)}
          title={
            !a && !!b
              ? 'Side A was deleted — pick the surviving side as winner.'
              : undefined
          }
          className="px-3 py-1.5 text-xs font-bold rounded-md bg-spotlight text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {labelA}
        </button>
        <button
          type="button"
          onClick={() => pick(battle.performanceBId)}
          disabled={!!picking || (!b && !!a)}
          title={
            !b && !!a
              ? 'Side B was deleted — pick the surviving side as winner.'
              : undefined
          }
          className="px-3 py-1.5 text-xs font-bold rounded-md bg-gold text-stage-950 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {labelB}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="px-3 py-1.5 text-xs font-bold rounded-md bg-stage-800 text-haze border border-stage-700"
        >
          Cancel
        </button>
      </div>
      {!a && !b ? (
        <p className="text-[11px] text-yellow-300 text-right max-w-2xl">
          Both performances have been deleted; you can still pick a winner
          from either deleted side to release the streak update.
        </p>
      ) : (!a || !b) ? (
        <p className="text-[11px] text-yellow-300 text-right max-w-2xl">
          One performance has been deleted; you can still pick a winner —
          the surviving side will take the crown.
        </p>
      ) : null}
      {error && <p className="text-xs text-red-400 text-right">{error}</p>}
    </div>
  );
}
