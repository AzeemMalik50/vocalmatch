'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { useAuth } from '@/lib/auth-context';
import {
  uploadVideoWithProgress,
  UploadHandle,
  VideoVisibility,
  VISIBILITY_LABELS,
} from '@/lib/api';

const MAX_BYTES = 100 * 1024 * 1024;
const MAX_TAGS = 10;

export default function UploadPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [songTitle, setSongTitle] = useState('');
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

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

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

    const fd = new FormData();
    fd.append('title', title);
    if (songTitle) fd.append('songTitle', songTitle);
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
      router.push(`/v/${created.id}`);
    } catch (e: any) {
      setErr(e.message);
      setSubmitting(false);
      setProgress(0);
      setUploaded(0);
    }
  };

  const cancel = () => {
    handleRef.current?.cancel();
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
        <p className="text-xs uppercase tracking-[0.3em] text-haze/60 mb-3">
          New performance
        </p>
        <h1 className="font-display text-5xl font-bold mb-3">
          Take the <span className="text-spotlight italic">spotlight</span>.
        </h1>
        <p className="text-haze mb-10 leading-relaxed">
          A great performance is half stage presence, half song choice. Tag the
          song you're covering — when battles open, you'll be matchable against
          other performers of the same track.
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
              Song <span className="text-haze/40">(optional but recommended)</span>
            </label>
            <input
              type="text"
              maxLength={120}
              value={songTitle}
              onChange={(e) => setSongTitle(e.target.value)}
              className="w-full px-4 py-3 bg-stage-900 border border-stage-700 rounded-md focus:outline-none focus:border-spotlight transition-colors"
              placeholder='e.g. "Hallelujah — Leonard Cohen"'
            />
            <p className="mt-1.5 text-xs text-haze/50">
              Battles match performers who covered the same song. Singing the
              <span className="text-spotlight font-bold"> Centerstage Song</span>{' '}
              (announced soon) makes you eligible for the very first battle.
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
              <input
                type="file"
                accept="video/*"
                required
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) acceptFile(f);
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
            <div className="text-sm text-red-300 bg-red-950/40 border border-red-900/40 rounded-md px-4 py-3">
              {err}
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

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-3.5 bg-spotlight text-white font-bold rounded-md hover:bg-spotlight-dim transition-colors disabled:opacity-50 shadow-lg shadow-spotlight/30"
          >
            {submitting ? 'Publishing…' : 'Publish performance →'}
          </button>

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
