'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import PerformanceCard from '@/components/PerformanceCard';
import {
  api,
  GENRE_OPTIONS,
  SORT_LABELS,
  VideoDto,
  VideoSort,
  VOICE_TYPE_LABELS,
  VoiceType,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';

const PAGE_SIZE = 12;

export default function HomePage() {
  const { user, loading: authLoading, refresh } = useAuth();

  // Filters
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [voiceType, setVoiceType] = useState<VoiceType | ''>('');
  const [genre, setGenre] = useState('');
  const [hasThumbnail, setHasThumbnail] = useState(false);
  const [sort, setSort] = useState<VideoSort>('newest');

  // Feed state
  const [videos, setVideos] = useState<VideoDto[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reqIdRef = useRef(0);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Sync profile completion state on mount for logged-in users
  useEffect(() => {
    if (user) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const filterKey = useMemo(
    () =>
      JSON.stringify({
        debouncedSearch,
        voiceType,
        genre,
        hasThumbnail,
        sort,
      }),
    [debouncedSearch, voiceType, genre, hasThumbnail, sort],
  );

  // Reload from offset 0 whenever any filter changes
  useEffect(() => {
    if (authLoading) return;
    const reqId = ++reqIdRef.current;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setErr(null);
        const res = await api.listVideos({
          search: debouncedSearch || undefined,
          voiceType: voiceType || undefined,
          genre: genre || undefined,
          hasThumbnail,
          sort,
          limit: PAGE_SIZE,
          offset: 0,
        });
        if (cancelled || reqIdRef.current !== reqId) return;
        setVideos(res.items);
        setHasMore(res.hasMore);
      } catch (e: any) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, authLoading]);

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const res = await api.listVideos({
        search: debouncedSearch || undefined,
        voiceType: voiceType || undefined,
        genre: genre || undefined,
        hasThumbnail,
        sort,
        limit: PAGE_SIZE,
        offset: videos.length,
      });
      setVideos((prev) => [...prev, ...res.items]);
      setHasMore(res.hasMore);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const filtersActive =
    !!debouncedSearch || !!voiceType || !!genre || hasThumbnail || sort !== 'newest';

  const clearFilters = () => {
    setSearch('');
    setVoiceType('');
    setGenre('');
    setHasThumbnail(false);
    setSort('newest');
  };

  return (
    <>
      <Nav />

      {user && user.profileCompleted === false && (
        <div className="relative z-10 bg-spotlight/10 border-b border-spotlight/20">
          <div className="max-w-7xl mx-auto px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm">
              <span className="font-bold text-spotlight">
                Finish your profile.
              </span>{' '}
              <span className="text-haze">
                Voice type, genres, photo — it takes a minute and helps voters
                connect with your performances.
              </span>
            </p>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-spotlight text-white font-bold text-xs uppercase tracking-widest rounded-md hover:bg-spotlight-dim transition-colors whitespace-nowrap"
            >
              Complete profile →
            </Link>
          </div>
        </div>
      )}

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-stage-700/40">
        <div
          className="spotlight-cone animate-spotlight-sweep"
          style={{ top: '-200px', left: '50%', transform: 'translateX(-50%)' }}
        />

        <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 md:py-28 grid md:grid-cols-12 gap-10 items-end">
          <div className="md:col-span-7">
            <h1 className="font-display font-black text-6xl md:text-8xl leading-[0.9] mb-6">
              One song.<br />
              <span className="italic font-normal text-haze">Two voices.</span><br />
              <span className="text-spotlight">One crown.</span>
            </h1>

            <p className="font-display italic text-2xl md:text-3xl text-spotlight mb-6">
              Who owns it?
            </p>

            <p className="text-lg md:text-xl text-haze max-w-xl leading-relaxed mb-3">
              Two singers perform the same song; you decide who wins.
            </p>

            <p className="text-lg md:text-xl text-haze max-w-xl leading-relaxed mb-8">
              The winner becomes the{' '}
              <span className="font-bold text-white">Official Voice</span> of
              the song… until someone beats them.
            </p>

            <div className="flex flex-wrap gap-3">
              <a
                href="#feed"
                className="px-6 py-3.5 bg-spotlight text-white font-bold hover:bg-spotlight-dim transition-colors rounded-md shadow-lg shadow-spotlight/30 uppercase tracking-widest text-sm"
              >
                Watch &amp; Vote
              </a>
              {user ? (
                <Link
                  href="/upload"
                  className="px-6 py-3.5 border border-stage-700 text-haze hover:opacity-90 hover:border-stage-600 font-bold transition-colors rounded-md uppercase tracking-widest text-sm"
                >
                  Take the Stage
                </Link>
              ) : (
                <Link
                  href="/signup"
                  className="px-6 py-3.5 border border-stage-700 text-haze hover:opacity-90 hover:border-stage-600 font-bold transition-colors rounded-md uppercase tracking-widest text-sm"
                >
                  Take the Stage
                </Link>
              )}
            </div>
          </div>

          <div className="md:col-span-5">
            <div className="relative bg-stage-900 border border-stage-700 rounded-2xl p-6 overflow-hidden">
              <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full bg-spotlight/20 blur-3xl" />
              <div className="relative z-10">
                <p className="text-xs uppercase tracking-widest text-spotlight font-bold mb-3">
                  The First Battle
                </p>
                <h3 className="font-display text-2xl font-bold mb-3 leading-tight">
                  Two performers.<br />
                  One Centerstage Song.
                </h3>
                <p className="text-sm text-haze leading-relaxed mb-5">
                  24–48 hours to decide. You can only pick one.
                </p>
                <div className="flex items-center justify-center gap-3 py-4 border-y border-stage-700/60 mb-4">
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-stage-800 border-2 border-spotlight/40 flex items-center justify-center font-bold text-haze">
                      A
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-haze/60 mt-1">
                      Singer
                    </span>
                  </div>
                  <span className="font-display font-black text-2xl text-spotlight italic">
                    vs
                  </span>
                  <div className="flex flex-col items-center">
                    <div className="w-12 h-12 rounded-full bg-stage-800 border-2 border-gold/40 flex items-center justify-center font-bold text-haze">
                      B
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-haze/60 mt-1">
                      Singer
                    </span>
                  </div>
                </div>
                <p className="text-xs text-haze/60 leading-relaxed">
                  Sign up to cast the first vote.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FIRST BATTLE COMING SOON */}
      <section className="relative z-10 border-b border-stage-700/40">
        <div className="max-w-7xl mx-auto px-6 py-12 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-spotlight font-bold mb-3">
            First Battle Coming Soon
          </p>
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">
            We're preparing the first matchup now.
          </h2>
          <p className="text-haze">Once ready, voting opens.</p>
        </div>
      </section>

      {/* THE CHALLENGE — Red Phone */}
      <section className="relative z-10 border-b border-stage-700/40 overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-spotlight/10 blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-6 py-20 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-spotlight font-bold mb-3">
              The Challenge
            </p>
            <h2 className="font-display text-4xl md:text-5xl font-bold mb-6 leading-tight">
              Think you can take<br />the crown?
            </h2>
            <p className="text-haze mb-2">If selected, you face the champion.</p>
          </div>
          <ol className="space-y-4">
            <li className="flex items-start gap-4 bg-stage-900/60 border border-stage-700/60 rounded-xl p-5">
              <span className="w-9 h-9 rounded-full bg-spotlight/15 border border-spotlight/40 flex items-center justify-center font-bold text-spotlight shrink-0">
                1
              </span>
              <div>
                <p className="font-display text-lg font-bold">Download the track.</p>
                <p className="text-sm text-haze/70">The official Centerstage Song.</p>
              </div>
            </li>
            <li className="flex items-start gap-4 bg-stage-900/60 border border-stage-700/60 rounded-xl p-5">
              <span className="w-9 h-9 rounded-full bg-spotlight/15 border border-spotlight/40 flex items-center justify-center font-bold text-spotlight shrink-0">
                2
              </span>
              <div>
                <p className="font-display text-lg font-bold">Record your version.</p>
                <p className="text-sm text-haze/70">Your voice, your take.</p>
              </div>
            </li>
            <li className="flex items-start gap-4 bg-stage-900/60 border border-stage-700/60 rounded-xl p-5">
              <span className="w-9 h-9 rounded-full bg-spotlight/15 border border-spotlight/40 flex items-center justify-center font-bold text-spotlight shrink-0">
                3
              </span>
              <div>
                <p className="font-display text-lg font-bold">Upload your challenge.</p>
                <p className="text-sm text-haze/70">Step into the queue.</p>
              </div>
            </li>
          </ol>
        </div>
      </section>

      {/* FEED */}
      <main id="feed" className="relative z-10 max-w-7xl mx-auto px-6 py-16 scroll-mt-20">
        <div className="flex items-end justify-between mb-8">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-haze/60 mb-2">
              The Stage
            </p>
            <h2 className="font-display text-4xl font-bold">
              Watch new performances
            </h2>
          </div>
          {user && (
            <Link
              href="/upload"
              className="hidden sm:inline-flex text-sm text-spotlight font-bold hover:opacity-90 transition-colors"
            >
              + Add yours
            </Link>
          )}
        </div>

        {/* Filter / sort / search bar */}
        <div className="bg-stage-900/60 border border-stage-700/60 rounded-xl p-4 mb-8 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="relative flex-1">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 text-haze/50"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, song, or @username"
                className="w-full pl-9 pr-4 py-2.5 bg-stage-900 border border-stage-700 rounded-md text-sm focus:outline-none focus:border-spotlight transition-colors"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as VideoSort)}
              className="px-3 py-2.5 bg-stage-900 border border-stage-700 rounded-md text-sm font-semibold focus:outline-none focus:border-spotlight transition-colors cursor-pointer"
            >
              {(Object.keys(SORT_LABELS) as VideoSort[]).map((s) => (
                <option key={s} value={s}>
                  {SORT_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={voiceType}
              onChange={(e) => setVoiceType(e.target.value as VoiceType | '')}
              className="px-3 py-2 bg-stage-900 border border-stage-700 rounded-md text-xs font-semibold focus:outline-none focus:border-spotlight transition-colors cursor-pointer"
            >
              <option value="">All voice types</option>
              {(Object.keys(VOICE_TYPE_LABELS) as VoiceType[]).map((v) => (
                <option key={v} value={v}>
                  {VOICE_TYPE_LABELS[v]}
                </option>
              ))}
            </select>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="px-3 py-2 bg-stage-900 border border-stage-700 rounded-md text-xs font-semibold focus:outline-none focus:border-spotlight transition-colors cursor-pointer"
            >
              <option value="">All genres</option>
              {GENRE_OPTIONS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 px-3 py-2 bg-stage-900 border border-stage-700 rounded-md text-xs font-semibold cursor-pointer hover:border-stage-600 transition-colors">
              <input
                type="checkbox"
                checked={hasThumbnail}
                onChange={(e) => setHasThumbnail(e.target.checked)}
                className="accent-spotlight"
              />
              Has thumbnail
            </label>
            {filtersActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="ml-auto text-xs font-bold text-spotlight hover:opacity-80"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {loading && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {err && !loading && (
          <div className="border border-red-900/40 bg-red-950/30 rounded-xl p-6 text-red-300">
            <p className="font-bold mb-1">Failed to fetch</p>
            <p className="text-sm opacity-80">{err}</p>
          </div>
        )}

        {!loading && !err && videos.length === 0 && (
          <div className="border-2 border-dashed border-stage-700 rounded-2xl p-16 text-center">
            {filtersActive ? (
              <>
                <p className="font-display text-3xl mb-3">No matches.</p>
                <p className="text-haze mb-6">
                  Try a broader search, or clear your filters.
                </p>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-block px-6 py-3 bg-spotlight text-white font-bold rounded-md hover:bg-spotlight-dim transition-colors"
                >
                  Clear filters
                </button>
              </>
            ) : (
              <>
                <p className="font-display text-3xl mb-3">The stage is empty.</p>
                <p className="text-haze mb-8">
                  Be the first voice on VocalMatch.
                </p>
                {user ? (
                  <Link
                    href="/upload"
                    className="inline-block px-6 py-3 bg-spotlight text-white font-bold rounded-md hover:bg-spotlight-dim transition-colors"
                  >
                    Upload your performance
                  </Link>
                ) : (
                  <Link
                    href="/signup"
                    className="inline-block px-6 py-3 bg-spotlight text-white font-bold rounded-md hover:bg-spotlight-dim transition-colors"
                  >
                    Sign up to upload
                  </Link>
                )}
              </>
            )}
          </div>
        )}

        {!loading && videos.length > 0 && (
          <>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((v, i) => (
                <PerformanceCard key={v.id} video={v} priority={i < 3} />
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center mt-10">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-6 py-3 bg-stage-800 border border-stage-700 hover:border-spotlight/50 hover:opacity-90 font-bold rounded-md transition-colors disabled:opacity-50"
                >
                  {loadingMore ? 'Loading…' : 'Load more performances'}
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

function SkeletonCard() {
  return (
    <div className="bg-stage-900 border border-stage-700/40 rounded-xl overflow-hidden">
      <div className="aspect-video skeleton" />
      <div className="p-5 space-y-3">
        <div className="h-4 w-3/4 skeleton rounded" />
        <div className="h-3 w-1/2 skeleton rounded" />
        <div className="h-3 w-1/3 skeleton rounded" />
      </div>
    </div>
  );
}
