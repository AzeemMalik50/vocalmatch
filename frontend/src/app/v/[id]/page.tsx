'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import { Spinner, SkeletonBlock } from '@/components/Loaders';
import { VideoDto, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useConfirm } from '@/lib/confirm-context';

/**
 * Single performance page (Phase 1 surface, extended for Phase 2A).
 *
 * If the performance is part of a *live* battle, this page immediately
 * forwards to `/battle/:id` — that's where the timer, opponent, and vote
 * controls live, and we don't want two surfaces with two different vote
 * affordances.
 *
 * If the performance is in a completed battle, we keep the user here but
 * show a banner with the result and a link to the battle record.
 */
export default function VideoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const confirm = useConfirm();
  const [video, setVideo] = useState<VideoDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const v = await api.getVideo(id);
        if (cancelled) return;

        // If the video is in a live or pending-decision battle, the canonical
        // place to view it is the battle page. Forward there.
        if (v.battle && (v.battle.status === 'live' || v.battle.status === 'needs_decision')) {
          setRedirecting(true);
          router.replace(`/battle/${v.battle.id}`);
          return;
        }

        setVideo(v);
      } catch (e: any) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Delete this performance?',
      message: 'It will be removed from your profile and the public feed.',
      detail: 'If the video has been in a battle, it stays in the battle history but is hidden everywhere else.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
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

      <main className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-12">
        {(loading || redirecting) && (
          <>
            {redirecting && (
              <p className="flex items-center justify-center gap-3 text-haze mb-4 text-sm font-medium">
                <Spinner size="sm" />
                Taking you to the live battle…
              </p>
            )}
            <SkeletonBlock className="aspect-video" rounded="xl" />
            <div className="mt-4 space-y-2">
              <SkeletonBlock className="h-6 w-2/3" />
              <SkeletonBlock className="h-4 w-1/3" />
            </div>
          </>
        )}

        {err && !loading && (
          <div className="border border-red-900/40 bg-red-950/30 rounded-xl p-6 text-red-300">
            <p className="font-bold mb-1">Couldn&apos;t load this performance</p>
            <p className="text-sm opacity-80">{err}</p>
            <Link
              href="/"
              className="inline-block mt-4 text-spotlight font-bold hover:text-white"
            >
              ← Back to feed
            </Link>
          </div>
        )}

        {video && !redirecting && (
          <>
            <Link
              href="/"
              className="inline-block mb-6 text-sm text-haze hover:text-white transition-colors"
            >
              ← Back to feed
            </Link>

            {/* Battle-context banner (only for completed/cancelled battles —
                live/needs_decision redirect above). */}
            {video.battle && (
              <BattleContextBanner video={video} />
            )}

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
          </>
        )}
      </main>

      <Footer />
    </>
  );
}

/**
 * Renders only when this video belongs to a completed or cancelled battle.
 * Live battles trigger a redirect so this banner is never seen for them.
 */
function BattleContextBanner({ video }: { video: VideoDto }) {
  if (!video.battle) return null;
  const { battle } = video;
  const won = battle.winnerPerformanceId === video.id;
  const isCompleted = battle.status === 'completed';
  const isCancelled = battle.status === 'cancelled';

  if (!isCompleted && !isCancelled) return null;

  if (isCancelled) {
    return (
      <div className="mb-6 bg-stage-900 border border-stage-700/60 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-haze/70 mb-1">
            Battle cancelled
          </p>
          <p className="text-sm text-haze">
            {battle.title || 'This battle'} was cancelled before voting completed.
          </p>
        </div>
        <Link
          href={`/battle/${battle.id}`}
          className="text-sm font-bold text-spotlight hover:opacity-90 whitespace-nowrap"
        >
          See battle →
        </Link>
      </div>
    );
  }

  return (
    <div
      className={`mb-6 rounded-xl p-4 border flex flex-wrap items-center justify-between gap-3 ${
        won
          ? 'bg-gold/10 border-gold/40'
          : 'bg-stage-900 border-stage-700/60'
      }`}
    >
      <div className="min-w-0">
        <p
          className={`text-[10px] uppercase tracking-widest font-bold mb-1 ${
            won ? 'text-gold' : 'text-haze/70'
          }`}
        >
          {won ? 'Won this battle' : 'Battle result'}
        </p>
        <p className="text-sm">
          {won ? (
            <>
              <span className="font-bold text-white">
                {battle.title || 'This battle'}
              </span>{' '}
              <span className="text-haze">— this performance took the crown.</span>
            </>
          ) : (
            <>
              <span className="font-bold text-white">
                {battle.title || 'This battle'}
              </span>{' '}
              <span className="text-haze">— see who won.</span>
            </>
          )}
        </p>
      </div>
      <Link
        href={`/battle/${battle.id}`}
        className={`text-sm font-bold hover:opacity-90 whitespace-nowrap ${
          won ? 'text-gold' : 'text-spotlight'
        }`}
      >
        See battle →
      </Link>
    </div>
  );
}
