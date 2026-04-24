'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';

export default function UploadPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Route guard — send unauthenticated users to login
  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
  }, [authLoading, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!file) {
      setErr('Pick a video file first.');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setErr('Max file size is 100 MB.');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('title', title);
      if (description) fd.append('description', description);
      fd.append('video', file);
      await api.uploadVideo(fd);
      router.push('/');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !user) {
    return (
      <>
        <Nav />
        <main className="max-w-md mx-auto px-6 py-16 opacity-60">Loading…</main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="relative z-10 max-w-xl mx-auto px-6 py-16">
        <p className="text-xs uppercase tracking-[0.3em] opacity-60 mb-3">
          New submission
        </p>
        <h1 className="font-display text-5xl font-bold mb-8">
          Add to <span className="text-accent">the feed.</span>
        </h1>

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2 font-semibold">
              Title
            </label>
            <input
              type="text"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-3 bg-paper border-2 border-ink focus:outline-none focus:border-accent"
              placeholder="Give it a name"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest mb-2 font-semibold">
              Description <span className="opacity-50">(optional)</span>
            </label>
            <textarea
              rows={3}
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-4 py-3 bg-paper border-2 border-ink focus:outline-none focus:border-accent resize-none"
              placeholder="A sentence or two"
            />
          </div>

          <div>
            <label className="block text-xs uppercase tracking-widest mb-2 font-semibold">
              Video file <span className="opacity-50">(max 100MB)</span>
            </label>
            <input
              type="file"
              accept="video/*"
              required
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full px-4 py-3 bg-paper border-2 border-ink file:mr-4 file:py-2 file:px-4 file:border-2 file:border-ink file:bg-ink file:text-paper file:font-bold file:cursor-pointer hover:file:bg-accent"
            />
            {file && (
              <p className="mt-2 text-xs opacity-70">
                {file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB
              </p>
            )}
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-3 bg-ink text-paper font-bold hover:bg-accent transition-colors disabled:opacity-50"
          >
            {submitting ? 'Uploading… (this may take a minute)' : 'Publish →'}
          </button>

          <p className="text-xs opacity-60 leading-relaxed">
            Uploading sends your file to Cloudinary. A thumbnail is generated
            automatically. Your video appears in the feed as soon as upload
            completes.
          </p>
        </form>
      </main>
    </>
  );
}
