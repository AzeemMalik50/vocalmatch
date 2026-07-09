'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
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
  // Where to send the user if they abandon the upload and want to go
  // back. Only same-origin paths (starting with `/` but NOT `//`) are
  // accepted so a crafted URL can't open-redirect a signed-in user
  // off-site. Null when the caller didn't supply one — the back
  // affordance is only rendered when we have a valid target.
  const rawReturnTo = searchParams?.get('returnTo') ?? '';
  const returnTo =
    rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//')
      ? rawReturnTo
      : null;

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

  const [acceptedOwnership, setAcceptedOwnership] = useState(false);
  const [acceptedLicense, setAcceptedLicense] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0); // 0..100
  const [uploaded, setUploaded] = useState(0); // bytes
  const handleRef = useRef<UploadHandle | null>(null);
  // Bug — if the user hit Cancel just as the server finished saving the
  // upload, `handle.cancel()` was a no-op (XHR already resolved) but the
  // main submit's `await handle.promise` was still pending. It resolved
  // with a real `created` object and the code then went on to submit the
  // challenge and navigate — before the cancel-path's deleteVideo could
  // catch up. Net effect: user saw "Cancelled" toast but the performance
  // was live in their profile. This ref lets the post-await path detect
  // that cancellation happened during the race and bail cleanly.
  const cancelledRef = useRef(false);
  // Ref on the song-picker wrapper so we can detect taps outside the
  // dropdown and close it. Without this the picker had no dismiss
  // mechanism at all — the only way to close it was to select an item
  // or blur the input by tabbing away, and mobile taps outside kept
  // it stuck open.
  const songPickerRef = useRef<HTMLDivElement | null>(null);
  const confirm = useConfirm();

  useEffect(() => {
    if (!authLoading && !user) {
      // Preserve the challenge intent through the login bounce so the user
      // lands back on the same upload-as-challenge flow after signing in.
      const here = `/upload${
        challengeMode || prefilledSongId || returnTo
          ? `?${new URLSearchParams({
              ...(challengeMode ? { challenge: '1' } : {}),
              ...(prefilledSongId ? { songId: prefilledSongId } : {}),
              ...(returnTo ? { returnTo } : {}),
            }).toString()}`
          : ''
      }`;
      router.push(`/login?next=${encodeURIComponent(here)}`);
    }
  }, [authLoading, user, router, challengeMode, prefilledSongId, returnTo]);

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

  // Challenge-mode pre-check: a song with no defending champion can't
  // accept a Red Phone challenge — there's nothing to battle against.
  // The SongDto already carries `currentChampionUserId`, so this is a
  // pure client-side check (no extra round-trip). Backend re-validates
  // at submission via BadRequestException.
  const songHasNoChampion =
    challengeMode && !!selectedSong && !selectedSong.currentChampionUserId;

  // Challenge-mode pre-check: if a battle for the selected song is still
  // in flight (live or tied awaiting admin decision), there's nothing for
  // a challenger to queue against — admin can't promote them yet. Surface
  // a blocking banner up-front instead of letting the user upload first
  // and only learn at submit. Mirrors the backend's ConflictException
  // copy so the message is consistent. Only runs in challenge mode + when
  // we actually have a song to check.
  const [songHasActiveBattle, setSongHasActiveBattle] = useState(false);
  const [checkingActiveBattle, setCheckingActiveBattle] = useState(false);
  useEffect(() => {
    if (!challengeMode || !songId) {
      setSongHasActiveBattle(false);
      return;
    }
    let cancelled = false;
    setCheckingActiveBattle(true);
    (async () => {
      try {
        const [live, awaiting] = await Promise.all([
          api.listBattles({ status: 'live', songId, limit: 1 }),
          api.listBattles({ status: 'needs_decision', songId, limit: 1 }),
        ]);
        if (cancelled) return;
        setSongHasActiveBattle(
          live.items.length > 0 || awaiting.items.length > 0,
        );
      } catch {
        // On lookup failure, don't block — backend will still enforce.
        if (!cancelled) setSongHasActiveBattle(false);
      } finally {
        if (!cancelled) setCheckingActiveBattle(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [challengeMode, songId]);

  // Close the song picker on:
  //   - a tap outside the picker wrapper (mousedown/touchstart, so it
  //     fires before the tap resolves to a focus event that would
  //     re-open the picker via the input's onFocus)
  //   - Escape key press (keyboard-user parity)
  // Only wired when the picker is actually open so we're not paying
  // for a document-level listener on every keystroke of the rest of
  // the form.
  useEffect(() => {
    if (!songPickerOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (target && songPickerRef.current && !songPickerRef.current.contains(target)) {
        setSongPickerOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSongPickerOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown, { passive: true });
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [songPickerOpen]);

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
    // Bug #54 — every validation must fire BEFORE `setSubmitting(true)`
    // and the upload state flips. Previously the `!songId` check ran
    // *after* `setSubmitting(true)` + `setProgress(0)`, which left the
    // UI stuck: the button stayed on "Publishing…", a 0% progress bar
    // appeared, and the "Cancel upload" affordance did nothing because
    // there was no upload to cancel. User had to refresh to recover.
    if (!file) {
      setErr('Pick a video file first.');
      return;
    }
    if (!title.trim()) {
      // HTML `required` catches the empty case, but a whitespace-only
      // title would slip through to the backend. Keep the gate tight.
      setErr('Give your performance a title.');
      return;
    }
    if (!songId) {
      setErr('Pick a Centerstage Song from the list.');
      return;
    }
    if (challengeMode && songHasActiveBattle) {
      // Pre-empt the backend ConflictException with the exact same copy.
      // Don't even start the upload — we know it'll be rejected.
      setErr('Champion for this battle is not yet decided');
      return;
    }
    if (songHasNoChampion) {
      // Mirror the backend BadRequestException copy so the user sees the
      // same message whether the check fires here or server-side.
      setErr(
        'This song has no current champion yet. Wait for the first battle to crown one, or pick a different song.',
      );
      return;
    }
    if (!acceptedOwnership || !acceptedLicense) {
      setErr(
        'Please acknowledge ownership and the platform license to continue.',
      );
      return;
    }

    // Live re-check the Centerstage Song status right before we start
    // the upload. The catalog was fetched on mount and never re-polled,
    // so a song that an admin retires while the user is filling the
    // form still shows as selected. Catching it here saves the user a
    // full multipart upload just to receive a rejection. If this
    // lookup itself fails (network, 404), fall through — the backend
    // guard in VideosService.create() is the source of truth and will
    // still reject the submission.
    try {
      const fresh = await api.getSong(songId);
      if (fresh.status !== 'active') {
        setErr(
          `"${fresh.title}" was retired while you were on this page. Please pick another Centerstage Song.`,
        );
        return;
      }
    } catch {
      /* fall through to backend guard */
    }

    // All validation passed — now it's safe to flip into the uploading
    // state. From here, the only way back is the real cancel path or a
    // success/error response from the upload itself.
    cancelledRef.current = false;
    setSubmitting(true);
    setProgress(0);
    setUploaded(0);

    const fd = new FormData();
    fd.append('title', title);
    fd.append('songId', songId);
    // `songTitle` used to be sent as a denormalized copy of the song's
    // title. Backend now derives it authoritatively from `songId` (see
    // videos.service.ts). Sending it from the client caused two bugs:
    // (a) it would fail the DTO's 120-char cap if the linked song had
    // a legacy long title even though the user couldn't edit it, and
    // (b) client-supplied value could drift from the real song title.
    if (description) fd.append('description', description);
    fd.append('visibility', visibility);
    if (tags.length > 0) fd.append('tags', tags.join(','));
    fd.append('video', file);
    fd.append(
      'uploadAcknowledged',
      String(acceptedOwnership && acceptedLicense),
    );

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
      // Cancel-during-final-stage race: if the user hit Cancel while the
      // server was finalising this upload, `cancelledRef` was flipped in
      // the interim. The cancel handler already scheduled a deleteVideo
      // on this `created` id, so we must NOT go on to submit a challenge
      // or navigate to the video page — that would leave the challenge
      // linked to a video the cancel path is about to delete (or worse,
      // succeed racing the delete). Bail here; the cancel handler owns
      // cleanup + state reset.
      if (cancelledRef.current) {
        return;
      }
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
      // Cancellation-triggered abort throws too — swallow silently so
      // the user doesn't see an error toast on top of the "Cancelled"
      // message. The cancel handler has already reset submit state.
      if (cancelledRef.current) return;
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
    // Flag first — the main submit's post-await code checks this and
    // bails before running challenge-submit or navigate. Order matters:
    // if we set this after calling `handle.cancel()`, a synchronous
    // resolution of the promise (already-completed XHR) could race
    // ahead of the flag and land us on the video page.
    cancelledRef.current = true;
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
        {/* Back-to-origin affordance — rendered whenever the caller
            supplied a `returnTo` query (currently the Challenge CTA
            on battle detail pages). Sits above the eyebrow so it's
            the very first thing a user sees on land, matching the
            iOS convention of a top-left back arrow. Uses <Link> so
            the destination hydrates client-side without a full
            page reload. */}
        {returnTo && (
          <Link
            href={returnTo}
            className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.25em] text-haze hover:text-white mb-4"
          >
            ← Back to battle
          </Link>
        )}
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
              <div className="relative" ref={songPickerRef}>
                {selectedSong ? (
                  // Bug #61 — when the user lands here via challenge mode
                  // with a song pre-filled from the URL (`?challenge=1&songId=…`,
                  // typically from clicking "Upload your version" on a
                  // specific champion's battle/profile page), they
                  // arrived intending to challenge THAT champion. Letting
                  // them swap the song silently retargets the challenge
                  // at a different champion without any UI cue — that's
                  // the bug. Lock the song in this case; if they want a
                  // different target, they should re-enter the flow
                  // from that other champion's page.
                  challengeMode && prefilledSongId === selectedSong.id ? (
                    <div className="w-full flex items-stretch bg-stage-900 border border-spotlight/50 rounded-md overflow-hidden">
                      <div className="flex-1 flex items-center justify-between px-4 py-3">
                        <span>
                          <span className="font-bold">{selectedSong.title}</span>
                          <span className="text-haze/60"> · {selectedSong.artist}</span>
                        </span>
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] uppercase tracking-widest font-bold bg-spotlight/15 text-spotlight border border-spotlight/40"
                          title="Locked to the champion you launched this challenge from"
                        >
                          🔒 Locked
                        </span>
                      </div>
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
                  )
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
                      // Tap-again-to-close: if the picker is already
                      // open and the user taps the input, close it.
                      // `preventDefault` on mousedown keeps focus
                      // where it is so onFocus doesn't immediately
                      // re-open the picker on the next tick.
                      onMouseDown={(e) => {
                        if (songPickerOpen) {
                          e.preventDefault();
                          setSongPickerOpen(false);
                        }
                      }}
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
                          filteredSongs.map((s) => {
                            const noChampion =
                              challengeMode && !s.currentChampionUserId;
                            return (
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
                                {noChampion && (
                                  <span
                                    className="ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] uppercase tracking-widest font-bold bg-yellow-950/60 border border-yellow-700/60 text-yellow-200 align-middle"
                                    title="No defending champion yet — can't be challenged"
                                  >
                                    No champion
                                  </span>
                                )}
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
                            );
                          })
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
            {challengeMode &&
              prefilledSongId &&
              prefilledSongId === songId && (
                <p className="mt-1.5 text-xs text-spotlight/90">
                  Song is locked because you launched this challenge from
                  the current champion of this song. To challenge a
                  different champion, open that champion&apos;s battle and
                  hit &ldquo;Upload your version&rdquo; there.
                </p>
              )}
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

          {/* Block-state banner for challenge mode when a battle for the
              selected song is still in flight. Matches the backend's
              ConflictException copy so the message is identical wherever
              the user encounters it. */}
          {challengeMode && songHasActiveBattle && (
            <div
              role="alert"
              className="text-sm text-yellow-200 bg-yellow-950/40 border border-yellow-700/50 rounded-md px-4 py-3"
            >
              <p className="font-bold">Champion for this battle is not yet decided</p>
              <p className="text-xs text-yellow-200/80 mt-1">
                A battle for{' '}
                <span className="font-semibold">
                  {selectedSong?.title ?? 'this song'}
                </span>{' '}
                is still live or awaiting an admin decision. Come back once
                the current champion is crowned to submit your challenge.
              </p>
            </div>
          )}

          {/* Block-state banner for challenge mode when the selected song
              has no defending champion yet. Mirrors the backend
              BadRequestException copy. */}
          {songHasNoChampion && (
            <div
              role="alert"
              className="text-sm text-yellow-200 bg-yellow-950/40 border border-yellow-700/50 rounded-md px-4 py-3"
            >
              <p className="font-bold">This song has no champion yet</p>
              <p className="text-xs text-yellow-200/80 mt-1">
                <span className="font-semibold">
                  {selectedSong?.title ?? 'This song'}
                </span>{' '}
                hasn&apos;t been battled yet, so there&apos;s no crown to
                challenge. Wait for the first battle to crown a champion,
                or pick a different Centerstage Song.
              </p>
            </div>
          )}

          <label className="flex items-start gap-2 text-sm text-haze">
            <input
              type="checkbox"
              checked={acceptedOwnership}
              onChange={(e) => setAcceptedOwnership(e.target.checked)}
              className="mt-1 accent-spotlight"
            />
            <span>
              I represent and warrant that I own or control all rights necessary
              to upload this content.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-haze">
            <input
              type="checkbox"
              checked={acceptedLicense}
              onChange={(e) => setAcceptedLicense(e.target.checked)}
              className="mt-1 accent-spotlight"
            />
            <span>
              I grant VOCALMATCH permission to display, stream, promote, archive,
              distribute, and use this content within the VOCALMATCH platform and
              related promotional activities.
            </span>
          </label>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="submit"
              disabled={
                submitting ||
                checkingActiveBattle ||
                (challengeMode && songHasActiveBattle) ||
                songHasNoChampion ||
                !acceptedOwnership ||
                !acceptedLicense
              }
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
