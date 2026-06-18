'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Nav from '@/components/Nav';
import { StageLoader } from '@/components/Loaders';
import { useAuth } from '@/lib/auth-context';
import { useConfirm } from '@/lib/confirm-context';
import {
  api,
  SongDto,
  uploadVideoWithProgress,
  UploadHandle,
  VideoVisibility,
  VISIBILITY_LABELS,
} from '@/lib/api';

const MAX_BYTES = 100 * 1024 * 1024;
const MAX_TAGS = 10;

/**
 * /upload supports two modes:
 *   default       → plain upload, lands on /v/:id
 *   ?challenge=1  → upload + immediately submit as a Red Phone challenge for
 *                   the prefilled song; lands on /u/<me> with the challenge
 *                   queued for admin review. Driven by the Challenge CTA on
 *                   battle pages so the WATCH → CHALLENGE bridge is one tap.
 *
 * Wrapped in <Suspense> because useSearchParams() requires it for static
 * prerendering (same pattern as /login).
 */
export default function UploadPage() {
  return (
    <Suspense
      fallback={
        <>
          <Nav />
          <main className="max-w-md mx-auto px-6 py-16">
            <StageLoader message="Loading…" />
          </main>
        </>
      }
    >
      <UploadForm />
    </Suspense>
  );
}

