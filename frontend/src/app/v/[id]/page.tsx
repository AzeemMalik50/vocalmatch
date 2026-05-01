'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { VideoDto, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

export default function VideoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const [video, setVideo] = useState<VideoDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const v = await api.getVideo(id);
        if (!cancelled) setVideo(v);
      } catch (e: any) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleDelete = async () => {
    if (!confirm('Delete this performance? This cannot be undone.')) return;
    setDeleting(true);
    try {
      await api.deleteVideo(id);
      router.push('/');
    } catch (e: any) {
      setErr(e.message);
      setDeleting(false);
    }
  };

  return (
    <>
      <Nav />

      <main className="relative z-10 max-w-5xl mx-auto px-6 py-12">
        {loading && (
          <div className="aspect-video bg-stage-900 border border-stage-700/40 rounded-xl animate-pulse" />
        )}

        {err && (
          <div className="border border-red-900/40 bg-red-950/30 rounded-xl p-6 text-red-300">
            <p className="font-bold mb-1">Couldn't load this performance</p>
            <p className="text-sm opacity-80">{err}</p>
            <Link
              href="/"
              className="inline-block mt-4 text-spotlight font-bold hover:text-white"
            >
              ← Back to feed
            </Link>
          </div>
        )}

        {video && (
          <>
            <Link
              href="/"
              className="inline-block mb-6 text-sm text-haze hover:text-white transition-colors"
            >
              ← Back to feed
            </Link>

            <div className="bg-stage-900 border border-stage-700 rounded-xl overflow-hidden">
              <div className="aspect-video bg-black">
                <video
                  src={video.url}
                  poster={video.thumbnailUrl ?? undefined}
                  controls
                  autoPlay
                  className="w-full h-full"
                />
              </div>

              <div className="p-6 md:p-8">
                {video.songTitle && (
                  <span className="inline-block mb-3 px-2.5 py-1 text-[10px] uppercase tracking-widest font-bold bg-spotlight/10 text-spotlight rounded border border-spotlight/30">
                    ♪ {video.songTitle}
                  </span>
                )}

                <h1 className="font-display text-3xl md:text-4xl font-bold leading-tight mb-4">
                  {video.title}
                </h1>

                {video.uploader && (
                  <Link
                    href={`/u/${video.uploader.username}`}
                    className="inline-flex items-center gap-3 group mb-6"
                  >
                    <div className="w-10 h-10 rounded-full bg-stage-700 flex items-center justify-center overflow-hidden">
                      {video.uploader.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={video.uploader.avatarUrl}
                          alt={video.uploader.username}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="font-bold text-haze">
                          {video.uploader.username[0]?.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="leading-tight">
                      <p className="font-bold group-hover:text-spotlight transition-colors">
                        @{video.uploader.username}
                      </p>
                      {video.uploader.championTitle && (
                        <p className="text-xs uppercase tracking-wider text-gold font-bold">
                          ★ {video.uploader.championTitle}
                        </p>
                      )}
                    </div>
                  </Link>
                )}

                {video.description && (
                  <p className="text-haze leading-relaxed whitespace-pre-wrap mb-6">
                    {video.description}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-haze/70 tabular pt-6 border-t border-stage-700/40">
                  <span>
                    {video.viewCount} {video.viewCount === 1 ? 'view' : 'views'}
                  </span>
                  <span>·</span>
                  <span>{new Date(video.createdAt).toLocaleDateString()}</span>

                  {user && video.uploader?.id === user.id && (
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="ml-auto text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
                    >
                      {deleting ? 'Deleting…' : 'Delete'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Main Stage teaser */}
            <div className="mt-8 p-6 bg-stage-900/60 border border-stage-700/40 rounded-xl">
              <p className="text-xs uppercase tracking-widest text-spotlight font-bold mb-2">
                Main Stage · next phase
              </p>
              <p className="font-display text-xl font-bold mb-2">
                Watch → Vote → Challenge → Return
              </p>
              <ul className="text-sm text-haze leading-relaxed space-y-1.5 mt-3">
                <li>· One vote per user, locked when the 24–48hr countdown ends.</li>
                <li>· Live vote % the moment you cast your ballot.</li>
                <li>· "Challenge this winner" — the Red Phone button drops you straight into the queue.</li>
                <li>· Champions earn the title <span className="font-bold">Official Voice of the Song</span> and defend it on streak.</li>
              </ul>
              <p className="text-xs text-haze/60 mt-4">
                This performance is auto-eligible for the queue when battles
                open.
              </p>
            </div>
          </>
        )}
      </main>

      <Footer />
    </>
  );
}
