'use client';

import { useEffect, useState } from 'react';
import Nav from '@/components/Nav';
import VideoCard from '@/components/VideoCard';
import { VideoDto, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import Link from 'next/link';

export default function HomePage() {
  const { user, loading: authLoading } = useAuth();
  const [videos, setVideos] = useState<VideoDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const data = await api.listVideos();
      setVideos(data);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, user?.id]);

  return (
    <>
      <Nav />

      <section className="relative z-10 border-b-2 border-ink">
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-24 grid md:grid-cols-12 gap-8 items-end">
          <div className="md:col-span-8">
            <p className="text-xs uppercase tracking-[0.3em] opacity-60 mb-4">
              {/* Vol. 01 — Community Picks
               */}
               {/* Community Picks */}
            </p>
            <h1 className="font-display text-6xl md:text-8xl font-black leading-[0.9]">
              Upload.<br />
              <span className="italic font-light">Watch.</span><br />
              <span className="text-accent">Vote.</span>
            </h1>
          </div>
          <div className="md:col-span-4">
            <p className="text-lg leading-relaxed opacity-80">
              {/* A minimal stage for short videos. Everyone gets one vote per clip —
              no gaming the count, no second chances. */}
            </p>
            {!user && !authLoading && (
              <div className="mt-6 flex gap-3">
                <Link
                  href="/signup"
                  className="px-5 py-3 bg-ink text-paper font-bold hover:bg-accent transition-colors"
                >
                  Create account →
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      <main className="relative z-10 max-w-6xl mx-auto px-6 py-12">
        <div className="flex items-baseline justify-between mb-8">
          <h2 className="font-display text-3xl font-bold">The Feed</h2>
          {user && (
            <Link
              href="/upload"
              className="text-sm font-bold underline underline-offset-4 hover:text-accent"
            >
              + Add your video
            </Link>
          )}
        </div>

        {loading && (
          <p className="opacity-60">Loading videos…</p>
        )}

        {err && <p className="text-red-600">{err}</p>}

        {!loading && videos.length === 0 && (
          <div className="border-2 border-dashed border-ink/30 p-12 text-center">
            <p className="font-display text-2xl mb-2">No videos yet.</p>
            <p className="opacity-70 mb-6">Be the first to upload.</p>
            {user ? (
              <Link
                href="/upload"
                className="inline-block px-5 py-3 bg-ink text-paper font-bold hover:bg-accent"
              >
                Upload a video
              </Link>
            ) : (
              <Link
                href="/signup"
                className="inline-block px-5 py-3 bg-ink text-paper font-bold hover:bg-accent"
              >
                Sign up to upload
              </Link>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {videos.map((v) => (
            <VideoCard key={v.id} video={v} />
          ))}
        </div>
      </main>

      <footer className="relative z-10 border-t-2 border-ink mt-20">
        <div className="max-w-6xl mx-auto px-6 py-8 flex items-center justify-between text-xs uppercase tracking-widest opacity-60">
          <span>Vocal Match · 2026</span>
          {/* <span>Built with Next.js & NestJS</span> */}
        </div>
      </footer>
    </>
  );
}