function UploadForm() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const challengeMode = searchParams?.get('challenge') === '1';
  const prefilledSongId = searchParams?.get('songId') ?? '';

  const [title, setTitle] = useState('');
  const [songs, setSongs] = useState<SongDto[]>([]);
  const [songsLoading, setSongsLoading] = useState(true);
  const [songSearch, setSongSearch] = useState('');
  const [songId, setSongId] = useState<string>('');
  const [songPickerOpen, setSongPickerOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [visibility, setVisibility] = useState<VideoVisibility>('public');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0); // 0..100
  const [uploaded, setUploaded] = useState(0); // bytes
  const handleRef = useRef<UploadHandle | null>(null);
  const confirm = useConfirm();

  useEffect(() => {
    if (!authLoading && !user) {
      // Preserve the challenge intent through the login bounce so the user
      // lands back on the same upload-as-challenge flow after signing in.
      const here = `/upload${
        challengeMode || prefilledSongId
          ? `?${new URLSearchParams({
              ...(challengeMode ? { challenge: '1' } : {}),
              ...(prefilledSongId ? { songId: prefilledSongId } : {}),
            }).toString()}`
          : ''
      }`;
      router.push(`/login?next=${encodeURIComponent(here)}`);
    }
  }, [authLoading, user, router, challengeMode, prefilledSongId]);

  // Load the active Centerstage Songs catalog. The picker is the one source of
  // truth — performances must link to a song id so the battle-create endpoint
  // can enforce "both performances of the same song".
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await api.listSongs('active');
        if (!cancelled) setSongs(resp.items);
      } catch {
        // Non-fatal — user just won't be able to pick a song. The form
        // surfaces this state below.
      } finally {
        if (!cancelled) setSongsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Prefill the song picker when arrived via the Challenge CTA. Runs once
  // after the songs catalog loads so we can confirm the id is valid.
  useEffect(() => {
    if (!prefilledSongId || songId) return;
    if (songs.some((s) => s.id === prefilledSongId)) {
      setSongId(prefilledSongId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, prefilledSongId]);

  // Single source of truth for "wipe the form back to a clean state".
  // Used by both the intent-change effect below and the manual Reset
  // button. Honors challenge-mode + prefilled song: those come from the
  // URL and should stay set so the user doesn't have to re-pick a song
  // after a stray click on Reset.
  const clearForm = useCallback(() => {
    setTitle('');
    setDescription('');
    setTagsInput('');
    setFile(null);
    setVisibility('public');
    setErr(null);
    setProgress(0);
    setUploaded(0);
    setSongSearch('');
    setSongPickerOpen(false);
    // Only blow away the song selection when there's no URL-prefilled
    // song to fall back to — otherwise we'd strand the user on a form
    // that immediately re-prefills from the URL on the next render.
    if (!prefilledSongId) setSongId('');
  }, [prefilledSongId]);

  // Bug #18 — when the user clicked "Upload Your Version" a second
  // time (e.g. for a different challenger), Next.js soft-navigation
  // kept the existing form state. Reset whenever the intent (challenge
  // mode + target song) changes so the user always starts clean.
  useEffect(() => {
    clearForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeMode, prefilledSongId]);

  const selectedSong = songs.find((s) => s.id === songId) ?? null;

  // "Dirty" state for the Reset button — true if the user has touched any
  // field beyond what the URL prefilled. Drives both the visible-state of
  // the button and whether we bother showing the confirm.
  const formDirty =
    !!title ||
    !!description ||
    !!tagsInput ||
    !!file ||
    visibility !== 'public' ||
    !!songSearch ||
    (!!songId && songId !== prefilledSongId);

  const handleReset = async () => {
    if (!formDirty) {
      clearForm();
      return;
    }
    const ok = await confirm({
      title: challengeMode ? 'Clear this challenge?' : 'Clear the form?',
      message: 'Everything you\'ve typed or selected here gets reset.',
      detail: challengeMode && prefilledSongId
        ? 'The Centerstage Song stays selected so you don\'t have to pick it again.'
        : undefined,
      confirmLabel: 'Yes, clear it',
      cancelLabel: 'Keep editing',
      tone: 'danger',
    });
    if (ok) clearForm();
  };

  const filteredSongs = (() => {
    const q = songSearch.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.artist.toLowerCase().includes(q),
    );
  })();

  // Paste a video file from the clipboard
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      for (const item of Array.from(e.clipboardData.items)) {
        if (item.kind === 'file' && item.type.startsWith('video/')) {
          const f = item.getAsFile();
          if (f) {
            acceptFile(f);
            e.preventDefault();
            return;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const acceptFile = (f: File) => {
    setErr(null);
    if (!f.type.startsWith('video/')) {
      setErr('That file is not a video.');
      return;
    }
    if (f.size > MAX_BYTES) {
      setErr('Max file size is 100 MB.');
      return;
    }
    setFile(f);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };
  const onDragLeave = () => setDragActive(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) acceptFile(f);
  };

  const tags = parseTags(tagsInput);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!file) {
      setErr('Pick a video file first.');
      return;
    }

    setSubmitting(true);
    setProgress(0);
    setUploaded(0);

    if (!songId) {
      setErr('Pick a Centerstage Song from the list.');
      return;
    }

    const fd = new FormData();
    fd.append('title', title);
    fd.append('songId', songId);
    if (selectedSong) fd.append('songTitle', selectedSong.title);
    if (description) fd.append('description', description);
    fd.append('visibility', visibility);
    if (tags.length > 0) fd.append('tags', tags.join(','));
    fd.append('video', file);

    const handle = uploadVideoWithProgress(fd, (loaded, total) => {
      setUploaded(loaded);
      // Upload to our server is the first ~95%; reserve the last sliver
      // for the server-side Cloudinary handoff.
      const pct = total > 0 ? Math.min(95, Math.round((loaded / total) * 95)) : 0;
      setProgress(pct);
    });
    handleRef.current = handle;

    try {
      const created = await handle.promise;
      setProgress(100);

      // Challenge mode: register the upload as a Red Phone submission for
      // the prefilled song.
      // Bug #11 — if the challenge queue rejects the submission (most
      // common: 409 because someone else is already queued for this
      // song), the video we just uploaded would be orphaned. Roll back
      // by deleting the just-created video so we never leave a stranded
      // performance behind.
      if (challengeMode && songId) {
        try {
          await api.submitChallenge(songId, created.id);
          router.push(
            user?.username ? `/u/${user.username}?challenge=submitted` : '/',
          );
          return;
        } catch (e: any) {
          try {
            await api.deleteVideo(created.id);
          } catch {
            /* Best-effort rollback — admin can clean up later if it fails. */
          }
          setErr(
            e?.message ??
              'A challenger is already queued for this song. Your upload was not saved.',
          );
          setSubmitting(false);
          setProgress(0);
          setUploaded(0);
          return;
        }
      }

      router.push(`/v/${created.id}`);
    } catch (e: any) {
      setErr(e.message);
      setSubmitting(false);
      setProgress(0);
      setUploaded(0);
    }
  };

  // Bug #15 — clicking "Cancel upload" used to abort the in-flight XHR,
  // but if the server had already saved the video before the abort
  // reached it, the performance still appeared in the Performances feed.
  // We now race the abort with a cleanup delete keyed off the promise
  // outcome: if the server returned a created row before we aborted,
  // we delete it so cancellation truly means "nothing was uploaded".
  const cancel = () => {
    const handle = handleRef.current;
    if (!handle) return;
    handle.cancel();
    handle.promise
      .then((created) => {
        if (created?.id) {
          api.deleteVideo(created.id).catch(() => {});
        }
      })
      .catch(() => {
        /* abort throw is expected — nothing to clean up */
      });
    setSubmitting(false);
    setProgress(0);
    setUploaded(0);
  };

  if (authLoading || !user) {
    return (
      <>
        <Nav />
        <main className="max-w-md mx-auto px-6 py-16 text-haze/60">
          Loading…
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="relative z-10 max-w-2xl mx-auto px-6 py-16">
        <p className="text-xs uppercase tracking-[0.3em] text-spotlight font-bold mb-3">
          {challengeMode ? 'Red Phone challenge' : 'New performance'}
        </p>
        <h1 className="font-display text-4xl md:text-5xl font-bold mb-3">
          {challengeMode ? (
            <>Take the <span className="text-spotlight italic">crown</span>.</>
          ) : (
            <>Take the <span className="text-spotlight italic">spotlight</span>.</>
          )}
        </h1>
        <p className="text-haze mb-10 leading-relaxed">
          {challengeMode
            ? "Upload your version of the song. If admin picks you from the queue, you'll go head-to-head with the current champion."
            : "A great performance is half stage presence, half song choice. Tag the song you're covering — when battles open, you'll be matchable against other performers of the same track."}
        </p>

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2 font-bold text-haze/80">
              Performance title
            </label>
            <input
              type="text"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 bg-stage-900 border border-stage-700 rounded-md focus:outline-none focus:border-spotlight transition-colors"
              placeholder='e.g. "Acoustic balcony cover, late night"'
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest mb-2 font-bold text-haze/80">
              Centerstage Song
            </label>
            {songsLoading ? (
              <div className="w-full px-4 py-3 bg-stage-900 border border-stage-700 rounded-md text-sm text-haze/60">
                Loading songs…
              </div>
            ) : songs.length === 0 ? (
              <div className="w-full px-4 py-3 bg-stage-900 border border-stage-700 rounded-md text-sm text-haze/70">
                No Centerstage Songs are active yet. An admin needs to publish
                at least one before you can upload a performance.
              </div>
            ) : (
              <div className="relative">
                {selectedSong ? (
                  <div className="w-full flex items-stretch bg-stage-900 border border-spotlight/50 rounded-md overflow-hidden">
                    <button
                      type="button"
                      onClick={() => {
                        setSongId('');
                        setSongSearch('');
                        setSongPickerOpen(true);
                      }}
                      className="flex-1 flex items-center justify-between px-4 py-3 text-left hover:bg-stage-800/40 transition-colors"
                    >
                      <span>
                        <span className="font-bold">{selectedSong.title}</span>
                        <span className="text-haze/60"> · {selectedSong.artist}</span>
                      </span>
                      <span className="text-xs text-spotlight font-bold uppercase tracking-widest">
                        Change
                      </span>
                    </button>
                    {selectedSong.trackUrl && (
                      <a
                        href={selectedSong.trackUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-4 text-[11px] uppercase tracking-widest font-bold text-spotlight hover:bg-stage-800 border-l border-spotlight/30"
                        title="Open backing track in a new tab"
                      >
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                        Play sound
                      </a>
                    )}
                  </div>
                ) : (
                  <>
                    <input
                      type="text"
                      value={songSearch}
                      onChange={(e) => {
                        setSongSearch(e.target.value);
                        setSongPickerOpen(true);
                      }}
                      onFocus={() => setSongPickerOpen(true)}
                      placeholder="Search the catalog by title or artist"
                      className="w-full px-4 py-3 bg-stage-900 border border-stage-700 rounded-md focus:outline-none focus:border-spotlight transition-colors"
                    />
                    {songPickerOpen && (
                      <ul className="absolute z-10 mt-1 w-full max-h-60 overflow-auto bg-stage-900 border border-stage-700 rounded-md shadow-lg">
                        {filteredSongs.length === 0 ? (
                          <li className="px-4 py-3 text-sm text-haze/60">
                            No matches. Ask an admin to add this song to the catalog.
                          </li>
                        ) : (
                          filteredSongs.map((s) => (
                            <li key={s.id} className="flex items-stretch border-b border-stage-800 last:border-b-0">
                              <button
                                type="button"
                                onClick={() => {
                                  setSongId(s.id);
                                  setSongSearch('');
                                  setSongPickerOpen(false);
                                }}
                                className="flex-1 text-left px-4 py-2.5 hover:bg-stage-800 transition-colors"
                              >
                                <span className="font-bold">{s.title}</span>
                                <span className="text-haze/60"> · {s.artist}</span>
                              </button>
                              {s.trackUrl && (
                                <a
                                  href={s.trackUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  // Stop propagation so opening the track
                                  // doesn't also select the song. mousedown
                                  // matters because the parent input has an
                                  // onBlur path that would close the picker
                                  // before click fires.
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1.5 px-3 text-[11px] uppercase tracking-widest font-bold text-spotlight hover:bg-stage-800 border-l border-stage-800"
                                  title="Open backing track in a new tab"
                                >
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="currentColor"
                                    aria-hidden="true"
                                  >
                                    <path d="M8 5v14l11-7z" />
                                  </svg>
                                  Play sound
                                </a>
                              )}
                            </li>
                          ))
                        )}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}
            <p className="mt-1.5 text-xs text-haze/50">
              Battles match performers who covered the same Centerstage Song.
              Pick one from the catalog so admins can pair your performance.
            </p>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest mb-2 font-bold text-haze/80">
              Description <span className="text-haze/40">(optional)</span>
            </label>
            <textarea
              rows={3}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 bg-stage-900 border border-stage-700 rounded-md focus:outline-none focus:border-spotlight transition-colors resize-none"
              placeholder="A line or two about your take"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest mb-2 font-bold text-haze/80">
              Tags{' '}
              <span className="text-haze/40">
                (optional — comma-separated, max {MAX_TAGS})
              </span>
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full px-4 py-3 bg-stage-900 border border-stage-700 rounded-md focus:outline-none focus:border-spotlight transition-colors"
              placeholder="acoustic, balcony, ballad, @collab_username"
            />
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] uppercase tracking-widest px-2 py-1 bg-spotlight/10 border border-spotlight/30 text-spotlight rounded font-bold"
                  >
                    {t.startsWith('@') ? t : `#${t}`}
                  </span>
                ))}
              </div>
            )}
            <p className="mt-1.5 text-xs text-haze/50">
              Use <span className="font-bold">@username</span> to credit a
              collaborator. Tags help people find your performance.
            </p>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest mb-2 font-bold text-haze/80">
              Visibility
            </label>
            <div className="grid sm:grid-cols-3 gap-2">
              {(Object.keys(VISIBILITY_LABELS) as VideoVisibility[]).map((v) => {
                const active = visibility === v;
                return (
                  <button
                    type="button"
                    key={v}
                    onClick={() => setVisibility(v)}
                    className={`text-left px-3 py-2.5 rounded-md border text-sm font-semibold transition-colors ${
                      active
                        ? 'border-spotlight bg-spotlight/10'
                        : 'border-stage-700 bg-stage-900 text-haze hover:border-stage-600'
                    }`}
                  >
                    <div className="font-bold">{VISIBILITY_LABELS[v]}</div>
                    <div className="text-[11px] text-haze/60 mt-0.5 leading-snug">
                      {v === 'public' && 'Shows on the public feed.'}
                      {v === 'unlisted' && 'Hidden from feed; anyone with the link can watch.'}
                      {v === 'private' && 'Only you can see this video.'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest mb-2 font-bold text-haze/80">
              Video file <span className="text-haze/40">(max 100 MB)</span>
            </label>
            <label
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className="block cursor-pointer"
            >
              {/* Bug #19 — the file input had `required` even though the
                  picker can be cancelled. On cancel Safari/Firefox clear
                  the FileList, which made the native HTML5 validation
                  flash "Please select a file" even when our React state
                  still held a valid pick. Source of truth is our `file`
                  state; we validate it in `submit()`. */}
              <input
                type="file"
                accept="video/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) acceptFile(f);
                  // Always clear so the same file can be re-selected.
                  e.target.value = '';
                }}
                className="sr-only"
              />
              <div
                className={`px-4 py-10 bg-stage-900 border-2 border-dashed rounded-md text-center transition-colors ${
                  dragActive
                    ? 'border-spotlight bg-spotlight/5'
                    : 'border-stage-700 hover:border-spotlight/60'
                }`}
              >
                {file ? (
                  <div>
                    <p className="font-bold">{file.name}</p>
                    <p className="text-xs text-haze mt-1 tabular">
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </p>
                    <p className="text-xs text-spotlight mt-3 underline">
                      Choose a different file
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="font-bold text-haze">
                      Click, drop, or paste a video here
                    </p>
                    <p className="text-xs text-haze/50 mt-1">
                      MP4, MOV, WebM — up to 100 MB
                    </p>
                  </div>
                )}
              </div>
            </label>
          </div>

          {err && (
            // Bug #28 — strong contrast + icon + role=alert so the
            // message is announced and unmissable.
            // Bug #34 — text node needs `min-w-0 flex-1` to wrap on
            // iPhone instead of overflowing horizontally (which was
            // truncating "Please select a file" to "Select a…").
            <div
              role="alert"
              className="flex items-start gap-3 bg-red-900/50 border border-red-400/60 rounded-md px-4 py-3 text-sm text-red-50 shadow-lg shadow-red-950/40"
            >
              <span
                aria-hidden="true"
                className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-500 text-[11px] font-black text-white"
              >
                !
              </span>
              <span className="min-w-0 flex-1 font-semibold leading-relaxed break-words">
                {err}
              </span>
            </div>
          )}

          {submitting && (
            <div className="bg-stage-900/60 border border-stage-700 rounded-md p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-widest font-bold text-haze">
                  {progress < 95
                    ? 'Uploading'
                    : progress < 100
                    ? 'Processing on the server'
                    : 'Done'}
                </p>
                <p className="text-xs text-haze tabular">
                  {file && uploaded > 0
                    ? `${(uploaded / 1024 / 1024).toFixed(1)} / ${(
                        file.size /
                        1024 /
                        1024
                      ).toFixed(1)} MB`
                    : ''}
                </p>
              </div>
              <div className="h-1.5 bg-stage-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-spotlight transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <button
                type="button"
                onClick={cancel}
                className="mt-3 text-xs font-bold text-red-300 hover:text-red-200"
              >
                Cancel upload
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-4 py-3.5 bg-spotlight text-white font-bold rounded-md hover:bg-spotlight-dim transition-colors disabled:opacity-50 shadow-lg shadow-spotlight/30"
            >
              {submitting
                ? challengeMode
                  ? 'Submitting challenge…'
                  : 'Publishing…'
                : challengeMode
                  ? 'Submit my challenge →'
                  : 'Publish performance →'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={submitting || !formDirty}
              title={formDirty ? 'Clear all fields' : 'Nothing to clear yet'}
              className="sm:w-auto px-4 py-3.5 text-sm font-bold rounded-md bg-stage-800 border border-stage-700 text-haze hover:text-white hover:border-stage-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Clear fields
            </button>
          </div>

          <p className="text-xs text-haze/60 leading-relaxed">
            Your video is hosted on Cloudinary's CDN. When the Main Stage
            opens, your uploads are auto-eligible for the Red Phone challenge
            queue — pick a song other people sing, and you'll get matched into
            head-to-head battles.
          </p>
        </form>
      </main>
    </>
  );
}

function parseTags(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const piece of raw.split(',')) {
    const trimmed = piece.trim().toLowerCase().replace(/^#/, '');
    if (!trimmed) continue;
    // Keep @-prefix for @mentions; otherwise it's a normal tag
    const cleaned = trimmed.length > 30 ? trimmed.slice(0, 30) : trimmed;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}
