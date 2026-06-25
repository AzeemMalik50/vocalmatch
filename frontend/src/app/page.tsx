'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Crown,
  Download,
  Eye,
  Flame,
  Headphones,
  Mic,
  Music,
  Play,
  Share2,
  Shield,
  Upload,
  Users,
  Vote,
  Zap,
} from 'lucide-react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import LobbyToast from '@/components/LobbyToast';
import CountdownTimer from '@/components/CountdownTimer';
import {
  api,
  AtRiskCrownDto,
  BattleDto,
  BattleSummaryDto,
  DethronementDto,
  FeaturedSongRiskDto,
  GENRE_OPTIONS,
  PersonalDethronementDto,
  RedPhoneWinnerDto,
  RiskLevel,
  SongDto,
  SongRisk,
  SORT_LABELS,
  VideoDto,
  VideoSort,
  VOICE_TYPE_LABELS,
  VoiceType,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useLobby } from '@/lib/useLobby';
import {
  HERO_MAIN,
  HERO_LIVE_BATTLE,
  HERO_CHAMPION_PORTRAIT,
  HERO_CROWN_AT_RISK,
  HERO_RED_PHONE,
  HERO_DETHRONED,
  HERO_SHARE_POSTER,
} from '@/lib/hero-assets';

/**
 * Phase 3 — Cinematic homepage.
 *
 * Visual structure ported from the design-reference folder
 * (vocal-match-frontend-design). Backend integration is ours — every
 * section pulls real data from the live API rather than the static
 * placeholders the reference shipped with.
 *
 * Sections (top to bottom): Hero, Live Battle, Challenge Flow,
 * Champion, How It Works, The Stage, Recent Winners, CTA Footer.
 */
