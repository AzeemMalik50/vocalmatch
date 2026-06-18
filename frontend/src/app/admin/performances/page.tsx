'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Music } from 'lucide-react';
import AdminShell from '@/components/AdminShell';
import { TableRowsSkeleton } from '@/components/Loaders';
import {
  AdminPerformanceDto,
  SongDto,
  api,
} from '@/lib/api';
import { useConfirm } from '@/lib/confirm-context';

const PAGE_SIZE = 25;

/**
 * Admin performances triage. Lists uploads, lets admins backfill the
 * Centerstage Song link on legacy/QA uploads, and soft-delete if needed.
 */
export default function AdminPerformancesPage() {
  const [items, setItems] = useState<AdminPerformanceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [missingSong, setMissingSong] = useState(false);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [songs, setSongs] = useState<SongDto[]>([]);
  const [working, setWorking] = useState<string | null>(null);
  const confirm = useConfirm();
  const [actionError, setActionError] = useState<string | null>(null);

  // Debounce search. The placeholder advertises "@uploader" support so
  // we strip a leading "@" before sending — the backend stores usernames
  // without the prefix and matching against "@foo" returned nothing.
  useEffect(() => {
    const t = setTimeout(
      () => setDebouncedSearch(search.trim().replace(/^@+/, '')),
      300,
    );
    return () => clearTimeout(t);
  }, [search]);

  // Load songs once for the assign-song picker
  useEffect(() => {
    api
      .listSongs('all')
      .then((r) => setSongs(r.items))
      .catch(() => setSongs([]));
  }, []);

  // Bug #32 — "Load more" appeared dead because `load` was memoized
  // with stale `items` and `offset` closures (they weren't in the
  // dependency list). Switched to functional setItems + read the
  // current offset from React state directly so each "Load more" click
  // truly advances pagination.
  const load = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      try {
        const currentOffset = reset ? 0 : offset;
        const resp = await api.adminListPerformances({
          search: debouncedSearch || undefined,
          missingSong: missingSong || undefined,
          includeDeleted: includeDeleted || undefined,
          limit: PAGE_SIZE,
          offset: currentOffset,
        });
        setItems((prev) =>
          reset ? resp.items : [...prev, ...resp.items],
        );
        setHasMore(resp.hasMore);
        setOffset(resp.nextOffset ?? currentOffset + PAGE_SIZE);
      } finally {
        setLoading(false);
      }
    },
    // `offset` intentionally in deps so "Load more" sees the latest
    // pagination cursor; `items` uses the functional updater so we
    // don't need it as a dep (avoiding a refetch on every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debouncedSearch, missingSong, includeDeleted, offset],
  );

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, missingSong, includeDeleted]);

  const handleAssign = async (id: string, songId: string | null) => {
    setWorking(id);
    setActionError(null);
    try {
      const updated = await api.adminAssignPerformanceSong(id, songId);
      setItems((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                songId: updated.songId,
                songTitle: updated.songTitle,
                song: updated.songId
                  ? songs
                      .filter((s) => s.id === updated.songId)
                      .map((s) => ({
                        id: s.id,
                        title: s.title,
                        artist: s.artist,
                      }))[0] ?? null
                  : null,
              }
            : p,
        ),
      );
    } catch (e: any) {
      setActionError(e.message || 'Could not assign song');
    } finally {
      setWorking(null);
    }
  };

  const handleSoftDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Hide this performance?',
      message: 'It will be removed from the public feed and the uploader\'s profile, but battle history stays intact.',
      confirmLabel: 'Hide it',
      tone: 'danger',
    });
    if (!ok) return;
    setWorking(id);
    setActionError(null);
    try {
      const updated = await api.adminSoftDeletePerformance(id);
      setItems((prev) =>
        prev.map((p) => (p.id === id ? { ...p, deletedAt: updated.deletedAt } : p)),
      );
    } catch (e: any) {
      setActionError(e.message || 'Could not delete performance');
    } finally {
      setWorking(null);
    }
  };

  return (
    <AdminShell>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display font-black text-3xl mb-1">Performances</h1>
          <p className="text-haze">
            Triage uploads — assign a Centerstage Song to legacy or QA
            performances and soft-delete content that doesn't belong.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-stage-900/60 border border-stage-700/60 rounded-xl p-3 mb-5 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, song, or @uploader"
          className="flex-1 min-w-[200px] px-3 py-2 bg-stage-900 border border-stage-700 rounded-md text-sm focus:outline-none focus:border-spotlight transition-colors"
        />
        <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold cursor-pointer">
          <input
            type="checkbox"
            checked={missingSong}
            onChange={(e) => setMissingSong(e.target.checked)}
            className="accent-spotlight"
          />
          Missing song only
        </label>
        <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold cursor-pointer">
          <input
            type="checkbox"
            checked={includeDeleted}
            onChange={(e) => setIncludeDeleted(e.target.checked)}
            className="accent-spotlight"
          />
          Show deleted
        </label>
      </div>

      {actionError && (
        <p className="text-sm text-red-400 mb-3">{actionError}</p>
      )}

      {loading && items.length === 0 ? (
        <TableRowsSkeleton rows={4} />
      ) : items.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-stage-700 rounded-2xl">
          <p className="font-display text-2xl mb-2">No performances</p>
          <p className="text-haze">Try a different filter.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((p) => (
            <PerformanceRow
              key={p.id}
              perf={p}
              songs={songs}
              busy={working === p.id}
              onAssign={(songId) => handleAssign(p.id, songId)}
              onSoftDelete={() => handleSoftDelete(p.id)}
            />
          ))}
        </ul>
      )}

      {hasMore && (
        <div className="flex justify-center mt-6">
          <button
            type="button"
            onClick={() => load(false)}
            disabled={loading}
            className="px-5 py-2.5 bg-stage-800 border border-stage-700 hover:border-spotlight/40 font-bold rounded-md transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </AdminShell>
  );
}

