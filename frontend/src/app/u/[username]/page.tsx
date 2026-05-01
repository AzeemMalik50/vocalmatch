'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PerformanceCard from '@/components/PerformanceCard';
import { PublicUser, VideoDto, VOICE_TYPE_LABELS, api } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const PAGE_SIZE = 12;

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [videos, setVideos] = useState<VideoDto[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await api.getProfile(username);
        if (cancelled) return;
        setProfile(p);
        const v = await api.listVideos({
          uploaderId: p.id,
          limit: PAGE_SIZE,
          offset: 0,
        });
        if (!cancelled) {
          setVideos(v.items);
          setHasMore(v.hasMore);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [username]);

  const isOwnProfile = currentUser?.username === profile?.username;

  const loadMore = async () => {
    if (!profile || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const v = await api.listVideos({
        uploaderId: profile.id,
        limit: PAGE_SIZE,
        offset: videos.length,
      });
      setVideos((prev) => [...prev, ...v.items]);
      setHasMore(v.hasMore);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoadingMore(false);
    }
  };

  // Hide battle/win/streak stats per user preference, unless they've already
  // had a battle (in which case the stats are real and worth showing).
  const showBattleStats =
    profile &&
    (!profile.hideStatsUntilFirstBattle || profile.battleCount > 0);

  return (
    <>
      <Nav />

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-12">
        {loading && (
          <div className="bg-stage-900 border border-stage-700/40 rounded-2xl h-64 skeleton" />
        )}

        {err && (
          <div className="border border-red-900/40 bg-red-950/30 rounded-xl p-6 text-red-300">
            {err}
          </div>
        )}

        {profile && (
          <>
            <div className="relative bg-gradient-to-br from-stage-800 via-stage-900 to-stage-950 border border-stage-700 rounded-2xl overflow-hidden mb-12">
              <div
                className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-spotlight/10 blur-3xl pointer-events-none"
              />

              <div className="relative z-10 p-8 md:p-12">
                <div className="flex flex-col md:flex-row md:items-end gap-8">
                  <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-gradient-to-br from-stage-700 to-stage-900 border-4 border-spotlight/40 flex items-center justify-center overflow-hidden shrink-0 shadow-2xl">
                    {profile.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={profile.avatarUrl}
                        alt={profile.username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="font-display text-5xl md:text-6xl font-black text-haze">
                        {profile.username[0]?.toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-xs uppercase tracking-[0.3em] text-haze/60 mb-2">
                      Performer
                      {profile.privateProfile && isOwnProfile && (
                        <span className="ml-2 text-spotlight">· Private</span>
                      )}
                    </p>

                    {profile.displayName ? (
                      <>
                        <h1 className="font-display text-4xl md:text-5xl font-bold leading-tight">
                          {profile.displayName}
                        </h1>
                        <p className="text-haze mt-1 font-medium">
                          @{profile.username}
                        </p>
                      </>
                    ) : (
                      <h1 className="font-display text-4xl md:text-5xl font-bold leading-tight">
                        @{profile.username}
                      </h1>
                    )}

                    {profile.championTitle && (
                      <p className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 bg-gold/10 border border-gold/30 rounded-full text-sm font-bold text-gold">
                        ★ {profile.championTitle}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 text-sm text-haze">
                      {profile.voiceType && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-spotlight">♪</span>
                          {VOICE_TYPE_LABELS[profile.voiceType]}
                        </span>
                      )}
                      {profile.location && (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="text-spotlight">◍</span>
                          {profile.location}
                        </span>
                      )}
                    </div>

                    {profile.bio && (
                      <p className="mt-4 text-haze leading-relaxed max-w-2xl whitespace-pre-wrap">
                        {profile.bio}
                      </p>
                    )}

                    {profile.genres && profile.genres.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-4">
                        {profile.genres.map((g) => (
                          <span
                            key={g}
                            className="text-xs uppercase tracking-wider px-2.5 py-1 bg-stage-800 border border-stage-700 rounded-full text-haze font-bold"
                          >
                            {g}
                          </span>
                        ))}
                      </div>
                    )}

                    <SocialLinks profile={profile} />

                    {isOwnProfile && (
                      <Link
                        href="/settings"
                        className="inline-block mt-6 px-4 py-2 text-sm font-bold border border-stage-700 hover:border-spotlight hover:text-spotlight rounded-md transition-colors"
                      >
                        Edit profile →
                      </Link>
                    )}
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-10 pt-8 border-t border-stage-700/60">
                  <Stat label="Performances" value={videos.length} />
                  {showBattleStats ? (
                    <>
                      <Stat
                        label="Battles"
                        value={profile.battleCount}
                        dimmed={profile.battleCount === 0}
                        teaser={profile.battleCount === 0 ? 'Main Stage' : undefined}
                      />
                      <Stat
                        label="Wins"
                        value={profile.winCount}
                        dimmed={profile.winCount === 0}
                        teaser={profile.winCount === 0 ? 'Main Stage' : undefined}
                      />
                      <Stat
                        label="Streak"
                        value={profile.currentStreak}
                        dimmed={profile.currentStreak === 0}
                        teaser={profile.currentStreak === 0 ? 'Main Stage' : undefined}
                      />
                    </>
                  ) : (
                    <div className="md:col-span-3 flex items-center text-sm text-haze/60 italic">
                      Battle stats hidden until {isOwnProfile ? 'your' : 'their'} first
                      battle.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mb-6 flex items-end justify-between">
              <div>
                <h2 className="font-display text-3xl font-bold">
                  Performances
                </h2>
                <p className="text-sm text-haze/70 mt-1">
                  {videos.length === 0
                    ? isOwnProfile
                      ? "You haven't taken the stage yet."
                      : "Hasn't taken the stage yet."
                    : `${videos.length}${hasMore ? '+' : ''} ${
                        videos.length === 1 ? 'upload' : 'uploads'
                      }`}
                </p>
              </div>
              {isOwnProfile && (
                <Link
                  href="/upload"
                  className="text-sm text-spotlight font-bold hover:opacity-90"
                >
                  + Add another
                </Link>
              )}
            </div>

            {videos.length === 0 && isOwnProfile && (
              <div className="border-2 border-dashed border-stage-700 rounded-2xl p-12 text-center">
                <p className="font-display text-2xl mb-2">Your stage awaits.</p>
                <p className="text-haze mb-6">
                  Upload your first performance to start building your profile.
                </p>
                <Link
                  href="/upload"
                  className="inline-block px-5 py-3 bg-spotlight text-white font-bold rounded-md hover:bg-spotlight-dim transition-colors"
                >
                  Upload your first
                </Link>
              </div>
            )}

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((v) => (
                <PerformanceCard key={v.id} video={v} />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-10">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-3 bg-stage-800 border border-stage-700 hover:border-spotlight/50 font-bold rounded-md transition-colors disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <Footer />
    </>
  );
}

function Stat({
  label,
  value,
  dimmed,
  teaser,
}: {
  label: string;
  value: number;
  dimmed?: boolean;
  teaser?: string;
}) {
  return (
    <div>
      <div
        className={`font-display text-3xl md:text-4xl font-black tabular ${
          dimmed ? 'text-haze/40' : ''
        }`}
      >
        {value}
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs uppercase tracking-widest text-haze/60">
          {label}
        </span>
        {teaser && (
          <span className="text-[9px] uppercase tracking-widest text-spotlight/60 font-bold">
            {teaser}
          </span>
        )}
      </div>
    </div>
  );
}

function SocialLinks({ profile }: { profile: PublicUser }) {
  const links: { label: string; href: string; icon: string }[] = [];

  if (profile.instagramHandle) {
    links.push({
      label: profile.instagramHandle,
      href: `https://instagram.com/${profile.instagramHandle.replace(/^@/, '')}`,
      icon: 'IG',
    });
  }
  if (profile.tiktokHandle) {
    links.push({
      label: profile.tiktokHandle,
      href: `https://tiktok.com/@${profile.tiktokHandle.replace(/^@/, '')}`,
      icon: 'TT',
    });
  }
  if (profile.youtubeChannel) {
    const href = profile.youtubeChannel.startsWith('http')
      ? profile.youtubeChannel
      : `https://youtube.com/${profile.youtubeChannel}`;
    links.push({ label: 'YouTube', href, icon: 'YT' });
  }
  if (profile.websiteUrl) {
    const href = profile.websiteUrl.startsWith('http')
      ? profile.websiteUrl
      : `https://${profile.websiteUrl}`;
    links.push({ label: 'Website', href, icon: '↗' });
  }

  if (links.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-5">
      {links.map((l) => (
        <a
          key={l.href}
          href={l.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-bold bg-stage-800 hover:bg-stage-700 border border-stage-700 hover:border-spotlight/40 rounded-md transition-colors"
        >
          <span className="text-spotlight">{l.icon}</span>
          {l.label}
        </a>
      ))}
    </div>
  );
}