export default function HomePage() {
  const { user, loading: authLoading, refresh } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && user?.isAdmin) router.replace('/admin');
  }, [authLoading, user?.isAdmin, router]);

  useEffect(() => {
    if (user) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  return (
    <div className="vm-force-dark min-h-screen bg-background relative">
      <Nav />
      {user && user.profileCompleted === false && <ProfileNudge />}
      <Hero user={user} />
      <Reveal><LiveBattle /></Reveal>
      <Reveal><CrownAtRiskPanel /></Reveal>
      <Reveal><ChallengeFlow user={user} /></Reveal>
      <Reveal><ChampionSection /></Reveal>
      <Reveal><DethronedPanel /></Reveal>
      <Reveal><RedPhoneWinnerPanel /></Reveal>
      <Reveal><HowItWorks /></Reveal>
      <Reveal><StageCarousel /></Reveal>
      <Reveal><WinnersCarousel /></Reveal>
      <Reveal><ShareCardsRow /></Reveal>
      <Reveal><CTAFooter user={user} /></Reveal>
      <Footer />
      {/* Floating real-time toast — pops in for ~4s whenever the lobby SSE
          pushes a battle lifecycle event (created / closed / cancelled /
          tied). Anonymous-friendly. */}
      <LobbyToast />
    </div>
  );
}

// ─── Profile nudge ──────────────────────────────────────────────────

function ProfileNudge() {
  return (
    <div className="relative z-10 bg-red-600/10 border-b border-red-600/30">
      <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-bold text-red-600">Finish your profile.</span>{' '}
          <span className="text-gray-400">
            Voice type, genres, photo — it takes a minute and helps voters
            connect with your performances.
          </span>
        </p>
        <Link
          href="/onboarding"
          className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs uppercase tracking-widest rounded-md whitespace-nowrap transition"
        >
          Complete profile →
        </Link>
      </div>
    </div>
  );
}

// ─── 1. Hero ─────────────────────────────────────────────────────────

interface Stats {
  votes: string;
  battles: string;
  challengers: string;
  voicesRaised: string;
}

function Hero({ user }: { user: ReturnType<typeof useAuth>['user'] }) {
  const [stats, setStats] = useState<Stats>({
    votes: '—',
    battles: '—',
    challengers: '—',
    voicesRaised: '—',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await api.getStats();
        if (cancelled) return;
        setStats({
          votes: formatStat(s.totalVotes),
          battles: formatStat(s.totalBattles),
          challengers: formatStat(s.totalChallengers),
          voicesRaised: formatStat(s.voicesRaised),
        });
      } catch {
        // Non-fatal — em-dashes stay if the stats request fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="relative min-h-screen pt-20 bg-black overflow-hidden">
      <div className="absolute inset-0 opacity-30 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[32rem] h-[32rem] bg-red-600 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-[32rem] h-[32rem] bg-red-900 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-2 gap-8 items-center min-h-[calc(100vh-12rem)] py-12">
        <div className="space-y-6">
          <div>
            <h1 className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-white leading-[0.95]">
              One Song.
            </h1>
            <h1 className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-white leading-[0.95]">
              Two Voices.
            </h1>
            <h1 className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl text-red-600 leading-[0.95]">
              One Crown.
            </h1>
          </div>
          <p className="text-sm md:text-base font-bold uppercase tracking-[0.2em] text-yellow-400">
            The voice can be taken at any time.
          </p>
          <p className="text-lg text-gray-300 max-w-md leading-relaxed">
            Two singers perform the same song. The audience decides who owns
            it. The winner becomes the Official Voice... until someone takes
            the crown.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="#live-battle"
              className="red-glow inline-flex items-center justify-center bg-red-600 hover:bg-red-700 text-white text-base py-4 px-8 rounded-lg font-bold uppercase tracking-widest transition"
            >
              <Play className="w-5 h-5 mr-2" />
              Watch &amp; Vote
            </Link>
            <Link
              href={user ? '/upload' : '/signup'}
              className="inline-flex items-center justify-center border border-red-600 text-red-600 hover:bg-red-600/10 text-base py-4 px-8 rounded-lg font-bold uppercase tracking-widest transition"
            >
              <Mic className="w-5 h-5 mr-2" />
              Take the Stage
            </Link>
          </div>
        </div>

        <HeroComposite />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 pb-12">
        <div className="gold-panel grid grid-cols-2 md:grid-cols-4 gap-px bg-yellow-500/20 overflow-hidden">
          <HeroStat value={stats.votes} label="Votes Cast" />
          <HeroStat value={stats.battles} label="Battles" />
          <HeroStat value={stats.challengers} label="Challengers" />
          <HeroStat value={stats.voicesRaised} label="Voices Raised" />
        </div>

        <div className="mt-8 flex justify-center">
          <Link
            href="#live-battle"
            aria-label="Scroll to the live battle"
            className="group inline-flex flex-col items-center gap-1 text-yellow-400/70 hover:text-yellow-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black rounded-full p-2 transition"
          >
            <span className="text-[10px] font-bold uppercase tracking-[0.4em]">
              See the Battle
            </span>
            <ChevronDown
              aria-hidden="true"
              className="w-5 h-5 transition group-hover:translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0"
            />
          </Link>
        </div>
      </div>
    </section>
  );
}

function HeroComposite() {
  // Bug #51 — the "Tonight's Battle" chip used to be decorative copy
  // with no path into the battle. Fetch the current live battle so the
  // chip can deep-link to `/battle/{id}` and surface the battle title
  // as an actual detail. Single one-shot fetch; falls back silently
  // to the static chip when no live battle is in flight.
  const [liveBattle, setLiveBattle] = useState<{
    id: string;
    title: string | null;
  } | null>(null);

  const refetchLive = useCallback(async () => {
    try {
      const resp = await api.listBattles({ status: 'live', limit: 1 });
      if (resp.items.length === 0) {
        // The featured battle was cancelled or completed — drop the link
        // so the chip falls back to its decorative state.
        setLiveBattle(null);
        return;
      }
      const b = resp.items[0];
      setLiveBattle({ id: b.id, title: b.title });
    } catch {
      // Non-fatal — chip renders the static fallback.
    }
  }, []);

  useEffect(() => {
    void refetchLive();
  }, [refetchLive]);

  // Subscribe to the public lobby SSE so the chip swaps to the new
  // battle as soon as admin posts / cancels / closes one — no manual
  // refresh needed. Mirrors the LiveBattle section's wiring below so
  // the hero and the live-battle card stay in sync.
  useLobby(() => {
    void refetchLive();
  });

  return (
    <div className="relative aspect-square w-full max-w-[34rem] mx-auto">
      {/* Twin halo cones — crimson left + gold right, meeting at the
          fire spine in the artwork. Replaces the single radial blur so
          the chrome echoes the dual-portrait composition. */}
      <div aria-hidden="true" className="absolute -inset-10 pointer-events-none">
        <div className="hero-cone-crimson absolute -left-[8%] top-[12%] h-[80%] w-[55%] rounded-full bg-red-600/40 blur-3xl" />
        <div className="hero-cone-gold absolute -right-[8%] top-[12%] h-[80%] w-[55%] rounded-full bg-amber-400/25 blur-3xl" />
      </div>

      <div className="hero-frame hero-enter relative aspect-square w-full overflow-hidden rounded-2xl">
        <Image
          src={HERO_MAIN.src}
          alt={HERO_MAIN.alt}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 600px"
          className="hero-kenburns relative z-0 object-cover"
        />

        {/* Letterbox bands — film-still framing. */}
        <div aria-hidden="true" className="absolute inset-x-0 top-0 z-20 h-[5%] bg-black/85" />
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 z-20 h-[5%] bg-black/85" />

        {/* Cinematic vignette — keeps focus on the singers + fire spine.
            Bug #75 — the original (and the earlier "fix it only below
            sm") radial darkened the corners enough that the four
            corners visually read as faded / hollowed-out in Safari
            (both iPhone and desktop). The cinematic feel comes from
            the letterbox bands + cone glow + grain + sweep stack
            already; the radial doesn't need to do the heavy lifting.
            Dropped the responsive split and tuned to a much gentler
            radial that works at every viewport. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-20 bg-[radial-gradient(ellipse_at_center,transparent_65%,rgba(0,0,0,0.2)_100%)]"
        />

        {/* Fine film grain — editorial polish. */}
        <div
          aria-hidden="true"
          className="hero-grain pointer-events-none absolute inset-0 z-30 opacity-30 mix-blend-overlay"
        />

        {/* Slow diagonal light sweep — cinema rake. */}
        <div
          aria-hidden="true"
          className="hero-sweep pointer-events-none absolute inset-0 z-30"
        />

        {/* Badges — alternating gold + crimson pulses out of phase. */}
        <div className="animate-hero-badge-gold hero-enter hero-enter-delay-2 absolute left-4 top-[8%] z-40 inline-flex items-center gap-2 rounded-full border border-amber-400/50 bg-black/70 px-3 py-1.5 backdrop-blur">
          <Crown className="h-4 w-4 text-amber-400" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
            Official Voice
          </span>
        </div>

        <div className="animate-hero-badge-crimson hero-enter hero-enter-delay-2 absolute right-4 top-[8%] z-40 inline-flex items-center gap-2 rounded-full border border-red-500/50 bg-black/70 px-3 py-1.5 backdrop-blur">
          <Zap className="h-4 w-4 text-red-500" />
          <span className="text-[11px] font-bold uppercase tracking-widest text-red-500">
            Challenger
          </span>
        </div>

        {/* Bottom-center "Tonight's Battle" chip — anchors the scene
            as live + present. Centering survives the entrance animation
            via the `.hero-enter.left-1/2:not(.crown-glow)` rule in
            globals.css (see Bug #50 note there). When a live battle
            exists, the chip is a deep link into `/battle/{id}` and
            surfaces the battle title inline; otherwise it stays as a
            decorative chip. */}
        {liveBattle ? (
          <Link
            href={`/battle/${liveBattle.id}`}
            aria-label={
              liveBattle.title
                ? `Open tonight's battle: ${liveBattle.title}`
                : "Open tonight's battle"
            }
            className="hero-enter hero-enter-delay-3 group absolute bottom-[8%] left-1/2 z-40 inline-flex max-w-[88%] -translate-x-1/2 items-center gap-2 rounded-full border border-yellow-500/60 bg-black/80 px-4 py-1.5 backdrop-blur transition-colors hover:border-yellow-400 hover:bg-black/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
          >
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500"
            />
            {/* Bug #71 — on iPhone widths the wide `tracking-[0.3em]`
                stretched the label far enough that it could break at
                the space in "Tonight's Battle", showing on two lines.
                `whitespace-nowrap` keeps it on a single line; the
                outer `truncate` still collapses an overlong battle
                title into an ellipsis when there isn't room. The
                tracking tightens slightly under `sm:` so the chip
                doesn't crowd the chevron on tiny screens. */}
            <span className="truncate whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.2em] sm:tracking-[0.3em] text-gray-200">
              Tonight&apos;s Battle
              {liveBattle.title ? (
                <>
                  <span aria-hidden="true" className="mx-1.5 text-yellow-400/70">·</span>
                  <span className="text-yellow-200">{liveBattle.title}</span>
                </>
              ) : null}
            </span>
            <ChevronRight
              aria-hidden="true"
              className="h-3 w-3 shrink-0 text-yellow-400 transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        ) : (
          <div className="hero-enter hero-enter-delay-3 absolute bottom-[8%] left-1/2 z-40 inline-flex -translate-x-1/2 items-center gap-2 rounded-full border border-yellow-500/40 bg-black/75 px-4 py-1.5 backdrop-blur">
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-red-500"
            />
            {/* Bug #71 — `whitespace-nowrap` keeps the label on a
                single line on iPhone widths where the wide tracking
                otherwise broke at the space. */}
            <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.2em] sm:tracking-[0.3em] text-gray-200">
              Tonight&apos;s Battle
            </span>
          </div>
        )}
      </div>

      {/* Crown emblem — literalizes "One Crown" from the headline,
          hangs off the top rim of the frame like a medallion. */}
      <div
        aria-hidden="true"
        className="hero-enter hero-enter-delay-1 crown-glow absolute left-1/2 top-0 z-50 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-yellow-400/60 bg-black"
      >
        <Crown className="h-6 w-6 text-yellow-400" />
      </div>
    </div>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-black/70 backdrop-blur p-4 md:p-5 text-center">
      <div className="text-2xl md:text-3xl font-bold text-red-600 tabular-nums">
        {value}
      </div>
      <div className="text-[10px] md:text-xs text-gray-400 mt-1 uppercase tracking-widest">
        {label}
      </div>
    </div>
  );
}

// ─── 2. Live Battle ──────────────────────────────────────────────────

function LiveBattle() {
  const [battle, setBattle] = useState<BattleDto | null>(null);
  const [a, setA] = useState<VideoDto | null>(null);
  const [b, setB] = useState<VideoDto | null>(null);
  // Bug #57 — the section used to fetch a single live battle and pretend
  // it was the only one. Track the other concurrent live battles
  // separately so we can render them as a compact grid below the
  // featured card. List endpoint already returns summary DTOs, no
  // per-battle detail fetch needed.
  const [extraBattles, setExtraBattles] = useState<BattleSummaryDto[]>([]);
  // Separate loading flag so the "no live battle" empty state only
  // renders AFTER we've heard back from the server. Previously the
  // empty state flashed during initial fetch because `!battle || !a || !b`
  // is true on first render too.
  const [loading, setLoading] = useState(true);

  // Extracted so the lobby SSE listener below can re-run it whenever
  // a battle lifecycle event arrives — covers create / cancel / close
  // so the hero stays current without a manual refresh.
  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await api.listBattles({ status: 'live', limit: 20 });
      if (resp.items.length === 0) {
        // The featured battle was cancelled / completed and there's no
        // replacement live one — reset to the empty-state copy.
        setBattle(null);
        setA(null);
        setB(null);
        setExtraBattles([]);
        return;
      }
      const featured = await api.getBattle(resp.items[0].id);
      setBattle(featured);
      setExtraBattles(resp.items.slice(1));
      const [perfA, perfB] = await Promise.all([
        api.getVideo(featured.performanceAId),
        api.getVideo(featured.performanceBId),
      ]);
      setA(perfA);
      setB(perfB);
    } catch {
      // Non-fatal — section degrades to empty state.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Real-time refresh — every lifecycle event on the public lobby
  // channel triggers a re-pick of the featured battle. If the current
  // one was just cancelled, this will swap it out (or fall to the
  // empty state) without requiring a page reload.
  useLobby(() => {
    void refetch();
  });

  return (
    <section id="live-battle" className="bg-background py-12 md:py-20">
      <div className="max-w-7xl mx-auto px-4">
        <div className="relative w-full h-56 md:h-72 lg:h-80 rounded-2xl overflow-hidden mb-12">
          <Image
            src={HERO_LIVE_BATTLE.src}
            alt={HERO_LIVE_BATTLE.alt}
            fill
            sizes="(max-width: 1280px) 100vw, 1280px"
            className="object-cover object-[center_30%]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/30 to-black/80" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 md:p-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-3 h-3 bg-red-600 rounded-full animate-pulse" />
              <h2 className="text-2xl md:text-3xl font-bold text-white tracking-widest">
                LIVE BATTLE
              </h2>
            </div>
            <p className="text-sm md:text-base text-gray-300 max-w-xl">
              Official Voice vs Challenger. Two singers, same song — vote
              before the clock runs out.
            </p>
          </div>
        </div>

        {loading ? (
          <LiveBattleSkeleton />
        ) : !battle || !a || !b ? (
          <div className="gold-panel text-center py-16 bg-card/50 backdrop-blur">
            <p className="text-2xl font-bold text-white mb-2">
              No live battle right now.
            </p>
            <p className="text-gray-400">
              The next one drops as soon as the admin pairs the next contender.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <BattleSideCard
              performance={a}
              side="A"
              label="Current Official Voice"
              tone="red"
            />

            <div className="flex flex-col items-center justify-center gap-6">
              <div className="text-6xl font-black text-white">VS</div>
              <div className="bg-card/50 backdrop-blur border border-red-600/30 rounded-2xl p-8 w-full flex justify-center">
                {/* Bug #65 — use the shared CountdownTimer so this
                    surface is in lockstep with the admin + battle-
                    detail pages. Was previously a bespoke 4-cell
                    Days/Hrs/Mins/Secs block backed by a local
                    setInterval, which drifted from the standard
                    H:M:S formatting used everywhere else. */}
                <CountdownTimer
                  endsAt={battle.votingClosesAt}
                  size="large"
                />
              </div>
              <Link
                href={`/battle/${battle.id}`}
                className="w-full inline-flex items-center justify-center bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-lg uppercase tracking-widest transition"
              >
                Watch Battle
              </Link>
            </div>

            <BattleSideCard
              performance={b}
              side="B"
              label="Challenger"
              tone="blue"
            />
          </div>
        )}

        {/* Other concurrently-live battles. The featured card above is
            the marquee; this strip surfaces every other battle that's
            also accepting votes right now so visitors don't think there's
            only one. Renders nothing when there's just the one featured
            battle. */}
        {!loading && extraBattles.length > 0 && (
          <div className="mt-12">
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-red-500 font-bold mb-1">
                  Also live
                </p>
                <h3 className="font-display text-2xl md:text-3xl font-bold text-white">
                  More battles open for voting
                </h3>
              </div>
              <p className="hidden sm:block text-sm text-gray-400 tabular-nums">
                {extraBattles.length}{' '}
                {extraBattles.length === 1 ? 'battle' : 'battles'}
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {extraBattles.map((b) => (
                <ExtraLiveBattleCard key={b.id} battle={b} />
              ))}
            </div>
          </div>
        )}

        <BattlePillarsRow />
      </div>
    </section>
  );
}

function ExtraLiveBattleCard({ battle }: { battle: BattleSummaryDto }) {
  // Compact link card for any live battle beyond the featured one.
  // Uses the battle's own `title` (backend always populates it, even
  // when admin doesn't set one — see Bug #56) so the row reads
  // cleanly without a per-battle song lookup.
  return (
    <Link
      href={`/battle/${battle.id}`}
      className="group block bg-card/50 backdrop-blur border border-red-600/30 hover:border-red-500 rounded-2xl p-5 transition-colors"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
        </span>
        <span className="text-[10px] uppercase tracking-widest font-bold text-red-500">
          Live · accepting votes
        </span>
      </div>
      <h4 className="font-display font-bold text-lg text-white mb-3 leading-tight group-hover:text-red-400 transition-colors line-clamp-2">
        {battle.title || 'Live battle'}
      </h4>
      <div className="flex items-end justify-between pt-3 border-t border-red-600/20">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-gray-500 font-bold mb-0.5">
            Closes
          </p>
          <p className="text-xs text-gray-300 tabular-nums">
            {new Date(battle.votingClosesAt).toLocaleString()}
          </p>
        </div>
        <span className="text-xs text-red-400 font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
          Vote →
        </span>
      </div>
    </Link>
  );
}

function LiveBattleSkeleton() {
  // Mirrors the loaded 3-column layout (side card | VS + countdown | side
  // card) so the section doesn't reflow when the data arrives. Uses the
  // existing `.skeleton` shimmer class from globals.css.
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8" aria-busy="true" aria-label="Loading live battle">
      <div className="bg-card/50 backdrop-blur border border-border rounded-2xl p-6">
        <div className="aspect-square rounded-xl skeleton mb-4" />
        <div className="h-9 w-9 rounded-full skeleton mb-3" />
        <div className="h-4 w-24 skeleton mb-2 rounded" />
        <div className="h-3 w-32 skeleton rounded" />
      </div>

      <div className="flex flex-col items-center justify-center gap-6">
        <div className="text-6xl font-black text-white/30">VS</div>
        <div className="bg-card/50 backdrop-blur border border-border rounded-2xl p-8 w-full">
          <div className="grid grid-cols-4 gap-4 text-center">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}>
                <div className="h-8 w-full skeleton rounded mb-2" />
                <div className="h-3 w-10 skeleton rounded mx-auto" />
              </div>
            ))}
          </div>
        </div>
        <div className="h-12 w-full skeleton rounded-lg" />
      </div>

      <div className="bg-card/50 backdrop-blur border border-border rounded-2xl p-6">
        <div className="aspect-square rounded-xl skeleton mb-4" />
        <div className="h-9 w-9 rounded-full skeleton mb-3" />
        <div className="h-4 w-24 skeleton mb-2 rounded" />
        <div className="h-3 w-32 skeleton rounded" />
      </div>
    </div>
  );
}

