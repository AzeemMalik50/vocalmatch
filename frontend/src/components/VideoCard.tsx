'use client';

import { useEffect, useState } from 'react';
import { VideoDto, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

interface Props {
  video: VideoDto;
}

export default function VideoCard({ video }: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const [hasVoted, setHasVoted] = useState(video.hasVoted);
  const [count, setCount] = useState(video.voteCount);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Light polling so counts stay "near real time" without websockets
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const { voteCount } = await api.getVoteCount(video.id);
        setCount(voteCount);
      } catch {}
    }, 5000);
    return () => clearInterval(t);
  }, [video.id]);

  const handleVote = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    if (submitting) return;
    if (hasVoted) {
      setErr('You already voted');
      return;
    }
    setSubmitting(true);
    setErr(null);

    const prevCount = count;
    setHasVoted(true);
    setCount(prevCount + 1);

    try {
      const res = await api.toggleVote(video.id);
      setHasVoted(res.hasVoted);
      setCount(res.voteCount);
    } catch (e: any) {
      const msg = e?.message ?? 'Could not vote';
      if (/already voted/i.test(msg)) {
        setHasVoted(true);
        setErr('You already voted');
      } else {
        setHasVoted(false);
        setCount(prevCount);
        setErr(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <article className="group relative bg-paper border-2 border-ink hover:-translate-y-1 transition-transform duration-200">
      <div className="relative aspect-video bg-ink overflow-hidden">
        <video
          src={video.url}
          poster={video.thumbnailUrl ?? undefined}
          controls
          preload="metadata"
          className="w-full h-full object-cover"
        />
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3 className="font-display text-2xl font-bold leading-tight">
            {video.title}
          </h3>
        </div>

        <p className="text-xs uppercase tracking-widest opacity-60 mb-3">
          by @{video.uploader.username}
        </p>

        {video.description && (
          <p className="text-sm mb-4 opacity-80 line-clamp-2">
            {video.description}
          </p>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-ink/20">
          <button
            onClick={handleVote}
            disabled={submitting}
            className={`flex items-center gap-2 px-4 py-2 font-bold border-2 border-ink transition-all ${
              hasVoted
                ? 'bg-accent text-paper'
                : 'bg-paper hover:bg-ink hover:text-paper'
            } disabled:opacity-50`}
          >
            <span className="text-lg leading-none">
              {hasVoted ? '♥' : '♡'}
            </span>
            <span className="text-sm">{hasVoted ? 'Voted' : 'Vote'}</span>
          </button>

          <div className="text-right">
            <div className="font-display text-3xl font-black tabular-nums leading-none">
              {count}
            </div>
            <div className="text-xs uppercase tracking-widest opacity-60">
              {count === 1 ? 'vote' : 'votes'}
            </div>
          </div>
        </div>

        {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
      </div>
    </article>
  );
}