function PerformanceRow({
  perf,
  songs,
  busy,
  onAssign,
  onSoftDelete,
}: {
  perf: AdminPerformanceDto;
  songs: SongDto[];
  busy: boolean;
  onAssign: (songId: string | null) => void;
  onSoftDelete: () => void;
}) {
  const [picking, setPicking] = useState(false);
  return (
    <li
      className={`bg-stage-900 border rounded-xl p-4 flex flex-wrap items-start justify-between gap-3 ${
        perf.deletedAt
          ? 'border-red-500/30 opacity-60'
          : 'border-stage-700/60'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <p className="font-bold text-white">{perf.title}</p>
          {/* Deleted status stays in the title row since it changes the
              meaning of every other field; the "No song" badge moved
              into the dedicated song pill below, which is more informative
              than a status chip on its own. */}
          {perf.deletedAt && (
            <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-red-500/25 text-red-50 border border-red-400/70 font-bold">
              Deleted
            </span>
          )}
          {perf.activeBattleId && (
            <Link
              href={`/admin/battles/${perf.activeBattleId}`}
              title="Locked while a live or tie-pending battle uses this performance"
              className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-spotlight/15 text-spotlight border border-spotlight/40 font-bold hover:bg-spotlight/25 transition-colors"
            >
              In active battle
            </Link>
          )}
        </div>
        <p className="text-xs text-haze">
          {perf.uploader ? (
            <Link
              href={`/u/${perf.uploader.username}`}
              className="hover:text-white"
            >
              @{perf.uploader.username}
            </Link>
          ) : (
            <span className="italic">no uploader</span>
          )}
          <span className="text-haze/60">
            {' '}
            · uploaded {new Date(perf.createdAt).toLocaleDateString()}
          </span>
          <span className="text-haze/60">
            {' · '}
            <span className={perf.voteCount > 0 ? 'text-spotlight font-semibold' : ''}>
              {perf.voteCount} {perf.voteCount === 1 ? 'vote' : 'votes'}
            </span>
          </span>
          <span className="text-haze/60">
            {' · '}
            {perf.viewCount} {perf.viewCount === 1 ? 'view' : 'views'}
          </span>
        </p>
        {/* Song pill — every performance row now shows the linked song
            (or absence of one) as a clearly visible chip with a music
            icon, so admins can scan-read the song-to-performance mapping
            at a glance. Three states: linked, unlinked legacy text,
            no song. */}
        <div className="mt-2">
          {perf.song ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-spotlight/10 border border-spotlight/40 max-w-full">
              <Music
                aria-hidden="true"
                className="w-3.5 h-3.5 text-spotlight shrink-0"
              />
              <span className="text-sm font-semibold text-white truncate">
                {perf.song.title}
              </span>
              <span className="text-xs text-haze/85 truncate">
                · {perf.song.artist}
              </span>
            </span>
          ) : perf.songTitle ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-yellow-500/15 border border-yellow-300/60 max-w-full">
              <Music
                aria-hidden="true"
                className="w-3.5 h-3.5 text-yellow-100 shrink-0"
              />
              <span className="text-sm font-semibold text-yellow-50 truncate">
                {perf.songTitle}
              </span>
              <span className="text-[10px] uppercase tracking-widest text-yellow-100/90 font-bold">
                · Unlinked
              </span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-500/15 border border-red-400/60">
              <Music
                aria-hidden="true"
                className="w-3.5 h-3.5 text-red-100 shrink-0"
              />
              <span className="text-sm font-semibold text-red-50">
                No song linked
              </span>
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {picking ? (
          <SongPicker
            songs={songs}
            currentId={perf.songId}
            onCancel={() => setPicking(false)}
            onPick={(id) => {
              setPicking(false);
              onAssign(id);
            }}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => setPicking(true)}
              disabled={busy || !!perf.activeBattleId}
              title={
                perf.activeBattleId
                  ? 'Resolve or cancel the active battle before changing the song link.'
                  : undefined
              }
              className="px-3 py-1.5 text-xs font-bold rounded-md bg-stage-800 border border-stage-700 hover:border-spotlight/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {perf.songId ? 'Reassign song' : 'Assign song'}
            </button>
            {!perf.deletedAt && (
              <button
                type="button"
                onClick={onSoftDelete}
                disabled={busy}
                className="px-3 py-1.5 text-xs font-bold rounded-md bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
              >
                Soft-delete
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function SongPicker({
  songs,
  currentId,
  onPick,
  onCancel,
}: {
  songs: SongDto[];
  currentId: string | null;
  onPick: (songId: string | null) => void;
  onCancel: () => void;
}) {
  const [val, setVal] = useState(currentId ?? '');
  // Bug #39 — the previous `flex` row overflowed the parent container
  // on narrow widths, pushing the Cancel button off the right edge.
  // `flex-wrap` + `min-w-0` on the select lets the row reflow onto a
  // second line so all three controls stay fully visible.
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="min-w-0 flex-1 max-w-full px-3 py-1.5 text-xs bg-stage-900 border border-stage-700 rounded-md focus:outline-none focus:border-spotlight"
      >
        <option value="">(clear song link)</option>
        {songs.map((s) => (
          <option key={s.id} value={s.id}>
            {s.title} — {s.artist}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => onPick(val || null)}
        className="shrink-0 px-3 py-1.5 text-xs font-bold rounded-md bg-spotlight text-white"
      >
        Save
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="shrink-0 px-3 py-1.5 text-xs font-bold rounded-md bg-stage-800 border border-stage-700 text-haze"
      >
        Cancel
      </button>
    </div>
  );
}
