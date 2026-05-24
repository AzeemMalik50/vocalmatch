'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChallengeSubmissionDto, SongDto, api } from '@/lib/api';

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
        {items.map((c) => (
          <li
            key={c.id}
            className={`bg-stage-900 border rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 ${
              c.status === 'selected'
                ? 'border-gold/40'
                : c.status === 'rejected'
                  ? 'border-stage-700/60 opacity-70'
                  : 'border-spotlight/30'
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <StatusBadge status={c.status} />
                <span className="text-xs text-haze tabular-nums">
                  {new Date(c.createdAt).toLocaleDateString()}
                </span>
              </div>
              <p className="text-sm">
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
              {c.status === 'selected' && c.resultingBattleId && (
                <p className="text-xs mt-1">
                  <Link
                    href={`/battle/${c.resultingBattleId}`}
                    className="text-gold font-bold hover:opacity-90"
                  >
                    Your battle is live →
                  </Link>
                </p>
              )}
              {c.status === 'rejected' && (
                <p className="text-xs text-haze/60 mt-1">
                  Not picked this round. Try again next time.
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusBadge({
  status,
}: {
  status: ChallengeSubmissionDto['status'];
}) {
  const label =
    status === 'pending'
      ? 'In review'
      : status === 'selected'
        ? "You're next up"
        : 'Not picked';
  const tone =
    status === 'pending'
      ? 'bg-spotlight/15 text-spotlight border-spotlight/40'
      : status === 'selected'
        ? 'bg-gold/15 text-gold border-gold/40'
        : 'bg-stage-800 text-haze border-stage-700';
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-widest font-bold rounded border ${tone}`}
    >
      {label}
    </span>
  );
}
