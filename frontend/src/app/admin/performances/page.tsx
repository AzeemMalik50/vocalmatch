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

  // Race-condition guard — three independent filter axes (search,
  // missingSong, includeDeleted) mean an admin can flip several
  // toggles in quick succession. Each fetch captures the request id;
  // stale responses that resolve after a newer filter change are
  // discarded so the previous filter's rows never flash under the
  // new filter state.
  const requestIdRef = useRef(0);

  // Bug #32 — "Load more" appeared dead because `load` was memoized
  // with stale `items` and `offset` closures (they weren't in the
  // dependency list). Switched to functional setItems + read the
  // current offset from React state directly so each "Load more" click
  // truly advances pagination.
  const load = useCallback(
    async (reset: boolean) => {
      const id = ++requestIdRef.current;
      if (reset) {
        // Clear immediately so the previous filter's rows don't flash
        // under the new filter state. Also resets pagination cursor.
        setItems([]);
        setHasMore(false);
        setOffset(0);
      }
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
        // Stale-response guard.
        if (id !== requestIdRef.current) return;
        setItems((prev) =>
          reset ? resp.items : [...prev, ...resp.items],
        );
        setHasMore(resp.hasMore);
        setOffset(resp.nextOffset ?? currentOffset + PAGE_SIZE);
      } finally {
        if (id === requestIdRef.current) setLoading(false);
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
  // `flex-wrap` + `min-w-0` on the trigger let the row reflow onto a
  // second line so all three controls stay fully visible.
  //
  // Follow-up — the outer container needed an explicit width too. The
  // parent row-action column has no width constraint, so an unbounded
  // trigger would shove Save + Cancel past the `<li>`'s right border.
  // Caps the picker at `sm:w-96` on desktop while filling the full row
  // width on mobile (where the actions column already sits on its own
  // line). The dropdown popup itself is decoupled from this width so
  // long song titles can render fully in the list — see SongCombobox.
  return (
    <div className="flex flex-wrap items-center gap-2 w-full sm:w-96 max-w-full">
      <SongCombobox
        value={val}
        onChange={setVal}
        activeSongs={activeSongs}
        showRetiredCurrent={showRetiredCurrent ? currentSong : null}
      />
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

/**
 * Searchable song picker for the reassign row. Replaces the native
 * `<select>` because:
 *   1. The native dropdown was rendered at the trigger's width, so
 *      long song titles were truncated in the popup. QA data with a
 *      pathological "Zubin Garg Zubin Garg…" style repeated title
 *      exposed this loudly.
 *   2. There was no way to type-to-search across 25+ songs — admins
 *      had to scroll and read every option.
 *
 * This combobox: (a) shows a filter input inside the popup, (b) opens
 * *wider* than the trigger (`min-w-[24rem]`) so long titles fit,
 * (c) wraps titles instead of truncating, and (d) supports keyboard
 * nav (arrows, enter, escape).
 */
function SongCombobox({
  value,
  onChange,
  activeSongs,
  showRetiredCurrent,
}: {
  value: string;
  onChange: (id: string) => void;
  activeSongs: SongDto[];
  showRetiredCurrent: SongDto | null;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selected =
    activeSongs.find((s) => s.id === value) ??
    (showRetiredCurrent && showRetiredCurrent.id === value ? showRetiredCurrent : null);

  // Filtered list. Includes the "(clear song link)" sentinel at the top
  // and any retired current selection as a disabled row. Type-ahead
  // filters by title OR artist so admins can find "Selena Gomez" fast.
  const q = query.trim().toLowerCase();
  const matches = q
    ? activeSongs.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.artist.toLowerCase().includes(q),
      )
    : activeSongs;

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Reset the highlighted row every time the filter changes so the
  // first visible match is always the enter-key default.
  useEffect(() => {
    setActiveIdx(0);
  }, [q]);

  // Focus the filter input as soon as the popup opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const pick = (id: string) => {
    onChange(id);
    setOpen(false);
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // +1 accounts for the "(clear song link)" row at index 0.
    const total = matches.length + 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % total);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + total) % total);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIdx === 0) pick('');
      else pick(matches[activeIdx - 1].id);
    }
  };

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1 max-w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left px-3 py-1.5 text-xs bg-stage-900 border border-stage-700 rounded-md focus:outline-none focus:border-spotlight flex items-center justify-between gap-2"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">
          {selected
            ? `${selected.title} — ${selected.artist}${
                selected.status === 'retired' ? ' (retired)' : ''
              }`
            : '(clear song link)'}
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
          className="shrink-0 text-haze"
        >
          <path
            d="M2 3.5l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {open && (
        <div
          className="absolute z-30 mt-1 left-0 w-full min-w-[24rem] max-w-[36rem] bg-stage-900 border border-stage-600 rounded-md shadow-xl overflow-hidden"
          role="listbox"
        >
          <div className="p-2 border-b border-stage-700">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search title or artist…"
              className="w-full px-2 py-1.5 text-xs bg-stage-950 border border-stage-700 rounded focus:outline-none focus:border-spotlight"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1 text-xs">
            {/* Clear-link sentinel — always available. */}
            <li>
              <button
                type="button"
                onClick={() => pick('')}
                onMouseEnter={() => setActiveIdx(0)}
                className={`w-full text-left px-3 py-1.5 italic text-haze hover:bg-stage-800 ${
                  activeIdx === 0 ? 'bg-stage-800' : ''
                }`}
              >
                (clear song link)
              </button>
            </li>

            {/* Retired current selection — visible so admins know why
                their old choice can't be reused, but not selectable. */}
            {showRetiredCurrent && (
              <li>
                <div
                  className="w-full px-3 py-1.5 text-haze/40 cursor-not-allowed break-words"
                  aria-disabled="true"
                >
                  {showRetiredCurrent.title} — {showRetiredCurrent.artist}{' '}
                  <span className="text-[10px] uppercase tracking-widest">
                    (retired)
                  </span>
                </div>
              </li>
            )}

            {matches.length === 0 ? (
              <li className="px-3 py-2 text-haze/60">No songs match.</li>
            ) : (
              matches.map((s, i) => {
                const idx = i + 1;
                const isHighlighted = activeIdx === idx;
                const isSelected = s.id === value;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => pick(s.id)}
                      onMouseEnter={() => setActiveIdx(idx)}
                      className={`w-full text-left px-3 py-1.5 break-words hover:bg-stage-800 ${
                        isHighlighted ? 'bg-stage-800' : ''
                      } ${isSelected ? 'text-spotlight font-semibold' : ''}`}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <span className="block">{s.title}</span>
                      <span className="block text-[10px] text-haze/70 uppercase tracking-wider">
                        {s.artist}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
