'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import { TableRowsSkeleton } from '@/components/Loaders';
import { AdminChallengeDto, ChallengeStatus, api } from '@/lib/api';
import { useConfirm } from '@/lib/confirm-context';

const PAGE_SIZE = 20;

type FilterStatus = ChallengeStatus | 'all' | 'needs_decision';

// Bug #10 follow-up — the previous "Open" tab returned pending + selected,
// then was tightened to pending-only, which made it visually identical to
// the dedicated "Pending" tab. Dropped the Open tab entirely; each tab now
// maps to exactly one underlying state, and "All" is the no-filter view.
// "Completed" added so finalized rows (selected → battle resolved) have a
// dedicated lane rather than only surfacing in "All".
// "Needs Decision" is a pseudo-filter (not a challenge status): joins on the
// resulting battle and surfaces challenge submissions whose linked battle
// is currently `needs_decision`. Without this the only way to reach tied
// Red Phone battles was through the Battles admin index, which admins had
// no reason to check while working the Red Phone queue.
const FILTERS: { value: FilterStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'selected', label: 'Selected' },
  { value: 'needs_decision', label: 'Needs decision' },
  { value: 'completed', label: 'Completed' },
  { value: 'rejected', label: 'Rejected' },
  // Terminal lane for `selected` rows an admin removed after the Champion
  // or Challenger performance was deleted. Kept distinct from Rejected so
  // the audit trail separates "we said no" from "plumbing fell apart".
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

/**
 * Admin Red Phone queue. The "emotional tension" hook: every pending row
 * is a person hoping to challenge the current champion. The row inlines
 * the challenger's username, their current win streak, and their video,
 * so the admin can scan and decide in a beat.
 */
