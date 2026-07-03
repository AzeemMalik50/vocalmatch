'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

  // Debounce search. The placeholder advertises "@username" support so
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
                        // Bug #98 — carry `status` through the
                        // optimistic patch so the row's chip can
                        // immediately show the new active /
                        // retired state after a reassign.
                        status: s.status,
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
      <div className="bg-stage-900/60 border border-stage-600 rounded-xl p-3 mb-5 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search title, song, or @username"
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

      {/* Action-result alert. Sticky-positioned at the top of the page
          content so it stays visible even when the admin is scrolled
          deep in the list and clicks Assign / Soft-delete on a row that
          fails (e.g. the backend returns 409 for an already-retired
          song or a performance in an active battle). Plain `<p>` was
          easy to miss because the click happens far below the page top. */}
      {actionError && (
        <div
          role="alert"
          aria-live="assertive"
          className="sticky top-2 z-30 mb-3 bg-red-900/40 backdrop-blur border border-red-500/60 rounded-md shadow-xl px-4 py-3 flex items-start gap-3"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="w-5 h-5 text-red-300 shrink-0 mt-0.5"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-widest font-bold text-red-200 mb-0.5">
              Action failed
            </p>
            <p className="text-sm text-red-50 leading-snug break-words">
              {actionError}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Dismiss"
            className="shrink-0 text-red-200 hover:text-white transition-colors p-1"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
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
        <div className="flex justify-center mt-8 mb-4">
          {/* Bug #70 — the previous styling (bg-stage-800 + border-stage-700)
              was nearly invisible against the dark dashboard chrome.
              Bumped to a spotlight-bordered secondary action with a
              chevron-down icon, stronger padding, focus ring, and
              hover fill so it reads as a clear "load more below" CTA. */}
          <button
            type="button"
            onClick={() => load(false)}
            disabled={loading}
            className="group inline-flex items-center gap-2 px-7 py-3 bg-stage-900 border-2 border-spotlight/60 text-spotlight font-bold uppercase tracking-widest text-xs rounded-md shadow-md shadow-spotlight/10 hover:bg-spotlight/10 hover:border-spotlight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spotlight focus-visible:ring-offset-2 focus-visible:ring-offset-stage-950 disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load more'}
            {!loading && (
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="transition-transform group-hover:translate-y-0.5"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            )}
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
      className={`bg-stage-900 border rounded-xl p-4 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-start sm:justify-between gap-3 ${
        perf.deletedAt
          ? 'border-red-500/30 opacity-60'
          : 'border-stage-600'
      }`}
    >
      <div className="min-w-0 w-full sm:w-auto sm:flex-1">
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
          {/* "In active battle" is a lock-status hint for admins deciding
              whether they can safely reassign the song. It's meaningless
              when the performance is already deleted — a deleted row can't
              be reassigned regardless of what battle it used to be in,
              and showing both labels reads as a contradiction ("deleted
              AND live"). Suppress it on soft-deleted rows so only the
              terminal state renders. */}
          {perf.activeBattleId && !perf.deletedAt && (
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
        {/* Visibility pass — pills used to render at /10–/15 bg opacity
            on stage-900 which made the song name + No-song badges nearly
            invisible. Bumped to /25 fills with stronger borders and
            tightened the text shades to colors with real contrast on
            dark backgrounds. */}
        {/* Bug #58 follow-up — the linked-song pill used the spotlight
            (orange-red) palette, which read as the same warning tone
            as the red "No song linked" pill alongside it; admins
            couldn't tell at a glance which rows were healthy and
            which weren't. Linked is the default/positive state and
            now uses a neutral emerald palette, so only the genuine
            warning rows (unlinked-legacy yellow, no-song red) draw
            the eye. */}
        <div className="mt-2">
          {/* Bug #98 — four states now (was three):
              - linked + active   → emerald (healthy)
              - linked + retired  → amber + explicit "Song retired —
                please reassign" so admin treats it as a triage item
              - legacy songTitle text but no song record → yellow
              - no song at all   → red */}
          {perf.song && perf.song.status === 'retired' ? (
            <div className="flex flex-col gap-1 max-w-full">
              {/* Retired-song row — cleaner visual hierarchy: the song
                  info is dimmed + struck-through (signal: no longer
                  in the active catalog), and "RETIRED" becomes a
                  proper status pill with its own background and
                  warning icon, anchored to the right of the row so
                  it reads as a badge rather than another inline
                  text fragment. */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-500/15 border border-amber-400/50 max-w-full">
                <Music
                  aria-hidden="true"
                  className="w-4 h-4 text-amber-300/70 shrink-0"
                />
                <div className="flex items-baseline gap-1.5 min-w-0 flex-1">
                  <span className="text-sm font-bold text-amber-50/80 line-through truncate">
                    {perf.song.title}
                  </span>
                  <span className="text-xs text-amber-100/65 truncate">
                    · {perf.song.artist}
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] uppercase tracking-widest font-bold bg-amber-500/30 text-amber-50 border border-amber-300/60 rounded shrink-0 leading-none">
                  <svg
                    aria-hidden="true"
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  Retired
                </span>
              </div>
              <p className="text-[11px] text-amber-200/90 leading-snug">
                ⚠ This song has been retired. Please reassign this
                performance to an active Centerstage Song.
              </p>
            </div>
          ) : perf.song ? (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-400/50 max-w-full">
              <Music
                aria-hidden="true"
                className="w-3.5 h-3.5 text-emerald-300 shrink-0"
              />
              <span className="text-sm font-bold text-emerald-50 truncate">
                {perf.song.title}
              </span>
              <span className="text-xs font-semibold text-emerald-100/85 truncate">
                · {perf.song.artist}
              </span>
            </span>
          ) : (
            // No formal song link. Previously we forked into two chips
            // here: a yellow "<songTitle> · UNLINKED" when the legacy
            // free-text title existed, and a red "No song linked"
            // otherwise. The split was misleading because the yellow
            // chip showed a real song name that wasn't actually
            // associated with anything — admins read it as a link.
            // Collapsed into the single "No song linked" red chip; the
            // legacy songTitle is preserved as a hover tooltip so the
            // historical text isn't lost during triage.
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-500/25 border border-red-400/70"
              title={
                perf.songTitle
                  ? `Uploader originally tagged this as "${perf.songTitle}"`
                  : undefined
              }
            >
              <Music
                aria-hidden="true"
                className="w-3.5 h-3.5 text-red-200 shrink-0"
              />
              <span className="text-sm font-bold text-red-50 uppercase tracking-wide">
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
              disabled={busy || !!perf.activeBattleId || !!perf.deletedAt}
              title={
                perf.deletedAt
                  ? 'This performance is deleted. Restore it before changing the song link.'
                  : perf.activeBattleId
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
                Delete
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
  // Only active songs are valid assign targets — the backend rejects
  // retired ones with a 409. We still surface the *currently linked*
  // song when it has since been retired, but as a disabled option
  // labelled "(retired)" so the admin sees why their previous selection
  // can't be reused. The "(clear song link)" option stays available so
  // they can detach the row entirely.
  const activeSongs = songs.filter((s) => s.status === 'active');
  const currentSong = currentId
    ? songs.find((s) => s.id === currentId) ?? null
    : null;
  const showRetiredCurrent =
    !!currentSong && currentSong.status === 'retired';

  // Bug #39 — the previous `flex` row overflowed the parent container
  // on narrow widths, pushing the Cancel button off the right edge.
  // `flex-wrap` + `min-w-0` on the select lets the row reflow onto a
  // second line so all three controls stay fully visible.
  //
  // Follow-up — the outer container needed an explicit width too. The
  // parent row-action column has no width constraint, so a `flex-1`
  // select stretched unbounded and shoved Save + Cancel past the
  // `<li>`'s right border. `w-full sm:w-96 max-w-full` caps the
  // picker at 384px on desktop while filling the full row width on
  // mobile (where the actions column already sits on its own line).
  return (
    <div className="flex flex-wrap items-center gap-2 w-full sm:w-96 max-w-full">
      <select
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="min-w-0 flex-1 max-w-full px-3 py-1.5 text-xs bg-stage-900 border border-stage-700 rounded-md focus:outline-none focus:border-spotlight"
      >
        <option value="">(clear song link)</option>
        { showRetiredCurrent && currentSong && (
          <option value={currentSong.id} disabled>
            {currentSong.title} — {currentSong.artist} (retired)
          </option>
        )}
        {activeSongs.map((s) => (
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
