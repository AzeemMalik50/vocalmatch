'use client';

import Link from 'next/link';
import { VideoDto } from '@/lib/api';

interface Props {
  video: VideoDto;
  priority?: boolean;
}

function formatDuration(seconds: number | null): string {
  if (!seconds || seconds < 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(date).toLocaleDateString();
}

export default function PerformanceCard({ video }: Props) {
  return (
    <article className="group relative bg-stage-900 border border-stage-700/60 rounded-xl overflow-hidden hover:border-spotlight/40 hover:-translate-y-1 transition-all duration-200">
      {/* Video */}
      <Link href={`/v/${video.id}`} className="block relative aspect-video bg-black overflow-hidden">
        {video.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-haze/40 text-xs">
            No preview
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

        {/* Play indicator */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-14 h-14 rounded-full bg-spotlight/90 flex items-center justify-center shadow-2xl">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="white">
              <path d="M5 3v14l12-7L5 3z" />
            </svg>
          </div>
        </div>

        {/* Duration */}
        {video.durationSeconds && (
          <span className="absolute bottom-2 right-2 px-2 py-0.5 text-xs font-semibold tabular bg-black/80 text-white rounded">
            {formatDuration(video.durationSeconds)}
          </span>
        )}

        {/* Song badge */}
        {video.songTitle && (
          <span className="absolute top-2 left-2 px-2.5 py-1 text-[10px] uppercase tracking-widest font-bold bg-stage-950/80 backdrop-blur text-spotlight rounded border border-spotlight/30">
            ♪ {video.songTitle}
          </span>
        )}
      </Link>

      {/* Body */}
      <div className="p-5">
        <Link href={`/v/${video.id}`} className="block group/title">
          <h3 className="font-display text-xl font-bold leading-tight mb-2 group-hover/title:text-spotlight transition-colors line-clamp-2">
            {video.title}
          </h3>
        </Link>

        {video.uploader && (
          <Link
            href={`/u/${video.uploader.username}`}
            className="inline-flex items-center gap-2 group/u"
          >
            <div className="w-7 h-7 rounded-full bg-stage-700 flex items-center justify-center overflow-hidden shrink-0">
              {video.uploader.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={video.uploader.avatarUrl}
                  alt={video.uploader.username}
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-xs font-bold text-haze">
                  {video.uploader.username[0]?.toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold group-hover/u:text-spotlight transition-colors">
                @{video.uploader.username}
              </span>
              {video.uploader.championTitle && (
                <span className="text-[10px] uppercase tracking-wider text-gold font-bold">
                  ★ {video.uploader.championTitle}
                </span>
              )}
            </div>
          </Link>
        )}

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-stage-700/40 text-xs text-haze/70 tabular">
          <span>{timeAgo(video.createdAt)}</span>
          <span>
            {video.viewCount} {video.viewCount === 1 ? 'view' : 'views'}
          </span>
        </div>
      </div>
    </article>
  );
}