function BattlePillarsRow() {
  const pillars = [
    { icon: Users, label: 'Anyone Can Challenge' },
    { icon: Vote, label: 'The Audience Decides' },
    { icon: Crown, label: 'The Voice Can Be Taken at Any Time' },
    { icon: Flame, label: 'Gain Fame · Go Viral' },
    { icon: Shield, label: 'Defend Your Crown' },
  ];
  return (
    <div className="mt-10 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {pillars.map(({ icon: Icon, label }) => (
        <div
          key={label}
          className="flex flex-col items-center text-center gap-2 bg-black/60 border border-yellow-500/30 rounded-xl p-4"
        >
          <Icon className="w-6 h-6 text-yellow-400" />
          <div className="text-[11px] md:text-xs font-bold uppercase tracking-widest text-white leading-snug">
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}

function BattleSideCard({
  performance,
  side,
  label,
  tone,
}: {
  performance: VideoDto;
  side: 'A' | 'B';
  label: string;
  tone: 'red' | 'blue';
}) {
  const isRed = tone === 'red';
  const borderColor = isRed ? 'border-red-600/30' : 'border-blue-500/30';
  const accentColor = isRed ? 'text-red-600' : 'text-blue-500';
  const playBg = isRed ? 'bg-red-600/20' : 'bg-blue-500/20';
  const gradientFrom = isRed
    ? 'from-red-600/30 to-red-900/30'
    : 'from-blue-500/30 to-blue-900/30';
  const blurFrom = isRed
    ? 'from-red-600/20 to-red-900/20'
    : 'from-blue-500/20 to-blue-900/20';

  return (
    <Link href={`/v/${performance.id}`} className="relative group block">
      <div
        className={`absolute inset-0 bg-gradient-to-br ${blurFrom} rounded-2xl blur-xl group-hover:blur-2xl transition`}
      />
      <div
        className={`relative bg-card/50 backdrop-blur border ${borderColor} rounded-2xl overflow-hidden p-6`}
      >
        <div
          className={`aspect-square bg-gradient-to-br ${gradientFrom} rounded-xl mb-4 flex items-center justify-center overflow-hidden relative`}
        >
          {/* Visual fallback chain:
              1. Performance thumbnail (best — actually shows the take)
              2. Singer's profile photo (next best — at least the person)
              3. Big username initial (we always have a username)
              The previous empty red square gave no signal about who's
              singing; the avatar/initial fallback fixes that. */}
          {performance.thumbnailUrl ? (
            <Image
              src={performance.thumbnailUrl}
              alt={performance.title}
              fill
              sizes="(max-width: 1024px) 100vw, 400px"
              className="object-cover"
            />
          ) : performance.uploader?.avatarUrl ? (
            <>
              <Image
                src={performance.uploader.avatarUrl}
                alt={performance.uploader.username}
                fill
                sizes="(max-width: 1024px) 100vw, 400px"
                className="object-cover"
              />
              {/* Soft scrim so the play badge still reads against
                  brightly-lit avatar photos. */}
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"
              />
              <div
                className={`relative w-14 h-14 ${playBg} backdrop-blur-sm rounded-full flex items-center justify-center border border-white/20 shadow-lg`}
              >
                <Play className={`w-7 h-7 ${accentColor} fill-current`} />
              </div>
            </>
          ) : performance.uploader ? (
            <div className="relative flex flex-col items-center justify-center w-full h-full">
              <span className="font-display text-6xl md:text-7xl font-black text-white/85 leading-none">
                {performance.uploader.username[0]?.toUpperCase()}
              </span>
              <div
                className={`mt-4 w-14 h-14 ${playBg} backdrop-blur-sm rounded-full flex items-center justify-center border border-white/20`}
              >
                <Play className={`w-7 h-7 ${accentColor} fill-current`} />
              </div>
            </div>
          ) : (
            <div
              className={`w-16 h-16 ${playBg} rounded-full flex items-center justify-center`}
            >
              <Play className={`w-8 h-8 ${accentColor} fill-current`} />
            </div>
          )}
        </div>
        {/* Bug #14 — the live battle card never rendered the
            performer's avatar even when uploaded. Show it next to the
            username, with the existing initial-fallback for users
            without a photo. */}
        {performance.uploader && (
          <div className="flex items-center gap-2 mb-2">
            <div
              className={`relative h-9 w-9 shrink-0 overflow-hidden rounded-full border ${borderColor} bg-stage-800`}
            >
              {performance.uploader.avatarUrl ? (
                <Image
                  src={performance.uploader.avatarUrl}
                  alt={performance.uploader.username}
                  fill
                  sizes="36px"
                  className="object-cover"
                />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-xs font-bold text-haze">
                  {performance.uploader.username[0]?.toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white truncate">
                @{performance.uploader.username}
              </h3>
              <p className={`text-[10px] ${accentColor} font-bold uppercase tracking-widest`}>
                Side {side}
              </p>
            </div>
          </div>
        )}
        <p
          className={`text-sm ${accentColor} font-bold uppercase tracking-widest`}
        >
          {label}
        </p>
      </div>
    </Link>
  );
}

// ─── 3. Challenge Flow (Red Phone) ───────────────────────────────────

function ChallengeFlow({
  user,
}: {
  user: ReturnType<typeof useAuth>['user'];
}) {
  // Bug #62 — logged-out visitors used to land on /signup, which
  // funneled returning users into account creation instead of letting
  // them authenticate. Most clickers already have an account; send
  // them to /login (which itself links to /signup for genuinely new
  // users) and preserve the challenge intent through the bounce so
  // they land back on the upload-as-challenge flow after signing in.
  const href = user
    ? '/upload?challenge=1'
    : `/login?next=${encodeURIComponent('/upload?challenge=1')}`;

  return (
    <section className="relative bg-background py-12 md:py-20 overflow-hidden">
      {/* Section spotlight — soft crimson backdrop so the section
          doesn't sit on bare black after the hero. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute left-1/2 top-[55%] h-[40rem] w-[60rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-600/15 blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4">
        {/* First column is a definite 20rem on desktop. Using `auto`
            collapses to 0 because percentage widths inside an `auto`
            grid track contribute 0 to max-content, so `w-full max-w-xs`
            on the phone box can't expand the column. A fixed track
            removes the ambiguity in every browser. */}
        <div className="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-10 lg:gap-16 items-center mb-12">
          <div className="relative w-full max-w-xs mx-auto lg:mx-0 aspect-square">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -m-4 rounded-3xl bg-red-600/30 blur-2xl" />
            {/* crimson-pulse wrapper — looks like the phone is ringing.
                Must be absolute inset-0 (not h-full/w-full) so it fills
                the aspect-ratio-sized parent in every browser;
                percentage heights don't resolve against an
                aspect-ratio-computed height. */}
            <div className="crimson-pulse absolute inset-0 overflow-hidden rounded-2xl border border-red-500/40">
              <Image
                src={HERO_RED_PHONE.src}
                alt={HERO_RED_PHONE.alt}
                fill
                sizes="(max-width: 1024px) 90vw, 320px"
                className="object-cover"
              />
            </div>
          </div>
          <div className="text-center lg:text-left">
            <p className="mb-2 inline-flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.3em] text-red-500 lg:justify-start">
              <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
              Red Phone Challenge
            </p>
            <h2 className="mb-3 text-4xl font-black text-white md:text-5xl">
              THINK YOU CAN TAKE THE CROWN?
            </h2>
            <p className="mx-auto max-w-xl text-balance text-lg text-gray-300 lg:mx-0">
              Pick up the red phone. Record your version. The next Official
              Voice could be you.
            </p>
          </div>
        </div>

        {/* Steps row — the cord SVG sits behind the 4 step circles and
            connects them visually. role=list/listitem keeps it
            accessible without forcing <ol>/<li>. */}
        <div className="relative mb-12">
          <svg
            aria-hidden="true"
            preserveAspectRatio="none"
            viewBox="0 0 100 8"
            className="pointer-events-none absolute left-0 right-0 top-[42%] hidden h-16 w-full lg:block"
          >
            <defs>
              <linearGradient id="cord-gradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgb(239,68,68)" stopOpacity="0.9" />
                <stop offset="60%" stopColor="rgb(239,68,68)" stopOpacity="0.85" />
                <stop offset="80%" stopColor="rgb(250,204,21)" stopOpacity="0.95" />
                <stop offset="100%" stopColor="rgb(250,204,21)" stopOpacity="1" />
              </linearGradient>
            </defs>
            {/* Soft glow under-layer */}
            <path
              d="M 12.5 4 Q 25 1, 37.5 4 T 62.5 4 T 87.5 4"
              fill="none"
              stroke="url(#cord-gradient)"
              strokeWidth="1.4"
              strokeLinecap="round"
              opacity="0.35"
            />
            {/* Dashed cord — "current" flows from step 1 to step 4 */}
            <path
              d="M 12.5 4 Q 25 1, 37.5 4 T 62.5 4 T 87.5 4"
              fill="none"
              stroke="url(#cord-gradient)"
              strokeWidth="0.6"
              strokeLinecap="round"
              strokeDasharray="0.25 0.9"
              className="cord-flow"
            />
          </svg>

          <div
            role="list"
            aria-label="Challenge submission steps"
            className="relative z-10 grid grid-cols-1 items-stretch gap-5 lg:grid-cols-4"
          >
            <FlowStep number={1} Icon={Download} title="DOWNLOAD" sub="the track" />
            <FlowStep number={2} Icon={Mic} title="RECORD" sub="your version" />
            <FlowStep number={3} Icon={Upload} title="UPLOAD" sub="your challenge" />
            <FlowStep
              number={4}
              Icon={Crown}
              title="IF SELECTED"
              sub="face the champion"
              reward
            />
          </div>
        </div>

        <div className="relative text-center">
          <Link
            href={href}
            className="red-glow inline-flex items-center rounded-lg bg-red-600 px-12 py-6 text-lg font-bold uppercase tracking-widest text-white transition hover:bg-red-700"
          >
            Challenge Now →
          </Link>
        </div>
      </div>
    </section>
  );
}

function FlowStep({
  Icon,
  number,
  title,
  sub,
  reward,
}: {
  Icon: typeof Download;
  number: number;
  title: string;
  sub: string;
  /** The final reward step (Crown / IF SELECTED) — gold treatment + halo. */
  reward?: boolean;
}) {
  const ring = reward ? 'border-yellow-400' : 'border-red-500';
  const ringBg = reward
    ? 'bg-yellow-500/15 group-hover:bg-yellow-500/25 group-focus-visible:bg-yellow-500/25'
    : 'bg-red-600/15 group-hover:bg-red-600/25 group-focus-visible:bg-red-600/25';
  const ringGlow = reward
    ? 'crown-glow'
    : 'group-hover:shadow-[0_0_24px_rgba(239,68,68,0.45)] group-focus-visible:shadow-[0_0_24px_rgba(239,68,68,0.45)]';
  const iconColor = reward ? 'text-yellow-400' : 'text-red-500';
  const stepLabelColor = reward ? 'text-yellow-400' : 'text-red-400';
  const titleColor = reward ? 'text-yellow-400' : 'text-white';
  const focusRing = reward ? 'focus-visible:ring-yellow-400' : 'focus-visible:ring-red-500';
  // Crimson breathing pulse on non-reward steps, staggered so the row
  // feels alive. The reward step keeps its crown-glow only.
  const pulse = reward ? '' : `step-pulse step-pulse-${number}`;

  return (
    <div
      role="listitem"
      tabIndex={0}
      aria-label={`Step ${number}: ${title} — ${sub}`}
      className={`group relative flex flex-col items-center text-center p-4 rounded-2xl outline-none transition focus-visible:ring-2 ${focusRing} focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
        reward ? 'focus-visible:bg-yellow-500/5' : 'focus-visible:bg-red-500/5'
      }`}
    >
      <div className={`mb-3 text-[10px] font-bold uppercase tracking-[0.3em] ${stepLabelColor}`}>
        Step {String(number).padStart(2, '0')}
      </div>
      {/* Solid black background on the circle so the cord doesn't
          show through behind the icon. */}
      <div
        className={`relative mb-4 flex h-24 w-24 items-center justify-center rounded-full border-2 bg-black transition motion-reduce:transition-none ${ring} ${ringBg} ${ringGlow} ${pulse}`}
      >
        <Icon
          aria-hidden="true"
          className={`h-10 w-10 transition motion-reduce:transition-none group-hover:scale-110 group-focus-visible:scale-110 motion-reduce:group-hover:scale-100 ${iconColor}`}
        />
      </div>
      <h3 className={`mb-1 text-sm font-bold uppercase tracking-widest ${titleColor}`}>
        {title}
      </h3>
      <p className="text-sm text-gray-400">{sub}</p>
    </div>
  );
}

// ─── 4. Champion Section ─────────────────────────────────────────────

function ChampionSection() {
  const { user } = useAuth();
  const [featured, setFeatured] = useState<FeaturedSongRiskDto | null>(null);
  const [personalised, setPersonalised] = useState(false);

  // Bug #80 — historically this always called `getFeaturedRisk()`,
  // which returns the marquee champion (the song with the longest
  // current streak ANYWHERE on the platform). After a user won a
  // battle they'd still see somebody else as "Defending Champion"
  // because that other person's streak was still longer. Personalise
  // the section: if the signed-in viewer is currently a champion of
  // any song, surface their championship here. Falls back to the
  // platform marquee for anonymous visitors and for users who
  // aren't currently champions.
  const refetch = useCallback(async () => {
    try {
      if (user) {
        const mine = await api.getMyAtRiskCrowns().catch(() => []);
        const ownCrowns = mine.filter((c) => c.mode === 'champion');
        if (ownCrowns.length > 0) {
          const top = ownCrowns[0];
          setFeatured({
            song: top.song,
            champion: top.champion,
            titleDefenses: top.titleDefenses,
            risk: top.risk,
          });
          setPersonalised(true);
          return;
        }
      }
      const f = await api.getFeaturedRisk();
      setFeatured(f);
      setPersonalised(false);
    } catch {
      // Non-fatal
    }
  }, [user]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Bug #52 — the defending-champion details used to only fetch on mount,
  // so after a battle closed (champion crowned / dethroned), this section
  // showed stale champion + streak + title-defenses counts until a hard
  // refresh. Subscribe to the lobby SSE so any battle lifecycle event
  // (created / cancelled / closed) triggers a refetch and the panel
  // reflects the new defending champion.
  useLobby(() => {
    void refetch();
  });

  if (!featured) return null;
  const { song, champion, titleDefenses } = featured;
  const streak = song.currentChampionStreak;
  // Streak bar caps visually at 10 wins so a long streak doesn't blow out
  // the meter; the real count is still shown in the label.
  const barPercent = Math.min((streak / 10) * 100, 100);

  return (
    <section className="bg-background py-12 md:py-20">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/30 to-yellow-900/20 rounded-2xl blur-2xl" />
            <div className="relative aspect-square rounded-2xl border border-yellow-500/30 overflow-hidden">
              <Image
                src={HERO_CHAMPION_PORTRAIT.src}
                alt={HERO_CHAMPION_PORTRAIT.alt}
                fill
                sizes="(max-width: 1024px) 100vw, 600px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur border border-yellow-500/40">
                <Crown className="w-4 h-4 text-yellow-500" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-yellow-500">
                  The Crown
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <p className="text-yellow-500 font-bold text-sm mb-2 uppercase tracking-widest">
                {personalised ? 'You are the Defending Champion' : 'Defending Champion'}
              </p>
              <div className="flex items-center gap-4 mb-2">
                {champion?.avatarUrl && (
                  <Image
                    src={champion.avatarUrl}
                    alt={champion.username}
                    width={56}
                    height={56}
                    className="w-14 h-14 rounded-full object-cover border-2 border-yellow-500/60"
                  />
                )}
                <h2 className="text-5xl font-black text-white">
                  {champion ? `@${champion.username}` : 'The Reigning Voice'}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-yellow-500" />
                <p className="text-yellow-500 font-bold uppercase tracking-widest">
                  Official Voice of{' '}
                  <span className="text-yellow-300">
                    {song.title}
                  </span>
                </p>
              </div>
              {/* Bug #81 — the section used to label the user as
                  "Official Voice of the Song" without ever saying
                  WHICH song. When the marquee champion (longest
                  streak overall) is different from the freshest
                  crown change shown in the Dethroned panel, viewers
                  couldn't tell that the two are on different songs
                  and assumed the data was wrong. Surface the song
                  title (and artist when present) so the section is
                  unambiguous about which crown it's celebrating. */}
              {song.artist && (
                <p className="text-xs text-haze/60 mt-1">
                  by {song.artist}
                </p>
              )}
            </div>

            <p className="text-gray-300 text-lg">
              The champion owns the song... until someone takes it.
            </p>

            <div className="gold-panel grid grid-cols-2 gap-px bg-yellow-500/20 overflow-hidden">
              <div className="bg-black/70 p-5 text-center">
                <div className="text-3xl font-black text-yellow-400 tabular-nums">
                  {streak}
                </div>
                <div className="text-[10px] md:text-xs text-gray-400 mt-1 uppercase tracking-widest">
                  Win Streak
                </div>
              </div>
              <div className="bg-black/70 p-5 text-center">
                <div className="text-3xl font-black text-yellow-400 tabular-nums">
                  {titleDefenses}
                </div>
                <div className="text-[10px] md:text-xs text-gray-400 mt-1 uppercase tracking-widest">
                  Title Defenses
                </div>
              </div>
            </div>

            <div className="bg-card/50 backdrop-blur border border-yellow-500/30 rounded-xl p-6">
              <p className="text-gray-400 text-sm mb-2 uppercase tracking-widest">
                Streak Meter
              </p>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-500 transition-all"
                  style={{ width: `${barPercent}%` }}
                />
              </div>
            </div>

            {champion && (
              <Link
                href={`/u/${champion.username}`}
                className="w-full inline-flex items-center justify-center bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-4 text-lg rounded-lg uppercase tracking-widest transition"
              >
                View Champion
              </Link>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 5. How It Works ─────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    {
      number: '1',
      title: 'THE SONG DROPS',
      description: 'One Centerstage Song becomes the battleground.',
      Icon: Music,
    },
    {
      number: '2',
      title: 'TWO VOICES BATTLE',
      description: 'Singers perform the same song head-to-head.',
      Icon: Headphones,
    },
    {
      number: '3',
      title: 'THE WORLD VOTES',
      description: 'The audience decides who owns the song.',
      Icon: Users,
    },
    {
      number: '4',
      title: 'RED PHONE OPENS',
      description: 'Anyone can challenge the champion.',
      Icon: Zap,
    },
  ];

  return (
    <section className="bg-background py-12 md:py-20">
      <div className="max-w-7xl mx-auto px-4">
        <SectionHeader
          eyebrow="The Loop"
          title="How It Works"
          subtitle="Four steps. One crown. Repeat forever."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-12">
          {steps.map((step, index) => {
            const Icon = step.Icon;
            return (
              <div
                key={step.number}
                className="flex flex-col items-center text-center group relative"
              >
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-12 left-[60%] w-[80%] h-0.5 bg-gradient-to-r from-red-600/60 to-transparent z-0" />
                )}
                <div className="relative mb-6 z-10">
                  <div className="w-24 h-24 bg-red-600/20 border-2 border-red-600 rounded-full flex items-center justify-center group-hover:shadow-lg group-hover:shadow-red-600/50 transition-all">
                    <Icon className="w-12 h-12 text-red-600" />
                  </div>
                </div>
                <div className="text-4xl font-black text-red-600 mb-2 tabular">
                  {step.number}
                </div>
                <h3 className="text-white font-bold text-lg mb-2 uppercase tracking-widest">
                  {step.title}
                </h3>
                <p className="text-gray-400 text-sm max-w-[200px]">
                  {step.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── 6. The Stage carousel ───────────────────────────────────────────

function StageCarousel() {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [voiceType, setVoiceType] = useState<VoiceType | ''>('');
  const [genre, setGenre] = useState('');
  const [sort, setSort] = useState<VideoSort>('newest');
  const [videos, setVideos] = useState<VideoDto[]>([]);
  const [loading, setLoading] = useState(true);

  // Strip a leading "@" so users searching "@foo" get matched against
  // usernames (stored without the prefix) instead of returning empty.
  useEffect(() => {
    const t = setTimeout(
      () => setDebouncedSearch(search.trim().replace(/^@+/, '')),
      300,
    );
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await api.listVideos({
          search: debouncedSearch || undefined,
          voiceType: voiceType || undefined,
          genre: genre || undefined,
          sort,
          limit: 12,
          offset: 0,
        });
        if (cancelled) return;
        setVideos(res.items);
      } catch {
        // Non-fatal
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, voiceType, genre, sort]);

  const scroll = (dir: 'left' | 'right') => {
    const el = document.getElementById('stage-scroll');
    if (!el) return;
    el.scrollBy({ left: dir === 'left' ? -340 : 340, behavior: 'smooth' });
  };

  return (
    <section className="bg-background py-12 md:py-20">
      <div className="max-w-7xl mx-auto px-4">
        <SectionHeader
          eyebrow="Spotlight"
          title="The Stage"
          subtitle="New performances. New challengers. New legends."
          align="left"
        />

        <div className="bg-card/50 backdrop-blur border border-border rounded-xl p-6 mb-8">
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, song, or @username"
              className="flex-1 bg-muted/50 border border-border rounded-lg px-4 py-3 text-foreground placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-600"
            />
            <div className="flex gap-2 flex-wrap">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as VideoSort)}
                className="bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-600"
              >
                {Object.entries(SORT_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={voiceType}
                onChange={(e) => setVoiceType(e.target.value as VoiceType | '')}
                className="bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-600"
              >
                <option value="">All Voice Types</option>
                {Object.entries(VOICE_TYPE_LABELS).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                value={genre}
                onChange={(e) => setGenre(e.target.value)}
                className="bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-600"
              >
                <option value="">All Genres</option>
                {GENRE_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="relative group">
          <div
            id="stage-scroll"
            className="overflow-x-auto scrollbar-hide scroll-smooth"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            <div className="flex gap-6 pb-4">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex-shrink-0 w-80 aspect-[16/12] rounded-xl skeleton"
                  />
                ))
              ) : videos.length === 0 ? (
                <div className="w-full text-center py-16">
                  <p className="text-gray-400">
                    No performances match your filters.
                  </p>
                </div>
              ) : (
                videos.map((v) => <StageCard key={v.id} video={v} />)
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => scroll('left')}
            aria-label="Scroll left"
            className="absolute -left-4 lg:-left-16 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition text-white hover:text-red-600"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>
          <button
            type="button"
            onClick={() => scroll('right')}
            aria-label="Scroll right"
            className="absolute -right-4 lg:-right-16 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition text-white hover:text-red-600"
          >
            <ChevronRight className="w-8 h-8" />
          </button>
        </div>
      </div>
    </section>
  );
}

function StageCard({ video }: { video: VideoDto }) {
  const isNew =
    Date.now() - new Date(video.createdAt).getTime() < 7 * 86_400_000;
  return (
    <Link
      href={`/v/${video.id}`}
      className="flex-shrink-0 w-80 group/card hover:scale-105 transition-transform"
    >
      <div className="relative bg-card/50 backdrop-blur border border-border rounded-xl overflow-hidden hover:border-red-600 transition">
        <div className="aspect-video bg-gradient-to-br from-red-600/30 to-red-900/30 relative flex items-center justify-center overflow-hidden">
          {video.thumbnailUrl && (
            <Image
              src={video.thumbnailUrl}
              alt={video.title}
              fill
              sizes="(max-width: 768px) 100vw, 320px"
              className="object-cover"
            />
          )}
          <div className="absolute inset-0 bg-black/20 group-hover/card:bg-black/40 transition" />
          <Play className="w-16 h-16 text-red-600 fill-red-600 opacity-0 group-hover/card:opacity-100 transition relative z-10" />
          {isNew && (
            <div className="absolute top-3 left-3 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded uppercase tracking-widest z-10">
              New
            </div>
          )}
          {video.durationSeconds != null && video.durationSeconds > 0 && (
            <div className="absolute bottom-3 right-3 bg-black/70 text-white text-xs font-bold px-2 py-1 rounded tabular z-10">
              {formatRuntime(video.durationSeconds)}
            </div>
          )}
        </div>
        <div className="p-4">
          <h3 className="font-bold text-white text-lg mb-1 line-clamp-1 uppercase tracking-wide">
            {video.title}
          </h3>
          <p className="text-sm text-gray-400 mb-4 truncate">
            {video.songTitle ??
              (video.uploader ? `@${video.uploader.username}` : '')}
          </p>
          <div className="flex items-center justify-between text-xs text-gray-400">
            <div className="flex items-center gap-1 tabular">
              <Eye className="w-4 h-4" aria-hidden="true" />
              <span aria-label={`${formatStat(video.viewCount)} views`}>
                {formatStat(video.viewCount)}
              </span>
            </div>
            {video.uploader && (
              <p className="text-xs text-gray-400 truncate">
                @{video.uploader.username}
              </p>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

// ─── 7. Recent Winners carousel ──────────────────────────────────────

interface WinnerCard {
  battleId: string;
  songTitle: string;
  songArtist: string;
  winnerUsername: string | null;
  winnerAvatarUrl: string | null;
  percent: number;
}

function WinnersCarousel() {
  const [winners, setWinners] = useState<WinnerCard[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    try {
      const completed = await api.listBattles({
        status: 'completed',
        limit: 6,
      });
      const detailed = await Promise.all(
        completed.items.slice(0, 6).map(async (b) => {
          try {
            const full = await api.getBattle(b.id);
            if (!full.winnerPerformanceId) return null;
            const song = await api.getSong(full.songId).catch(() => null);
            // Video fetch is best-effort — if the winning performance has
            // been soft-deleted the videos endpoint 404s, but we still
            // want to render the card using the winner-user snapshot the
            // battle response includes. Pull avatar from the video when
            // it's still around for the nicer visual.
            const perf = full.winnerPerformanceId
              ? await api
                  .getVideo(full.winnerPerformanceId)
                  .catch(() => null)
              : null;
            const total = (full.voteCountA ?? 0) + (full.voteCountB ?? 0);
            const winnerCount =
              full.winnerPerformanceId === full.performanceAId
                ? full.voteCountA ?? 0
                : full.voteCountB ?? 0;
            return {
              battleId: full.id,
              songTitle: song?.title ?? 'Centerstage Song',
              songArtist: song?.artist ?? '',
              winnerUsername:
                full.winnerUser?.username ?? perf?.uploader?.username ?? null,
              winnerAvatarUrl:
                full.winnerUser?.avatarUrl ?? perf?.uploader?.avatarUrl ?? null,
              percent: total > 0 ? Math.round((winnerCount / total) * 100) : 0,
            } satisfies WinnerCard;
          } catch {
            return null;
          }
        }),
      );
      setWinners(detailed.filter((w): w is WinnerCard => w !== null));
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // When a battle closes, it joins this list — keep it current via the
  // lobby stream so visitors don't have to refresh.
  useLobby((e) => {
    if (e.change === 'closed') void refetch();
  });

  if (!loading && winners.length === 0) return null;

  return (
    <section className="bg-background py-12 md:py-20">
      <div className="max-w-7xl mx-auto px-4">
        <SectionHeader
          eyebrow="Crowned"
          title="Recent Winners"
          subtitle="The latest voices to take a song."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-64 rounded-2xl skeleton" />
              ))
            : winners.slice(0, 3).map((w) => (
                <Link
                  key={w.battleId}
                  href={`/battle/${w.battleId}`}
                  className="relative group/card hover:scale-105 transition-transform"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/20 to-yellow-900/20 rounded-2xl blur-xl group-hover/card:blur-2xl transition" />
                  <div className="relative bg-card/50 backdrop-blur border border-yellow-500/30 rounded-2xl overflow-hidden p-6">
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex-1 min-w-0">
                        {/* New item #39 — when the winner's user/video has
                            since been deleted, fall back to "Deleted User"
                            instead of the previous "Anonymous" or "Crowned"
                            label, which made it look like a system error.
                            The winner identity is preserved even when the
                            media goes away. */}
                        <h3 className="text-2xl font-black text-white mb-1 truncate">
                          {w.winnerUsername
                            ? `@${w.winnerUsername}`
                            : 'Deleted User'}
                        </h3>
                        {/* Bug #13 — the song title sat at text-gray-400 over a
                            translucent card, which fell below readable contrast.
                            Bumped to gray-200 so the song line is legible. */}
                        <p className="text-sm text-gray-200 truncate">
                          {w.songTitle}
                          {w.songArtist && (
                            <span className="text-gray-400"> · {w.songArtist}</span>
                          )}
                        </p>
                      </div>
                      <Crown className="w-6 h-6 text-yellow-500 flex-shrink-0 ml-3" />
                    </div>

                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm text-gray-400 uppercase tracking-widest">
                          Win Rate
                        </p>
                        <p className="text-2xl font-black text-yellow-500 tabular">
                          {w.percent}%
                        </p>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-yellow-500 transition-all"
                          style={{ width: `${w.percent}%` }}
                        />
                      </div>
                    </div>

                    <div className="w-full inline-flex items-center justify-center bg-yellow-500 group-hover/card:bg-yellow-600 text-black font-bold py-2 rounded-lg text-sm uppercase tracking-widest transition">
                      Official Voice
                    </div>
                  </div>
                </Link>
              ))}
        </div>
      </div>
    </section>
  );
}

// ─── 8. CTA Footer ───────────────────────────────────────────────────

function CTAFooter({ user }: { user: ReturnType<typeof useAuth>['user'] }) {
  return (
    <section className="relative bg-background py-32 overflow-hidden">
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-red-600 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-red-900 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div className="space-y-6">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-white leading-tight">
            WIN THE SONG.
          </h2>
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-black text-red-600 leading-tight">
            OR GET REPLACED.
          </h2>
          <p className="text-lg text-gray-300 max-w-md">
            Step onto the stage. The next voice could be yours.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href={user ? '/upload' : '/signup'}
              className="inline-flex items-center justify-center bg-red-600 hover:bg-red-700 text-white text-base py-4 px-8 rounded-lg font-bold uppercase tracking-widest transition"
            >
              <Mic className="w-5 h-5 mr-2" />
              Take the Stage
            </Link>
            <Link
              href="#live-battle"
              className="inline-flex items-center justify-center border border-white text-white hover:bg-white/10 text-base py-4 px-8 rounded-lg font-bold uppercase tracking-widest transition"
            >
              <Play className="w-5 h-5 mr-2" />
              Watch Live Battle
            </Link>
          </div>
        </div>

        <div className="relative h-96 flex items-center justify-center">
          <div className="absolute inset-0 bg-gradient-to-br from-red-600/20 to-red-900/20 rounded-2xl blur-2xl" />
          <div className="relative text-center">
            <Mic className="w-32 h-32 text-red-600/40 mx-auto mb-4" />
            <p className="text-gray-400">The next voice.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 9. Crown At Risk panel ─────────────────────────────────────────

function CrownAtRiskPanel() {
  const { user } = useAuth();
  const [marquee, setMarquee] = useState<FeaturedSongRiskDto | null>(null);
  const [personal, setPersonal] = useState<AtRiskCrownDto | null>(null);

  // Bug #64 — the panel used to fetch once on mount, so after the user
  // won a new crown on a different song the section kept showing the
  // previously-won song's risk data until a hard refresh. Mirrors the
  // same fix applied to ChampionSection / DethronedPanel: fold the
  // fetch into a callback, drive both initial-mount and SSE-triggered
  // refetches through it, and explicitly clear stale state when the
  // backend returns nothing (otherwise `personal` would stay sticky
  // and the panel would render an outdated song forever).
  const refetch = useCallback(async () => {
    // 3-state lookup: authed → try personal → fall back to marquee.
    try {
      if (user) {
        const mine = await api.getMyAtRiskCrowns();
        if (mine.length > 0) {
          setPersonal(mine[0]);
          setMarquee(null);
          return;
        }
        // No personal crown anymore (e.g. lost it) — clear so we don't
        // keep rendering the stale row.
        setPersonal(null);
      }
      const f = await api.getFeaturedRisk();
      setMarquee(f);
    } catch {
      try {
        const f = await api.getFeaturedRisk();
        setMarquee(f);
      } catch {
        /* both failed → panel renders nothing */
      }
    }
  }, [user]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Real-time refresh — any battle lifecycle event (newly crowned,
  // dethroned, new battle queued against your song) shifts the user's
  // at-risk picture. Re-evaluate from the lobby SSE so the section
  // tracks the latest champion status without a hard refresh.
  useLobby(() => {
    void refetch();
  });

  if (personal) {
    return (
      <CrownAtRiskPanelView
        eyebrow="Your Crown at Risk"
        subtitle={
          personal.mode === 'champion' ? (
            <>
              You currently champion{' '}
              <span className="text-white">{personal.song.title}</span> · defend it
            </>
          ) : (
            <>
              The crown on{' '}
              <span className="text-white">{personal.song.title}</span> (your vote) is under attack
            </>
          )
        }
        song={personal.song}
        risk={personal.risk}
        personalised
      />
    );
  }

  if (!marquee) return null;
  return (
    <CrownAtRiskPanelView
      eyebrow="Crown at Risk"
      subtitle={
        <>
          The crown on{' '}
          <span className="text-white">{marquee.song.title}</span> is under attack
        </>
      }
      song={marquee.song}
      risk={marquee.risk}
      personalised={false}
    />
  );
}

function CrownAtRiskPanelView({
  eyebrow,
  subtitle,
  song: _song,
  risk,
  personalised,
}: {
  eyebrow: string;
  subtitle: React.ReactNode;
  song: SongDto;
  risk: SongRisk;
  personalised: boolean;
}) {
  const survival = risk.survivalChance;
  // SVG progress ring math (r=42 inside a 100x100 viewport)
  const r = 42;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - survival / 100);
  const tone = riskTone(risk.riskLevel);

  return (
    <section id="crown-at-risk" className="bg-background py-12 md:py-20">
      <div className="max-w-7xl mx-auto px-4">
        {/* Bug #79 — the `.personal-stake` panel pins a "FOR YOU" pill
            at `top: 0.75rem; right: 0.75rem` via a `::before`. On
            mobile the panel's `p-8` (2rem) padding doesn't leave the
            heading row enough room — the uppercase tracking-widest
            "Your Crown at Risk" text crowds the chip and the two
            visually collide. Bumping the top padding only on the
            personalised variant (and only below `md:`) drops the
            heading underneath the chip with breathing room. */}
        <div
          className={`gold-panel ${
            personalised
              ? 'personal-stake pt-14 md:pt-10'
              : ''
          } relative overflow-hidden p-8 md:p-10`}
        >
          <Image
            src={HERO_CROWN_AT_RISK.src}
            alt=""
            fill
            sizes="(max-width: 1280px) 100vw, 1280px"
            className="object-cover opacity-50"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/50 to-black/85" />
          <div className="relative grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 items-center">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className={`w-5 h-5 ${tone.text}`} />
                <h2
                  className={`text-2xl md:text-3xl font-black ${tone.text} tracking-widest uppercase`}
                >
                  {eyebrow}
                </h2>
                <AlertTriangle className={`w-5 h-5 ${tone.text}`} />
              </div>
              <p className="text-gray-400 text-sm uppercase tracking-widest mb-6">
                {subtitle}
              </p>
              {/* Bug #84 — was `flex items-center gap-6` with no
                  wrap, so on iPhone the three stat blocks (with
                  text-4xl values) couldn't fit on one line and the
                  rightmost got clipped past the panel edge. Switched
                  to `flex-wrap` with column gap separate from row
                  gap, shrunk the value font below `sm:`, and hid the
                  `·` separators on mobile (they don't make sense
                  once the items wrap to a new line). */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-4 mb-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">
                    Crown Risk
                  </p>
                  <p className={`text-3xl sm:text-4xl font-black ${tone.text}`}>
                    {risk.riskLevel}
                  </p>
                </div>
                <div className="hidden sm:block text-gray-500 text-3xl" aria-hidden="true">·</div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">
                    Pending Challengers
                  </p>
                  <p className="text-3xl sm:text-4xl font-black text-white tabular-nums">
                    {risk.pendingChallengers}
                  </p>
                </div>
                {risk.lastBattleMarginPercent !== null && (
                  <>
                    <div className="hidden sm:block text-gray-500 text-3xl" aria-hidden="true">·</div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">
                        Last Margin
                      </p>
                      <p className="text-3xl sm:text-4xl font-black text-white tabular-nums">
                        {risk.lastBattleMarginPercent}%
                      </p>
                    </div>
                  </>
                )}
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full ${tone.bar} transition-all`}
                  style={{ width: `${100 - survival}%` }}
                />
              </div>
              <p className="text-xs text-gray-400 uppercase tracking-widest">
                Challengers are {survival < 50 ? 'closing in' : 'circling'} ·
                Champion survival chance{' '}
                <span className={tone.text}>{survival}%</span>
              </p>
            </div>
            <div className="relative w-44 h-44">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="8"
                />
                <circle
                  cx="50"
                  cy="50"
                  r={r}
                  fill="none"
                  stroke={tone.ring}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-4xl font-black ${tone.text} tabular-nums`}>
                  {survival}%
                </span>
                <span className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">
                  Survival
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function riskTone(level: RiskLevel) {
  switch (level) {
    case 'CRITICAL':
      return {
        text: 'text-red-500',
        bar: 'bg-red-500',
        ring: 'rgb(239,68,68)',
      };
    case 'HIGH':
      return {
        text: 'text-red-400',
        bar: 'bg-red-400',
        ring: 'rgb(248,113,113)',
      };
    case 'MODERATE':
      return {
        text: 'text-yellow-400',
        bar: 'bg-yellow-400',
        ring: 'rgb(250,204,21)',
      };
    case 'LOW':
    default:
      return {
        text: 'text-green-400',
        bar: 'bg-green-400',
        ring: 'rgb(74,222,128)',
      };
  }
}

// ─── 10. Dethroned moment panel ─────────────────────────────────────

function DethronedPanel() {
  const [latest, setLatest] = useState<DethronementDto | null>(null);

  const { user } = useAuth();
  const [personal, setPersonal] = useState<PersonalDethronementDto | null>(null);

  const refetch = useCallback(async () => {
    try {
      if (user) {
        const mine = await api.getMyRecentDethronements();
        if (mine.length > 0) {
          setPersonal(mine[0]);
          setLatest(null);
          return;
        }
        // Bug #52 — the personal slot used to be sticky: once set, an
        // empty refetch wouldn't clear it, so "Your reign just ended."
        // stayed on screen after the user reclaimed the crown. Clear
        // it explicitly when the backend no longer reports any
        // outstanding personal dethronement.
        setPersonal(null);
      }
      const list = await api.getRecentDethronements(1);
      setLatest(list.length > 0 ? list[0] : null);
    } catch {
      try {
        const list = await api.getRecentDethronements(1);
        setLatest(list.length > 0 ? list[0] : null);
      } catch {
        /* both failed → panel renders nothing */
      }
    }
  }, [user]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Same rationale as ChampionSection — re-evaluate when a battle
  // closes so "Your reign just ended." disappears as soon as the user
  // reclaims the crown.
  useLobby(() => {
    void refetch();
  });

  if (personal) {
    const isFormerChamp = personal.yourRole === 'former-champion';
    const eyebrow = isFormerChamp
      ? 'You Just Lost the Crown'
      : 'Your Pick Got Dethroned';
    const subtitle = isFormerChamp
      ? 'Your reign just ended.'
      : 'The voice you backed lost the song.';
    return (
      <DethronedPanelView
        latest={personal}
        eyebrow={eyebrow}
        subtitle={subtitle}
        personalised
      />
    );
  }
  if (!latest) return null;
  return (
    <DethronedPanelView
      latest={latest}
      eyebrow="Dethroned!"
      subtitle="A new Official Voice has been crowned."
      personalised={false}
    />
  );
}

function DethronedPanelView({
  latest,
  eyebrow,
  subtitle,
  personalised,
}: {
  latest: DethronementDto;
  eyebrow: string;
  subtitle: string;
  personalised: boolean;
}) {
  const when = formatRelativeTime(latest.dethronedAt);
  const margin = Math.round(latest.winnerVotePercent);
  const shareUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/battle/${latest.battleId}`
      : `/battle/${latest.battleId}`;
  const shareText = latest.newChampion
    ? `@${latest.newChampion.username} just took ${latest.songTitle ?? 'the song'} on VOCALMATCH — ${margin}% of the vote.`
    : `New Official Voice on VOCALMATCH${latest.songTitle ? ` for ${latest.songTitle}` : ''}.`;

  const handleShare = async () => {
    if (typeof navigator === 'undefined') return;
    const data = { title: 'VOCALMATCH — Dethroned', text: shareText, url: shareUrl };
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share(data);
        return;
      } catch {
        // user cancelled or share unsupported — fall through to clipboard
      }
    }
    try {
      await navigator.clipboard?.writeText(`${shareText} ${shareUrl}`);
    } catch {
      /* swallow — nothing we can do */
    }
  };

  return (
    <section id="dethroned" className="bg-background py-12 md:py-20">
      <div className="max-w-7xl mx-auto px-4">
        <div
          className={`gold-panel gold-dust ${personalised ? 'personal-stake' : ''} relative bg-card/40 backdrop-blur overflow-hidden`}
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-transparent to-red-600/10 pointer-events-none"
          />
          {/* Bug #79 — when `.personal-stake` is applied, its `::before`
              "FOR YOU" pill is anchored at `top:0.75rem; right:0.75rem`.
              The default `p-6` on mobile leaves the eyebrow + Won%
              chip row crowding it. Bumping the top padding when
              personalised gives the chip row breathing room beneath
              the FOR YOU pill. */}
          <div
            className={`relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 items-center ${
              personalised
                ? 'p-6 pt-12 sm:p-8 sm:pt-12 md:p-10'
                : 'p-6 sm:p-8 md:p-10'
            }`}
          >
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-400/40 bg-black/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-yellow-400">
                  <Crown className="h-3 w-3" />
                  {eyebrow}
                </span>
                {when && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-gray-300">
                    {when}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-400/40 bg-black/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-yellow-400 tabular-nums">
                  Won {margin}%
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white mb-2 text-balance">
                {subtitle}
              </h2>
              {latest.songTitle && (
                <p className="text-gray-300 mb-6">
                  <span className="text-yellow-400 font-bold">
                    {latest.songTitle}
                  </span>
                  {latest.songArtist && (
                    <span className="text-gray-400"> · {latest.songArtist}</span>
                  )}
                </p>
              )}
              {/* Former → new transition. Stacks vertically on narrow,
                  horizontal from sm up. The fallen avatar is greyscaled
                  + struck through to read "previous reign over". */}
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                {latest.formerChampion && (
                  <div className="flex items-center gap-2">
                    {latest.formerChampion.avatarUrl && (
                      <Image
                        src={latest.formerChampion.avatarUrl}
                        alt={latest.formerChampion.username}
                        width={40}
                        height={40}
                        className="h-10 w-10 rounded-full border-2 border-gray-700 object-cover opacity-50 grayscale"
                      />
                    )}
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-gray-400">
                        Former
                      </p>
                      <p className="text-sm text-gray-400 line-through">
                        @{latest.formerChampion.username}
                      </p>
                    </div>
                  </div>
                )}
                <div
                  aria-hidden="true"
                  className="hidden text-xl text-gray-500 sm:block"
                >
                  →
                </div>
                {latest.newChampion && (
                  <div className="flex items-center gap-2">
                    {latest.newChampion.avatarUrl && (
                      <Image
                        src={latest.newChampion.avatarUrl}
                        alt={latest.newChampion.username}
                        width={48}
                        height={48}
                        className="h-12 w-12 rounded-full border-2 border-yellow-500 object-cover"
                      />
                    )}
                    <div>
                      <p className="text-[10px] uppercase tracking-widest text-yellow-400">
                        New Crown
                      </p>
                      <p className="text-base font-bold text-white">
                        @{latest.newChampion.username}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href={`/battle/${latest.battleId}`}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-yellow-500 px-6 py-3 text-sm font-bold uppercase tracking-widest text-black transition hover:bg-yellow-600"
                >
                  <Play className="h-4 w-4" />
                  {personalised ? 'Watch What Happened' : 'Watch the Moment'}
                </Link>
                <button
                  type="button"
                  onClick={handleShare}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-yellow-400/40 bg-black/40 px-6 py-3 text-sm font-bold uppercase tracking-widest text-yellow-400 transition hover:border-yellow-400/70 hover:bg-black/60"
                >
                  <Share2 className="h-4 w-4" />
                  Share this Moment
                </button>
              </div>
            </div>
            <div className="relative mx-auto h-40 w-40 overflow-hidden rounded-2xl border border-yellow-500/40 md:h-56 md:w-56">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 -m-4 rounded-3xl bg-yellow-500/30 blur-2xl"
              />
              <Image
                src={HERO_DETHRONED.src}
                alt={HERO_DETHRONED.alt}
                fill
                sizes="(max-width: 768px) 160px, 224px"
                className="relative z-10 object-cover"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 10b. Red Phone winner panel ────────────────────────────────────
//
// Bug #83 — distinct from the Dethroned panel above: this surfaces the
// most-recent winner of a Red-Phone-promoted battle regardless of
// whether the crown changed hands. A successful defense by the
// reigning champion against a challenger is shown here (the Dethroned
// panel hides it because the crown didn't move). Falls silent when
// there are no Red Phone battles yet.

function RedPhoneWinnerPanel() {
  const [winner, setWinner] = useState<RedPhoneWinnerDto | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const items = await api.getRecentRedPhoneWinners(1);
      setWinner(items[0] ?? null);
    } catch {
      setWinner(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Auto-refresh on any battle lifecycle event so the panel keeps
  // current as new Red Phone battles close.
  useLobby((e) => {
    if (e.change === 'closed') void refetch();
  });

  if (!loaded || !winner) return null;

  const when = winner.crownedAt ? formatRelativeTime(winner.crownedAt) : null;
  const outcomeLabel =
    winner.outcome === 'taken'
      ? 'Took the crown'
      : winner.outcome === 'retained'
        ? 'Defended the crown'
        : 'First crown';
  const headline =
    winner.outcome === 'taken'
      ? `${winner.winner?.username ? '@' + winner.winner.username : 'A new voice'} just won a Red Phone battle.`
      : winner.outcome === 'retained'
        ? `${winner.winner?.username ? '@' + winner.winner.username : 'The defender'} held off a Red Phone challenge.`
        : `${winner.winner?.username ? '@' + winner.winner.username : 'A new voice'} just claimed a Red Phone song.`;

  return (
    <section id="red-phone-winner" className="bg-background py-12 md:py-20">
      <div className="max-w-7xl mx-auto px-4">
        <div className="relative overflow-hidden rounded-2xl border border-red-500/40 bg-gradient-to-br from-red-950/40 via-stage-900/60 to-stage-950/60 backdrop-blur">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-red-600/25 blur-3xl"
          />
          <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6 md:gap-8 items-center p-6 sm:p-8 md:p-10">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/50 bg-black/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-red-300">
                  📞 Red Phone
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/40 bg-black/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-red-200/80">
                  {outcomeLabel}
                </span>
                {when && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-gray-300">
                    {when}
                  </span>
                )}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/40 bg-black/60 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.3em] text-red-200 tabular-nums">
                  Won {winner.winnerVotePercent}%
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-white mb-2 text-balance">
                {headline}
              </h2>
              {winner.songTitle && (
                <p className="text-gray-300 mb-6">
                  on{' '}
                  <span className="text-red-300 font-bold">
                    {winner.songTitle}
                  </span>
                  {winner.songArtist && (
                    <span className="text-gray-400"> · {winner.songArtist}</span>
                  )}
                </p>
              )}
              <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                {winner.winner && (
                  <Link
                    href={`/u/${winner.winner.username}`}
                    className="inline-flex items-center gap-2 hover:opacity-90"
                  >
                    {winner.winner.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={winner.winner.avatarUrl}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover border-2 border-red-400/50"
                      />
                    ) : (
                      <div className="h-10 w-10 rounded-full bg-stage-800 border-2 border-red-400/50 flex items-center justify-center font-bold text-haze">
                        {winner.winner.username[0]?.toUpperCase() ?? '?'}
                      </div>
                    )}
                    <div className="leading-tight">
                      <p className="text-xs uppercase tracking-widest text-red-200/70 font-bold">
                        Winner
                      </p>
                      <p className="text-base font-bold text-white">
                        @{winner.winner.username}
                      </p>
                    </div>
                  </Link>
                )}
                {winner.formerChampion && (
                  <>
                    <span aria-hidden="true" className="hidden sm:inline text-haze">
                      →
                    </span>
                    <div className="inline-flex items-center gap-2 opacity-70">
                      {winner.formerChampion.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={winner.formerChampion.avatarUrl}
                          alt=""
                          className="h-9 w-9 rounded-full object-cover border border-stage-700 grayscale"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-stage-800 border border-stage-700 flex items-center justify-center font-bold text-haze">
                          {winner.formerChampion.username[0]?.toUpperCase() ?? '?'}
                        </div>
                      )}
                      <div className="leading-tight">
                        <p className="text-xs uppercase tracking-widest text-haze/60 font-bold">
                          Former
                        </p>
                        <p className="text-sm text-haze line-through">
                          @{winner.formerChampion.username}
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/battle/${winner.battleId}`}
                  className="inline-flex items-center gap-2 px-5 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-md transition-colors"
                >
                  ▶ Watch the battle
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 11. Share cards row ─────────────────────────────────────────────

function ShareCardsRow() {
  const cards: Array<{
    title: string;
    sub: string;
    icon: typeof Vote;
    tone: 'red' | 'gold';
    href: string;
    intent: string;
  }> = [
    {
      title: 'Vote Now',
      sub: 'Who deserves the song?',
      icon: Vote,
      tone: 'red',
      href: '#live-battle',
      intent: 'Tonight’s live battle is open on VOCALMATCH — vote before the clock runs out.',
    },
    {
      title: 'Challenge the Voice',
      sub: 'Can you take the crown?',
      icon: Mic,
      tone: 'red',
      href: '/upload',
      intent: 'Pick up the red phone on VOCALMATCH. Same song, your voice — the crown is up for grabs.',
    },
    {
      title: 'New Crown Moments',
      sub: 'See the latest dethronement.',
      icon: Crown,
      tone: 'gold',
      href: '#dethroned',
      intent: 'A new Official Voice was just crowned on VOCALMATCH.',
    },
    {
      title: 'The Crown Is Always at Risk',
      sub: 'Defend it. Or take it.',
      icon: Shield,
      tone: 'gold',
      href: '#crown-at-risk',
      intent: 'The crown is never safe on VOCALMATCH. One song. Two voices. One crown.',
    },
  ];

  return (
    <section className="bg-background py-12 md:py-20">
      <div className="max-w-7xl mx-auto px-4">
        <div className="relative w-full aspect-[21/9] md:aspect-[21/7] rounded-2xl overflow-hidden mb-10">
          <Image
            src={HERO_SHARE_POSTER.src}
            alt={HERO_SHARE_POSTER.alt}
            fill
            sizes="(max-width: 1280px) 100vw, 1280px"
            className="object-cover object-[center_30%]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 md:p-10 text-center">
            <p className="text-yellow-400 text-xs font-bold uppercase tracking-[0.3em] mb-2">
              Share the moment
            </p>
            <h2 className="text-2xl sm:text-3xl md:text-5xl font-black text-white text-balance">
              Take VOCALMATCH everywhere.
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((c) => (
            <ShareCard
              key={c.title}
              title={c.title}
              sub={c.sub}
              Icon={c.icon}
              tone={c.tone}
              href={c.href}
              intent={c.intent}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ShareCard({
  title,
  sub,
  Icon,
  tone,
  href,
  intent,
}: {
  title: string;
  sub: string;
  Icon: typeof Crown;
  tone: 'red' | 'gold';
  href: string;
  /** Pre-written, per-card share copy that gets posted into the
   *  selected channel. Lets each card carry its own voice. */
  intent: string;
}) {
  const accent = tone === 'red' ? 'text-red-500' : 'text-yellow-400';
  const ring = tone === 'red' ? 'border-red-500/40' : 'border-yellow-400/40';
  const wash =
    tone === 'red'
      ? 'from-red-600/10 via-transparent to-red-600/0'
      : 'from-yellow-500/10 via-transparent to-yellow-500/0';

  // Stable origin reference. Falls back to the production URL so SSR /
  // first-paint shares are still meaningful before hydration runs.
  const origin =
    typeof window !== 'undefined' ? window.location.origin : 'https://vocalmatch.app';
  const shareUrl = `${origin}${href.startsWith('/') ? href : ''}`;
  const shareText = intent;

  // Web Share API → native sheet on iOS/Android/macOS. On unsupported
  // platforms or user-cancellation, we fall through to the explicit
  // per-channel buttons below.
  const nativeShare = async () => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false;
    try {
      await navigator.share({ title, text: shareText, url: shareUrl });
      return true;
    } catch {
      return false;
    }
  };

  const copyToClipboard = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);
    } catch {
      /* swallow */
    }
  };

  // Real, working share intents. Twitter / Facebook have stable URL
  // schemes; TikTok and Instagram don't expose web share endpoints, so
  // for those we copy the post to the clipboard first, then open the
  // platform so the user can paste straight in. Mobile users get the
  // native share sheet via the top "Share" button instead.
  const facebookHref = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
    shareUrl,
  )}&quote=${encodeURIComponent(shareText)}`;
  const xHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    shareText,
  )}&url=${encodeURIComponent(shareUrl)}`;
  const instagramHref = 'https://www.instagram.com/';
  const tiktokHref = 'https://www.tiktok.com/';

  return (
    <div className="gold-panel relative flex flex-col bg-black/60 p-5 backdrop-blur overflow-hidden">
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${wash}`}
      />
      <div className="relative flex flex-1 flex-col">
        <Link href={href} className="block flex-1">
          <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-full border ${ring} bg-black/60`}>
            <Icon className={`h-7 w-7 ${accent}`} />
          </div>
          <h3 className="mb-1 text-base font-black uppercase tracking-widest text-white">
            {title}
          </h3>
          <p className="mb-4 text-sm text-gray-400">{sub}</p>
        </Link>

        <div className="mt-auto space-y-2">
          <button
            type="button"
            onClick={async () => {
              const ok = await nativeShare();
              if (!ok) await copyToClipboard();
            }}
            className={`inline-flex w-full items-center justify-center gap-2 rounded-md border ${ring} bg-black/40 py-2 text-[11px] font-bold uppercase tracking-widest text-white transition hover:bg-black/70`}
          >
            <Share2 className="h-3.5 w-3.5" />
            Share
          </button>

          <div
            role="group"
            aria-label="Share to a platform"
            className="grid grid-cols-5 gap-1.5 border-t border-yellow-500/15 pt-3"
          >
            <a
              href={tiktokHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Copy and open TikTok"
              onClick={copyToClipboard}
              className="flex items-center justify-center rounded-md bg-white/5 py-2 text-white transition hover:bg-white/10"
            >
              <TikTokGlyph className="h-3.5 w-3.5" />
            </a>
            <a
              href={instagramHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Copy and open Instagram"
              onClick={copyToClipboard}
              className="flex items-center justify-center rounded-md bg-white/5 py-2 text-white transition hover:bg-white/10"
            >
              <InstagramGlyph className="h-3.5 w-3.5" />
            </a>
            <a
              href={xHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Share on X"
              className="flex items-center justify-center rounded-md bg-white/5 py-2 text-white transition hover:bg-white/10"
            >
              <XGlyph className="h-3.5 w-3.5" />
            </a>
            <a
              href={facebookHref}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Share on Facebook"
              className="flex items-center justify-center rounded-md bg-white/5 py-2 text-white transition hover:bg-white/10"
            >
              <FacebookGlyph className="h-3.5 w-3.5" />
            </a>
            <button
              type="button"
              onClick={copyToClipboard}
              aria-label="Copy share link"
              className="flex items-center justify-center rounded-md bg-white/5 py-2 text-white transition hover:bg-white/10"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shared section header ──────────────────────────────────────────

/**
 * Unified eyebrow + headline pattern. Use across "standard" sections
 * (How It Works, The Stage, Recent Winners…) so the page reads as
 * one editorial system rather than ten separately-styled blocks.
 *
 * Sections that have a distinct in-panel header treatment (Hero,
 * Live Battle banner, Crown at Risk, Dethroned, Share Cards) keep
 * their own — those are deliberately differentiated by composition.
 */
function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = 'center',
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: 'center' | 'left';
}) {
  const alignClass = align === 'center' ? 'text-center mx-auto' : 'text-left';
  return (
    <div className={`mb-12 max-w-3xl ${alignClass}`}>
      {eyebrow && (
        <p className="text-yellow-400 font-bold text-xs uppercase tracking-[0.3em] mb-3">
          {eyebrow}
        </p>
      )}
      <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-white tracking-tight uppercase">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-3 text-gray-400 text-base md:text-lg">{subtitle}</p>
      )}
    </div>
  );
}

// ─── Scroll reveal ──────────────────────────────────────────────────

/**
 * Fade + slide-up wrapper that triggers once when the element enters the
 * viewport. Respects prefers-reduced-motion: skips the animation entirely
 * and renders the content in its final state. Threshold + rootMargin are
 * tuned so the reveal starts slightly before the section is fully on
 * screen — feels organic, not abrupt.
 */
function Reveal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setShown(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out motion-reduce:transition-none ${
        shown ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      }`}
    >
      {children}
    </div>
  );
}

// ─── Utilities ───────────────────────────────────────────────────────

function formatStat(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M+`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K+`;
  return `${n}+`;
}

function formatRuntime(seconds: number | null | undefined): string {
  if (!seconds || seconds < 1) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatRelativeTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = Math.max(0, Date.now() - t);
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'Moments ago';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

// ─── Brand glyph SVGs ──────────────────────────────────────────────
// lucide-react v1 doesn't ship brand icons, so we inline the four we
// need for the share row. Each accepts the same `className` API as
// lucide for drop-in sizing/colour.

function InstagramGlyph({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookGlyph({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M13.5 21v-7.5h2.6l.4-3H13.5V8.6c0-.9.3-1.5 1.6-1.5h1.6V4.3a23 23 0 0 0-2.4-.1c-2.4 0-4 1.4-4 4v2.3H8v3h2.3V21h3.2Z" />
    </svg>
  );
}

function XGlyph({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M17.5 3H21l-7.4 8.5L22 21h-6.6l-5.1-6.5L4.5 21H1l7.9-9.1L1.4 3H8l4.6 5.9L17.5 3Zm-1.2 16h1.9L7.7 5H5.7l10.6 14Z" />
    </svg>
  );
}

function TikTokGlyph({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M16.5 3a5.7 5.7 0 0 0 4.5 4.5v3.1a8.7 8.7 0 0 1-4.5-1.3v6.8a5.9 5.9 0 1 1-5.9-5.9c.3 0 .6 0 .9.1V13a3 3 0 1 0 2.1 2.9V3h2.9Z" />
    </svg>
  );
}
