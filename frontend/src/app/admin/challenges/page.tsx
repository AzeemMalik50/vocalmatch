'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import { TableRowsSkeleton } from '@/components/Loaders';
import { AdminChallengeDto, ChallengeStatus, api } from '@/lib/api';
import { useConfirm } from '@/lib/confirm-context';

const PAGE_SIZE = 20;

type FilterStatus = ChallengeStatus | 'all';

// Bug #10 follow-up — the previous "Open" tab returned pending + selected,
// then was tightened to pending-only, which made it visually identical to
// the dedicated "Pending" tab. Dropped the Open tab entirely; each tab now
// maps to exactly one underlying state, and "All" is the no-filter view.
const FILTERS: { value: FilterStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'selected', label: 'Selected' },
  { value: 'rejected', label: 'Rejected' },
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
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (reset: boolean) => {
      if (reset) setLoading(true);
      else setLoadingMore(true);
      try {
        const nextOff = reset ? 0 : nextOffset;
        const resp = await api.adminListChallenges({
          status: filter === 'all' ? undefined : filter,
          limit: PAGE_SIZE,
          offset: nextOff,
        });
        setItems(reset ? resp.items : [...items, ...resp.items]);
        setHasMore(resp.hasMore);
        setNextOffset(resp.nextOffset ?? nextOff + PAGE_SIZE);
      } finally {
        if (reset) setLoading(false);
        else setLoadingMore(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filter],
  );

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const handleSelect = async (id: string) => {
    setWorking(id);
    setError(null);
    try {
      const updated = await api.adminSelectChallenge(id);
      setItems((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (e: any) {
      setError(e.message || 'Could not select challenge');
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
    setWorking(id);
    setError(null);
    try {
      const updated = await api.adminRejectChallenge(id);
      setItems((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (e: any) {
      setError(e.message || 'Could not reject challenge');
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
    setWorking(id);
    setError(null);
    try {
      const battle = await api.adminCreateBattleFromChallenge(id, {});
      router.push(`/admin/battles/${battle.id}`);
    } catch (e: any) {
      setError(e.message || 'Could not create battle');
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

      {error && (
        <div className="mb-4 text-sm text-red-300 bg-red-950/40 border border-red-900/40 rounded-md px-4 py-3">
          {error}
        </div>
      )}

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
                onSelect={() => handleSelect(c.id)}
                onReject={() => handleReject(c.id)}
                onPromote={() => handlePromote(c.id)}
              />
            ))}
          </ul>
          {hasMore && (
            <div className="flex justify-center mt-6">
              <button
                type="button"
                onClick={() => load(false)}
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

function ChallengeRow({
  challenge,
  busy,
  onSelect,
  onReject,
  onPromote,
}: {
  challenge: AdminChallengeDto;
  busy: boolean;
  onSelect: () => void;
  onReject: () => void;
  onPromote: () => void;
}) {
  return (
    <li
      className={`bg-stage-900 border rounded-xl p-4 md:p-5 flex flex-wrap items-start justify-between gap-4 ${
        challenge.status === 'pending'
          ? 'border-spotlight/30'
          : challenge.status === 'selected'
            ? 'border-gold/40'
            : 'border-stage-700/60 opacity-70'
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
          <p className="text-xs text-haze/70 mt-1">
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
        {challenge.status === 'selected' && !challenge.resultingBattleId && (
          <ActionButton onClick={onPromote} disabled={busy} variant="gold">
            {busy ? 'Promoting…' : 'Promote → battle'}
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
