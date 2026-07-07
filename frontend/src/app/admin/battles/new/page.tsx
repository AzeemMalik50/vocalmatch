'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import { StageLoader } from '@/components/Loaders';
import { api, SongDto, VideoDto } from '@/lib/api';

/**
 * Admin-only form to create a new 1v1 battle.
 *
 * Steps:
 *   1. Pick a Centerstage Song
 *   2. The form loads all uploads tagged with that songId
 *      (or, fallback, all uploads with matching songTitle)
 *   3. Pick performance A and performance B
 *   4. Optional title, voting window (default 48h)
 *
 * Supports deep-link preselect via `?songId=...` so the Champions page
 * "Seed the first battle" CTA lands here with the right song already
 * chosen — admin doesn't have to re-pick from the dropdown.
 */
export default function AdminNewBattlePage() {
  return (
    <Suspense
      fallback={
        <AdminShell>
          <StageLoader message="Loading…" />
        </AdminShell>
      }
    >
      <AdminNewBattleForm />
    </Suspense>
  );
}

function AdminNewBattleForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [songs, setSongs] = useState<SongDto[]>([]);
  const [songId, setSongId] = useState('');
  const [candidates, setCandidates] = useState<VideoDto[]>([]);
  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');
  const [title, setTitle] = useState('');
  const [hours, setHours] = useState(48);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  // When a URL `?songId=` was supplied but that song isn't in the
  // active list (retired, deleted, or just unknown), we surface a
  // notice instead of silently leaving the dropdown empty.
  const [inactiveSongNotice, setInactiveSongNotice] = useState<
    { title: string; status: string } | null
  >(null);

  // Load active songs on mount.
  //
  // `limit: 200` (the backend cap) is intentional: the default page size
  // is 50, which broke the `?songId=` preselect when the requested song
  // happened to be on a later page (the find() returned undefined and
  // the dropdown stayed empty). 200 covers every realistic admin
  // catalog; we'll switch to true pagination here when the song count
  // outgrows that.
  useEffect(() => {
    (async () => {
      try {
        const resp = await api.listSongs({ status: 'all', limit: 200 });
        setSongs(resp.items.filter((s) => s.status === 'active'));
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, []);

  // Preselect songId from `?songId=...` once the active-songs list has
  // loaded. Only fires once: if the user changes the dropdown manually
  // later we don't keep yanking it back to the URL param. Validates
  // against the active songs list — if the link points at a song that
  // isn't active (retired or unknown), we fetch its detail just to
  // surface a clear "X is no longer active, pick another below" notice
  // rather than leaving the admin staring at an empty dropdown.
  useEffect(() => {
    if (songs.length === 0) return;
    if (songId) return; // user already picked OR we already preselected
    if (inactiveSongNotice) return; // already informed the user
    const urlSongId = searchParams?.get('songId');
    if (!urlSongId) return;
    const match = songs.find((s) => s.id === urlSongId);
    if (match) {
      setSongId(urlSongId);
      return;
    }
    // The linked song isn't in the active list. Look it up so the
    // notice can name it. Worst case (e.g. song was hard-deleted), the
    // fetch 404s and we fall back to a generic message.
    (async () => {
      try {
        const song = await api.getSong(urlSongId);
        setInactiveSongNotice({ title: song.title, status: song.status });
      } catch {
        setInactiveSongNotice({ title: 'The linked song', status: 'unavailable' });
      }
    })();
  }, [songs, songId, searchParams, inactiveSongNotice]);

  // When the song changes, load eligible performances
  useEffect(() => {
    setAId('');
    setBId('');
    setCandidates([]);
    if (!songId) return;
    setLoadingCandidates(true);
    const selected = songs.find((s) => s.id === songId);
    (async () => {
      try {
        // Pull every public video and filter client-side. This works at our
        // current scale (Phase 1 ships under 1000 videos); if it grows, we
        // add a server-side `?songId=` filter to /videos.
        const resp = await api.listVideos({ limit: 100 });
        const songSpecific = resp.items.filter(
          (v) =>
            v.songId === songId ||
            (selected &&
              v.songTitle &&
              v.songTitle.trim().toLowerCase() ===
                selected.title.trim().toLowerCase()),
        );
        setCandidates(songSpecific);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoadingCandidates(false);
      }
    })();
  }, [songId, songs]);

  const a = useMemo(() => candidates.find((c) => c.id === aId) ?? null, [candidates, aId]);
  const b = useMemo(() => candidates.find((c) => c.id === bId) ?? null, [candidates, bId]);
  const sameUser = a && b && a.uploader?.id === b.uploader?.id;

  const canSubmit =
    !!songId && !!aId && !!bId && aId !== bId && !sameUser && hours >= 1 && !submitting;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const closesAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
      const battle = await api.createBattle({
        songId,
        performanceAId: aId,
        performanceBId: bId,
        title: title.trim() || undefined,
        votingClosesAt: closesAt,
      });
      router.push(`/admin/battles/${battle.id}`);
    } catch (e: any) {
      setError(e.message || 'Could not create battle');
      setSubmitting(false);
    }
  };

  return (
    <AdminShell>
      <Link
        href="/admin/battles"
        className="text-sm text-haze hover:text-white transition-colors mb-3 inline-block"
      >
        ← Back to battles
      </Link>
      <h1 className="font-display font-black text-3xl mb-1">New battle</h1>
      <p className="text-haze mb-8">
        Pick a song, then choose the two performances that go head-to-head.
      </p>

      <form onSubmit={submit} className="space-y-8 max-w-3xl">
        {/* URL preselect failed because the linked song isn't active.
            Surface a clear message so the admin knows why the dropdown
            isn't preselected, naming the song when possible. */}
        {inactiveSongNotice && (
          <div className="rounded-md border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-100">
            <p>
              <span className="font-bold">
                &ldquo;{inactiveSongNotice.title}&rdquo;
              </span>{' '}
              is {inactiveSongNotice.status === 'unavailable'
                ? 'no longer available'
                : `currently ${inactiveSongNotice.status}`}{' '}
              and can&rsquo;t host a battle. Please pick another song from the
              list below.
            </p>
          </div>
        )}

        {/* Song picker */}
        <Field label="Centerstage Song" required>
          <select
            value={songId}
            onChange={(e) => setSongId(e.target.value)}
            required
            className="w-full px-3 py-2.5 bg-stage-900 border border-stage-700 rounded-md focus:outline-none focus:border-spotlight transition-colors"
          >
            <option value="">— Pick a song —</option>
            {songs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} — {s.artist}
              </option>
            ))}
          </select>
          {songs.length === 0 && (
            <p className="text-xs text-haze mt-1">
              No active songs yet. <Link href="/admin/songs" className="text-spotlight font-bold">Create one →</Link>
            </p>
          )}
        </Field>

        {/* Candidate performances */}
        {songId && (
          <>
            <Field label="Performance A" required>
              <PerformanceSelect
                performances={candidates}
                value={aId}
                onChange={setAId}
                excludeId={bId}
                loading={loadingCandidates}
              />
            </Field>
            <Field label="Performance B" required>
              <PerformanceSelect
                performances={candidates}
                value={bId}
                onChange={setBId}
                excludeId={aId}
                loading={loadingCandidates}
              />
            </Field>
            {sameUser && (
              <p className="text-sm text-red-400">
                Both performances are by the same user — pick a different pair.
              </p>
            )}
            {!loadingCandidates && candidates.length < 2 && (
              <p className="text-sm text-haze">
                Need at least 2 uploaded performances of this song to create a battle.
              </p>
            )}
          </>
        )}

        {/* Title */}
        <Field label="Battle title (optional)">
          <input
            type="text"
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder='e.g. "Round 1: Hallelujah"'
            className="w-full px-3 py-2.5 bg-stage-900 border border-stage-700 rounded-md focus:outline-none focus:border-spotlight transition-colors"
          />
        </Field>

        {/* Voting window */}
        <Field label="Voting window">
          <div className="flex items-center gap-3">
            {/* Bug #37 — added explicit −/+ stepper controls around the
                number input so admins can adjust the duration with a tap
                instead of typing on mobile keyboards. */}
            <div className="inline-flex items-stretch rounded-md border border-stage-700 overflow-hidden bg-stage-900">
              <button
                type="button"
                onClick={() => setHours((h) => Math.max(1, h - 1))}
                aria-label="Decrease voting window by one hour"
                className="px-3 text-lg font-bold text-haze hover:bg-stage-800 hover:text-white transition-colors"
              >
                −
              </button>
              <input
                type="number"
                min={1}
                max={168}
                value={hours}
                onChange={(e) =>
                  setHours(Math.max(1, parseInt(e.target.value || '0', 10) || 0))
                }
                className="no-spinner w-16 px-2 py-2.5 bg-stage-900 border-x border-stage-700 text-center focus:outline-none focus:border-spotlight transition-colors tabular-nums"
              />
              <button
                type="button"
                onClick={() => setHours((h) => Math.min(168, h + 1))}
                aria-label="Increase voting window by one hour"
                className="px-3 text-lg font-bold text-haze hover:bg-stage-800 hover:text-white transition-colors"
              >
                +
              </button>
            </div>
            <span className="text-haze">hours</span>
            <span className="text-xs text-haze/60">
              (default 48; recommended 24–48)
            </span>
          </div>
        </Field>

        {error && (
          // Bug #41 — error panel was red-300 on a 30% red wash with a
          // 40% red border; on the dark theme that read as just-noticeable
          // pink. Stronger background + brighter text so the validation
          // actually grabs the admin's attention.
          <div
            role="alert"
            className="flex items-start gap-3 bg-red-900/50 border border-red-400/60 rounded-lg p-4 text-sm text-red-50 shadow-lg shadow-red-950/40"
          >
            <span
              aria-hidden="true"
              className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-[11px] font-black text-white"
            >
              !
            </span>
            <span className="font-semibold leading-relaxed">{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full md:w-auto px-6 py-3 bg-spotlight text-white font-bold rounded-md hover:bg-spotlight-dim transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Creating…' : 'Publish battle'}
        </button>
      </form>
    </AdminShell>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-widest font-bold text-haze mb-2">
        {label} {required && <span className="text-spotlight">*</span>}
      </label>
      {children}
    </div>
  );
}

function PerformanceSelect({
  performances,
  value,
  onChange,
  excludeId,
  loading,
}: {
  performances: VideoDto[];
  value: string;
  onChange: (id: string) => void;
  excludeId: string;
  loading: boolean;
}) {
  const options = performances.filter((p) => p.id !== excludeId);
  return (
    <div className="space-y-2">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        className="w-full px-3 py-2.5 bg-stage-900 border border-stage-700 rounded-md focus:outline-none focus:border-spotlight transition-colors disabled:opacity-50"
      >
        <option value="">{loading ? 'Loading candidates…' : '— Pick a performance —'}</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            @{p.uploader?.username ?? '?'} — {p.title}
          </option>
        ))}
      </select>
      {value && (() => {
        const v = performances.find((p) => p.id === value);
        if (!v) return null;
        return (
          <div className="bg-stage-900 border border-stage-600 rounded-lg p-3 flex gap-3">
            {v.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={v.thumbnailUrl}
                alt=""
                className="w-20 h-12 object-cover rounded"
              />
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{v.title}</p>
              <p className="text-xs text-haze">@{v.uploader?.username}</p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