export default function AdminChallengesPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<FilterStatus>('pending');
  const [items, setItems] = useState<AdminChallengeDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [working, setWorking] = useState<string | null>(null);
  // Per-row error map keyed by challenge id. Bug — errors used to land
  // in a single top banner, which hid which row triggered the failure
  // when the admin was scrolled below the fold or when multiple
  // consecutive actions raised different errors. Inline per-row errors
  // are self-locating and don't clobber each other.
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const setRowError = (id: string, message: string) =>
    setRowErrors((prev) => ({ ...prev, [id]: message }));
  const clearRowError = (id: string) =>
    setRowErrors((prev) => {
      if (!(id in prev)) return prev;
      const { [id]: _dropped, ...rest } = prev;
      return rest;
    });

  // Race-condition guard for rapid tab switching (Pending ↔ Selected
  // ↔ Needs decision). Each fetch captures an id; stale responses that
  // resolve after a newer tab click are discarded so the old tab's
  // rows can never flash under the new tab's label.
  const requestIdRef = useRef(0);

  const load = useCallback(
    async (reset: boolean) => {
      const id = ++requestIdRef.current;
      if (reset) {
        // Clear immediately — the pill highlight moves the moment the
        // admin clicks a new tab, and the list has to match. Any
        // in-flight request for the previous tab is invalidated by
        // the counter bump and its response will be discarded.
        setItems([]);
        setHasMore(false);
        setNextOffset(0);
        setLoading(true);
      } else {
        setLoadingMore(true);
      }
      try {
        // Read nextOffset off the closure — useCallback depends on it
        // below so this value is always current.
        const nextOff = reset ? 0 : nextOffset;
        const resp = await api.adminListChallenges({
          status: filter === 'all' ? undefined : filter,
          limit: PAGE_SIZE,
          offset: nextOff,
        });
        // Stale-response guard: a rapid tab switch will have bumped
        // the counter. Discard.
        if (id !== requestIdRef.current) return;
        // Functional updater so we don't capture `items` in the closure.
        // Without this, subsequent Load More clicks would spread an empty
        // (stale) items array, replacing the on-screen rows with just the
        // newly-fetched page.
        setItems((prev) => (reset ? resp.items : [...prev, ...resp.items]));
        setHasMore(resp.hasMore);
        setNextOffset(resp.nextOffset ?? nextOff + PAGE_SIZE);
      } finally {
        // Only the latest request may clear its own loading flag; a
        // stale one that resolved late must not turn off a spinner
        // that belongs to a newer, still-in-flight request.
        if (id === requestIdRef.current) {
          if (reset) setLoading(false);
          else setLoadingMore(false);
        }
      }
    },
    // nextOffset MUST be in the deps so paged "Load more" advances past
    // the first page. The useEffect below pins to [filter] only and uses
    // its own ESLint-disabled comment, so this change doesn't introduce
    // an infinite re-fetch loop.
    [filter, nextOffset],
  );

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Bug #66 — after marking a Pending row as Selected / Rejected, the
  // row used to be updated in place via `setItems(prev.map(...))`. Its
  // new status no longer matched the active tab filter, but because the
  // mapper preserved the row it kept rendering on the Pending tab
  // until a refresh. Replace the in-place map with a tab-aware
  // reconcile: if the new status no longer fits the current filter,
  // drop the row entirely; otherwise update in place (the "all" view
  // and a future "stay on the current status" case still work).
  const reconcileAfterStatusChange = useCallback(
    (updated: AdminChallengeDto) => {
      setItems((prev) => {
        if (filter === 'all') {
          return prev.map((c) => (c.id === updated.id ? updated : c));
        }
        if (updated.status !== filter) {
          return prev.filter((c) => c.id !== updated.id);
        }
        return prev.map((c) => (c.id === updated.id ? updated : c));
      });
    },
    [filter],
  );

  const handleSelect = async (id: string) => {
    clearRowError(id);
    setWorking(id);
    try {
      const updated = await api.adminSelectChallenge(id);
      reconcileAfterStatusChange(updated);
    } catch (e: any) {
      setRowError(id, e.message || 'Could not select challenge');
    } finally {
      setWorking(null);
    }
  };

  const handleReject = async (id: string) => {
    const ok = await confirm({
      title: 'Reject this challenge?',
      message: 'The challenger will be notified that they weren\'t picked this round.',
      confirmLabel: 'Reject',
      tone: 'danger',
    });
    if (!ok) return;
    clearRowError(id);
    setWorking(id);
    try {
      const updated = await api.adminRejectChallenge(id);
      reconcileAfterStatusChange(updated);
    } catch (e: any) {
      setRowError(id, e.message || 'Could not reject challenge');
    } finally {
      setWorking(null);
    }
  };

  const handlePromote = async (id: string) => {
    const ok = await confirm({
      title: 'Promote this challenger?',
      message: 'A new battle goes live immediately with voting open for 48 hours.',
      detail: 'Both performers get notified that the battle has started.',
      confirmLabel: 'Promote to battle',
    });
    if (!ok) return;
    clearRowError(id);
    setWorking(id);
    try {
      const battle = await api.adminCreateBattleFromChallenge(id, {});
      router.push(`/admin/battles/${battle.id}`);
    } catch (e: any) {
      setRowError(id, e.message || 'Could not create battle');
      setWorking(null);
    }
  };

  const handleRemove = async (id: string) => {
    const ok = await confirm({
      title: 'Remove this orphaned challenger?',
      message:
        "The Champion's performance is no longer available, so this challenge can never be promoted.",
      detail:
        'The challenger will be notified and the song will be free for a new challenger once a new champion appears.',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    clearRowError(id);
    setWorking(id);
    try {
      const updated = await api.adminCancelOrphanedChallenge(id);
      reconcileAfterStatusChange(updated);
    } catch (e: any) {
      setRowError(id, e.message || 'Could not remove challenge');
    } finally {
      setWorking(null);
    }
  };

  return (
    <AdminShell>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display font-black text-3xl mb-1">Red Phone</h1>
          <p className="text-haze">
            Challenger submissions for each Centerstage Song. Pick one to
            promote into the next battle.
          </p>
        </div>
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
          <p className="font-display text-2xl mb-2">No challenges in this view</p>
          <p className="text-haze">Try a different filter.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((c) => (
              <ChallengeRow
                key={c.id}
                challenge={c}
                busy={working === c.id}
                error={rowErrors[c.id]}
                onSelect={() => handleSelect(c.id)}
                onReject={() => handleReject(c.id)}
                onPromote={() => handlePromote(c.id)}
                onRemove={() => handleRemove(c.id)}
                onDismissError={() => clearRowError(c.id)}
              />
            ))}
          </ul>
          {hasMore && (
            <div className="flex justify-center mt-6">
              <button
                type="button"
                onClick={() => load(false)}
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

function ChallengeRow({
  challenge,
  busy,
  error,
  onSelect,
  onReject,
  onPromote,
  onRemove,
  onDismissError,
}: {
  challenge: AdminChallengeDto;
  busy: boolean;
  error?: string;
  onSelect: () => void;
  onReject: () => void;
  onPromote: () => void;
  onRemove: () => void;
  onDismissError: () => void;
}) {
  const showRemove =
    challenge.status === 'selected' &&
    !challenge.resultingBattleId &&
    challenge.isOrphaned;
  return (
    <li
      className={`bg-stage-900 border rounded-xl p-4 md:p-5 flex flex-wrap items-start justify-between gap-4 ${
        challenge.status === 'pending'
          ? 'border-spotlight/30'
          : challenge.status === 'selected'
            ? showRemove
              ? 'border-red-500/40'
              : 'border-gold/40'
            : 'border-stage-600 opacity-70'
      }`}
    >
      {/* Left: video preview + meta */}
      <div className="flex gap-3 flex-1 min-w-[260px]">
        {challenge.video?.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={challenge.video.thumbnailUrl}
            alt=""
            className="w-32 aspect-video object-cover rounded-md bg-stage-800"
          />
        ) : (
          <div className="w-32 aspect-video bg-stage-800 rounded-md" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <StatusBadge status={challenge.status} />
            {showRemove && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase tracking-widest font-bold bg-red-500/15 text-red-300 border border-red-500/40 rounded">
                {/* Badge label reflects WHICH side is unavailable — the
                    previous version always read "Champion unavailable"
                    even when only the challenger's video was deleted,
                    misleading admins about which side to fix. */}
                {challenge.orphanReason === 'challenger_deleted'
                  ? 'Challenger unavailable'
                  : challenge.orphanReason === 'both_deleted'
                    ? 'Both unavailable'
                    : challenge.orphanReason === 'no_champion'
                      ? 'No champion yet'
                      : 'Champion unavailable'}
              </span>
            )}
            <span className="text-xs text-haze tabular-nums">
              {new Date(challenge.createdAt).toLocaleDateString()}
            </span>
          </div>
          <p className="font-display font-bold text-base leading-tight mb-1 truncate">
            {challenge.video?.title ?? 'Performance'}
          </p>
          <p className="text-xs text-haze">
            {challenge.user ? (
              <Link
                href={`/u/${challenge.user.username}`}
                className="hover:text-white"
              >
                @{challenge.user.username}
              </Link>
            ) : (
              <span className="italic">unknown user</span>
            )}
            {challenge.user && challenge.user.currentStreak >= 2 && (
              <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] uppercase tracking-widest font-bold bg-gold/15 text-gold rounded">
                🔥 {challenge.user.currentStreak} streak
              </span>
            )}
          </p>
          <p className="text-xs text-haze/70 mt-1 break-words line-clamp-2">
            on{' '}
            <span className="text-white font-semibold">
              {challenge.song?.title ?? '—'}
            </span>
            {challenge.song?.artist && (
              <span className="text-haze/60"> · {challenge.song.artist}</span>
            )}
          </p>
        </div>
      </div>

      {/* Right: actions */}
      <div className="flex flex-wrap gap-2 items-center">
        {challenge.status === 'pending' && (
          <>
            <ActionButton onClick={onSelect} disabled={busy} variant="primary">
              Select
            </ActionButton>
            <ActionButton onClick={onReject} disabled={busy} variant="danger">
              Reject
            </ActionButton>
          </>
        )}
        {/* Promote is only offered while the pairing is still valid;
            once orphaned, the Remove action replaces it so admin can
            clean the queue without hitting the promote-time error. */}
        {challenge.status === 'selected' &&
          !challenge.resultingBattleId &&
          !challenge.isOrphaned && (
            <ActionButton onClick={onPromote} disabled={busy} variant="gold">
              {busy ? 'Promoting…' : 'Promote → battle'}
            </ActionButton>
          )}
        {showRemove && (
          <ActionButton onClick={onRemove} disabled={busy} variant="danger">
            {busy ? 'Removing…' : 'Remove'}
          </ActionButton>
        )}
        {challenge.status === 'selected' && challenge.resultingBattleId && (
          <Link
            href={`/admin/battles/${challenge.resultingBattleId}`}
            className="px-3 py-1.5 text-xs font-bold rounded-md bg-stage-800 border border-stage-700 hover:border-spotlight/40 text-haze hover:text-white transition-colors"
          >
            View battle →
          </Link>
        )}
      </div>

      {/* Inline row error — self-locating so admin doesn't have to guess
          which row failed. Full-width so it always wraps to its own line
          below the actions regardless of viewport. `role="alert"` +
          `aria-live` ensures screen readers announce it on set. */}
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="w-full mt-1 flex items-start justify-between gap-3 rounded-md border border-red-500/40 bg-red-500/10 text-red-200 px-3 py-2 text-xs"
        >
          <span className="flex-1">{error}</span>
          <button
            type="button"
            onClick={onDismissError}
            aria-label="Dismiss error"
            className="shrink-0 text-red-300 hover:text-white text-base leading-none"
          >
            ×
          </button>
        </div>
      )}
    </li>
  );
}

function StatusBadge({ status }: { status: ChallengeStatus }) {
  const tone =
    status === 'pending'
      ? 'bg-spotlight/15 text-spotlight border-spotlight/40'
      : status === 'selected'
        ? 'bg-gold/15 text-gold border-gold/40'
        : status === 'completed'
          ? 'bg-stage-800 text-haze/80 border-stage-700'
          : status === 'cancelled'
            ? 'bg-red-500/10 text-red-300 border-red-500/30'
            : 'bg-stage-800 text-haze border-stage-700';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-widest font-bold rounded border ${tone}`}
    >
      {status}
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
  variant?: 'default' | 'primary' | 'danger' | 'gold';
}) {
  const base =
    'px-3 py-1.5 text-xs font-bold rounded-md transition-colors disabled:opacity-50';
  const colors =
    variant === 'danger'
      ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30'
      : variant === 'primary'
        ? 'bg-spotlight text-white hover:bg-spotlight-dim'
        : variant === 'gold'
          ? 'bg-gold text-stage-950 hover:opacity-90'
          : 'bg-stage-800 text-haze hover:text-white border border-stage-700 hover:border-spotlight/40';
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${colors}`}>
      {children}
    </button>
  );
}
