'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  BattleStatus,
  ChallengeSubmissionDto,
  SongDto,
  api,
} from '@/lib/api';

/**
 * "My pending challenges" — shown on the user's own profile.
 *
 * Reads /me/challenges and joins to /songs (one cached fetch) so each row
 * can show the song title without a per-row roundtrip. Only renders when
 * there's at least one row — the empty state is suppressed so we don't
 * clutter a brand-new user's profile.
 */
export default function MyChallenges() {
  const [items, setItems] = useState<ChallengeSubmissionDto[]>([]);
  const [songsById, setSongsById] = useState<Map<string, SongDto>>(new Map());
  // Bug #8 — challenges that had been promoted to a battle kept showing
  // "Your battle is live →" indefinitely, even after the battle closed
  // and the challenger had won the crown. We now fetch the actual
  // battle status for every challenge linked to a battle and surface
  // it on the row so the copy + link match the finalized state.
  const [battleStatuses, setBattleStatuses] = useState<
    Map<string, { status: BattleStatus; winnerPerformanceId: string | null }>
  >(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [resp, songsResp] = await Promise.all([
          api.listMyChallenges(),
          // Catalog is small in Phase 2B; one fetch beats per-row lookups.
          api.listSongs('all'),
        ]);
        if (cancelled) return;
        setItems(resp.items);
        setSongsById(new Map(songsResp.items.map((s) => [s.id, s])));

        // Resolve battle status for any challenge that has been promoted.
        const battleIds = resp.items
          .map((c) => c.resultingBattleId)
          .filter((x): x is string => !!x);
        if (battleIds.length > 0) {
          const battles = await Promise.all(
            battleIds.map((id) =>
              api.getBattle(id).catch(() => null),
            ),
          );
          if (cancelled) return;
          const next = new Map<
            string,
            { status: BattleStatus; winnerPerformanceId: string | null }
          >();
          for (const b of battles) {
            if (b) {
              next.set(b.id, {
                status: b.status,
                winnerPerformanceId: b.winnerPerformanceId ?? null,
              });
            }
          }
          setBattleStatuses(next);
        }
      } catch {
        // Non-fatal — section just won't render.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;
  if (items.length === 0) return null;

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-end justify-between">
        <div>
          <h2 className="font-display text-2xl md:text-3xl font-bold">
            Your challenges
          </h2>
          <p className="text-sm text-haze/70 mt-1">
            Submissions you've sent to the Red Phone queue.
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {items.map((c) => {
          const linkedBattle = c.resultingBattleId
            ? battleStatuses.get(c.resultingBattleId)
            : null;
          const isFinalized =
            linkedBattle?.status === 'completed' ||
            linkedBattle?.status === 'cancelled';
          // Border tone follows the resolved battle state, not the
          // stale challenge status.
          const borderTone = isFinalized
            ? 'border-stage-700/60'
            : c.status === 'selected'
              ? 'border-gold/40'
              : c.status === 'rejected'
                ? 'border-stage-700/60 opacity-70'
                : 'border-spotlight/30';
          return (
            <li
              key={c.id}
              className={`bg-stage-900 border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 ${borderTone}`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <StatusBadge
                    status={c.status}
                    battleStatus={linkedBattle?.status ?? null}
                  />
                  <span className="text-xs text-haze tabular-nums">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {/* break-words + line-clamp-2 so long song titles wrap
                    inside the profile card and never bleed past the
                    row's right edge (which used to happen for
                    absurdly-long titles or titles containing a very
                    long word / URL). */}
                <p className="text-sm break-words line-clamp-2">
                  <span className="text-haze/60">Song:</span>{' '}
                  <span className="font-bold">
                    {songsById.get(c.songId)?.title ?? '—'}
                  </span>
                  {songsById.get(c.songId)?.artist && (
                    <span className="text-haze/60">
                      {' '}
                      · {songsById.get(c.songId)!.artist}
                    </span>
                  )}
                </p>
                {c.status === 'selected' && !c.resultingBattleId && (
                  <p className="text-xs text-gold mt-1">
                    Picked — admin will start the battle shortly.
                  </p>
                )}
                {c.resultingBattleId && linkedBattle?.status === 'live' && (
                  <p className="text-xs mt-1">
                    <Link
                      href={`/battle/${c.resultingBattleId}`}
                      className="text-gold font-bold hover:opacity-90"
                    >
                      Your battle is live →
                    </Link>
                  </p>
                )}
                {c.resultingBattleId &&
                  linkedBattle?.status === 'needs_decision' && (
                    <p className="text-xs mt-1 text-yellow-200">
                      Tied — waiting on admin decision.
                    </p>
                  )}
                {c.resultingBattleId &&
                  linkedBattle?.status === 'completed' && (
                    <p className="text-xs mt-1">
                      <Link
                        href={`/battle/${c.resultingBattleId}`}
                        className="text-haze font-bold hover:text-white"
                      >
                        Battle completed — see the result →
                      </Link>
                    </p>
                  )}
                {c.resultingBattleId &&
                  linkedBattle?.status === 'cancelled' && (
                    <p className="text-xs mt-1 text-haze/70">
                      Battle was cancelled by admin.
                    </p>
                  )}
                {c.status === 'rejected' && (
                  <p className="text-xs text-haze/60 mt-1">
                    Not picked this round. Try again next time.
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StatusBadge({
  status,
  battleStatus,
}: {
  status: ChallengeSubmissionDto['status'];
  battleStatus: BattleStatus | null;
}) {
  // Bug #8 — once a battle has been promoted from a challenge and
  // finalized, the challenge badge should reflect the finalized state,
  // not the stale "You're next up" copy from the selection step.
  let label: string;
  let tone: string;
  if (battleStatus === 'completed') {
    label = 'Battle completed';
    tone = 'bg-stage-800 text-haze border-stage-700';
  } else if (battleStatus === 'cancelled') {
    label = 'Battle cancelled';
    tone = 'bg-stage-800 text-haze border-stage-700';
  } else if (battleStatus === 'live') {
    label = 'Battle live';
    tone = 'bg-gold/15 text-gold border-gold/40';
  } else if (battleStatus === 'needs_decision') {
    label = 'Tie — awaiting decision';
    tone = 'bg-yellow-500/15 text-yellow-100 border-yellow-300/60';
  } else if (status === 'pending') {
    label = 'In review';
    tone = 'bg-spotlight/15 text-spotlight border-spotlight/40';
  } else if (status === 'selected') {
    label = "You're next up";
    tone = 'bg-gold/15 text-gold border-gold/40';
  } else {
    label = 'Not picked';
    tone = 'bg-stage-800 text-haze border-stage-700';
  }
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-widest font-bold rounded border ${tone}`}
    >
      {label}
    </span>
  );
}
