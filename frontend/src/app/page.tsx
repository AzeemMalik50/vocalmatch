'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Crown,
  Download,
  Eye,
  Flame,
  Headphones,
  Mic,
  Music,
  Play,
  Shield,
  Upload,
  Users,
  Vote,
  Zap,
} from 'lucide-react';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import {
  api,
  AtRiskCrownDto,
  BattleDto,
  DethronementDto,
  FeaturedSongRiskDto,
  GENRE_OPTIONS,
  PersonalDethronementDto,
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
      <Reveal><HowItWorks /></Reveal>
      <Reveal><StageCarousel /></Reveal>
      <Reveal><WinnersCarousel /></Reveal>
      <Reveal><ShareCardsRow /></Reveal>
      <Reveal><CTAFooter user={user} /></Reveal>
      <Footer />
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
            <h1 className="font-display text-6xl md:text-7xl lg:text-8xl text-white leading-[0.95]">
              One Song.
            </h1>
            <h1 className="font-display text-6xl md:text-7xl lg:text-8xl text-white leading-[0.95]">
              Two Voices.
            </h1>
            <h1 className="font-display text-6xl md:text-7xl lg:text-8xl text-red-600 leading-[0.95]">
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
  return (
    <div className="relative aspect-square w-full max-w-[34rem] mx-auto rounded-2xl overflow-hidden">
      <div className="absolute inset-0 -m-6 bg-gradient-to-br from-red-600/30 to-amber-500/10 rounded-3xl blur-2xl pointer-events-none" />

      <Image
        src={HERO_MAIN.src}
        alt={HERO_MAIN.alt}
        fill
        priority
        sizes="(max-width: 1024px) 100vw, 600px"
        className="object-cover relative z-10"
      />

      <div className="absolute inset-0 z-20 pointer-events-none bg-gradient-to-b from-black/40 via-transparent to-black/40" />

      <div className="absolute top-4 left-4 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur border border-amber-400/40">
        <Crown className="w-4 h-4 text-amber-400" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-amber-400">
          Official Voice
        </span>
      </div>

      <div className="absolute top-4 right-4 z-30 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur border border-red-500/40">
        <Zap className="w-4 h-4 text-red-500" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-red-500">
          Challenger
        </span>
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
  const [remaining, setRemaining] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const resp = await api.listBattles({ status: 'live', limit: 1 });
        if (cancelled || resp.items.length === 0) return;
        const featured = await api.getBattle(resp.items[0].id);
        if (cancelled) return;
        setBattle(featured);
        const [perfA, perfB] = await Promise.all([
          api.getVideo(featured.performanceAId),
          api.getVideo(featured.performanceBId),
        ]);
        if (cancelled) return;
        setA(perfA);
        setB(perfB);
      } catch {
        // Non-fatal — section degrades to empty state.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!battle?.votingClosesAt) return;
    const tick = () => {
      const end = new Date(battle.votingClosesAt).getTime();
      const diff = Math.max(0, end - Date.now());
      setRemaining({
        days: Math.floor(diff / 86_400_000),
        hours: Math.floor((diff % 86_400_000) / 3_600_000),
        minutes: Math.floor((diff % 3_600_000) / 60_000),
        seconds: Math.floor((diff % 60_000) / 1000),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [battle?.votingClosesAt]);

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

        {!battle || !a || !b ? (
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
              <div className="bg-card/50 backdrop-blur border border-red-600/30 rounded-2xl p-8 w-full">
                <div className="grid grid-cols-4 gap-4 text-center tabular">
                  <CountdownCell value={remaining.days} label="Days" />
                  <CountdownCell value={remaining.hours} label="Hrs" />
                  <CountdownCell value={remaining.minutes} label="Mins" />
                  <CountdownCell value={remaining.seconds} label="Secs" />
                </div>
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

        <BattlePillarsRow />
      </div>
    </section>
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

function CountdownCell({ value, label }: { value: number; label: string }) {
  return (
    <div>
      <div className="text-3xl font-bold text-red-600">
        {String(value).padStart(2, '0')}
      </div>
      <div className="text-xs text-gray-400 mt-2 uppercase tracking-widest">
        {label}
      </div>
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
          {performance.thumbnailUrl ? (
            <Image
              src={performance.thumbnailUrl}
              alt={performance.title}
              fill
              sizes="(max-width: 1024px) 100vw, 400px"
              className="object-cover"
            />
          ) : (
            <div
              className={`w-16 h-16 ${playBg} rounded-full flex items-center justify-center`}
            >
              <Play className={`w-8 h-8 ${accentColor} fill-current`} />
            </div>
          )}
        </div>
        <h3 className="text-xl font-bold text-white mb-1">{side}</h3>
        <p
          className={`text-sm ${accentColor} font-bold uppercase tracking-widest`}
        >
          {label}
        </p>
        {performance.uploader && (
          <p className="text-xs text-gray-400 mt-1">
            @{performance.uploader.username}
          </p>
        )}
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
  const href = user
    ? '/upload?challenge=1'
    : '/signup?next=/upload?challenge=1';

  return (
    <section className="bg-background py-12 md:py-20">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-10 lg:gap-16 items-center mb-12">
          <div className="relative w-full max-w-xs mx-auto lg:mx-0 aspect-square rounded-2xl overflow-hidden">
            <div className="absolute inset-0 -m-4 bg-red-600/30 rounded-3xl blur-2xl pointer-events-none" />
            <Image
              src={HERO_RED_PHONE.src}
              alt={HERO_RED_PHONE.alt}
              fill
              sizes="(max-width: 1024px) 90vw, 320px"
              className="object-cover relative z-10"
            />
          </div>
          <div className="text-center lg:text-left">
            <p className="text-red-500 font-bold text-xs uppercase tracking-[0.3em] mb-2">
              Red Phone Challenge
            </p>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-3">
              THINK YOU CAN TAKE THE CROWN?
            </h2>
            <p className="text-gray-300 text-lg max-w-xl mx-auto lg:mx-0">
              Pick up the red phone. Record your version. The next Official
              Voice could be you.
            </p>
          </div>
        </div>

        {/* 4 steps + 3 arrows = 7 lg children. Use an explicit
            [1fr_auto_1fr_auto_1fr_auto_1fr] track so the row fits without
            wrapping; collapses to a single column on mobile where the
            arrows hide. role=list/listitem keeps it accessible without
            forcing <ol>/<li> children that would clash with the arrows. */}
        <div
          role="list"
          aria-label="Challenge submission steps"
          className="grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] gap-5 lg:gap-3 items-stretch mb-12"
        >
          <FlowStep number={1} Icon={Download} title="DOWNLOAD" sub="the track" />
          <FlowArrow />
          <FlowStep number={2} Icon={Mic} title="RECORD" sub="your version" />
          <FlowArrow />
          <FlowStep number={3} Icon={Upload} title="UPLOAD" sub="your challenge" />
          <FlowArrow />
          <FlowStep
            number={4}
            Icon={Crown}
            title="IF SELECTED"
            sub="face the champion"
            reward
          />
        </div>

        <div className="text-center">
          <Link
            href={href}
            className="red-glow inline-flex items-center bg-red-600 hover:bg-red-700 text-white font-bold text-lg py-6 px-12 rounded-lg uppercase tracking-widest transition"
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
  const numberColor = reward ? 'text-yellow-400/80' : 'text-red-500/80';
  const titleColor = reward ? 'text-yellow-400' : 'text-white';
  const focusRing = reward ? 'focus-visible:ring-yellow-400' : 'focus-visible:ring-red-500';

  return (
    <div
      role="listitem"
      tabIndex={0}
      aria-label={`Step ${number}: ${title} — ${sub}`}
      className={`group relative flex flex-col items-center text-center p-4 rounded-2xl outline-none transition focus-visible:ring-2 ${focusRing} focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
        reward ? 'focus-visible:bg-yellow-500/5' : 'focus-visible:bg-red-500/5'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-2 right-3 font-display text-base tabular-nums tracking-widest ${numberColor}`}
      >
        {String(number).padStart(2, '0')}
      </span>
      <div
        className={`relative w-20 h-20 rounded-full flex items-center justify-center mb-4 border-2 transition motion-reduce:transition-none ${ring} ${ringBg} ${ringGlow}`}
      >
        <Icon
          aria-hidden="true"
          className={`w-9 h-9 transition motion-reduce:transition-none group-hover:scale-110 group-focus-visible:scale-110 motion-reduce:group-hover:scale-100 ${iconColor}`}
        />
      </div>
      <h3 className={`font-bold uppercase tracking-widest text-sm mb-1 ${titleColor}`}>
        {title}
      </h3>
      <p className="text-sm text-gray-400">{sub}</p>
    </div>
  );
}

function FlowArrow() {
  return (
    <div
      aria-hidden="true"
      className="hidden lg:flex items-center justify-center text-red-500/60"
    >
      <ChevronRight className="w-6 h-6" />
    </div>
  );
}

// ─── 4. Champion Section ─────────────────────────────────────────────

function ChampionSection() {
  const [featured, setFeatured] = useState<FeaturedSongRiskDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const f = await api.getFeaturedRisk();
        if (!cancelled) setFeatured(f);
      } catch {
        // Non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
                Defending Champion
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
                  Official Voice of the Song
                </p>
              </div>
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

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
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
              placeholder="Search performances..."
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const completed = await api.listBattles({
          status: 'completed',
          limit: 6,
        });
        if (cancelled) return;
        const detailed = await Promise.all(
          completed.items.slice(0, 6).map(async (b) => {
            try {
              const full = await api.getBattle(b.id);
              if (!full.winnerPerformanceId) return null;
              const perf = await api.getVideo(full.winnerPerformanceId);
              const song = await api.getSong(full.songId).catch(() => null);
              const total = (full.voteCountA ?? 0) + (full.voteCountB ?? 0);
              const winnerCount =
                full.winnerPerformanceId === full.performanceAId
                  ? full.voteCountA ?? 0
                  : full.voteCountB ?? 0;
              return {
                battleId: full.id,
                songTitle: song?.title ?? 'Centerstage Song',
                songArtist: song?.artist ?? '',
                winnerUsername: perf.uploader?.username ?? null,
                winnerAvatarUrl: perf.uploader?.avatarUrl ?? null,
                percent: total > 0 ? Math.round((winnerCount / total) * 100) : 0,
              } satisfies WinnerCard;
            } catch {
              return null;
            }
          }),
        );
        if (cancelled) return;
        setWinners(detailed.filter((w): w is WinnerCard => w !== null));
      } catch {
        // Non-fatal
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
                        <h3 className="text-2xl font-black text-white mb-1 truncate">
                          {w.winnerUsername ? `@${w.winnerUsername}` : 'Anonymous'}
                        </h3>
                        <p className="text-sm text-gray-400 truncate">
                          {w.songTitle}
                          {w.songArtist && ` · ${w.songArtist}`}
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
          <h2 className="text-5xl md:text-6xl font-black text-white leading-tight">
            WIN THE SONG.
          </h2>
          <h2 className="text-5xl md:text-6xl font-black text-red-600 leading-tight">
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // 3-state lookup: authed → try personal → fall back to marquee.
      try {
        if (user) {
          const mine = await api.getMyAtRiskCrowns();
          if (!cancelled && mine.length > 0) {
            setPersonal(mine[0]);
            return;
          }
        }
        const f = await api.getFeaturedRisk();
        if (!cancelled) setMarquee(f);
      } catch {
        try {
          const f = await api.getFeaturedRisk();
          if (!cancelled) setMarquee(f);
        } catch {
          /* both failed → panel renders nothing */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

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
    <section className="bg-background py-12 md:py-20">
      <div className="max-w-7xl mx-auto px-4">
        <div
          className={`gold-panel ${personalised ? 'personal-stake' : ''} relative overflow-hidden p-8 md:p-10`}
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
              <div className="flex items-center gap-6 mb-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">
                    Crown Risk
                  </p>
                  <p className={`text-4xl font-black ${tone.text}`}>
                    {risk.riskLevel}
                  </p>
                </div>
                <div className="text-gray-500 text-3xl" aria-hidden="true">·</div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">
                    Pending Challengers
                  </p>
                  <p className="text-4xl font-black text-white tabular-nums">
                    {risk.pendingChallengers}
                  </p>
                </div>
                {risk.lastBattleMarginPercent !== null && (
                  <>
                    <div className="text-gray-500 text-3xl" aria-hidden="true">·</div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">
                        Last Margin
                      </p>
                      <p className="text-4xl font-black text-white tabular-nums">
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (user) {
          const mine = await api.getMyRecentDethronements();
          if (!cancelled && mine.length > 0) {
            setPersonal(mine[0]);
            return;
          }
        }
        const list = await api.getRecentDethronements(1);
        if (!cancelled && list.length > 0) setLatest(list[0]);
      } catch {
        try {
          const list = await api.getRecentDethronements(1);
          if (!cancelled && list.length > 0) setLatest(list[0]);
        } catch {
          /* both failed → panel renders nothing */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (personal) {
    const eyebrow =
      personal.yourRole === 'former-champion'
        ? 'You Just Lost the Crown'
        : 'Your Pick Got Dethroned';
    return (
      <DethronedPanelView latest={personal} eyebrow={eyebrow} personalised />
    );
  }
  if (!latest) return null;
  return (
    <DethronedPanelView
      latest={latest}
      eyebrow="Dethroned!"
      personalised={false}
    />
  );
}

function DethronedPanelView({
  latest,
  eyebrow,
  personalised,
}: {
  latest: DethronementDto;
  eyebrow: string;
  personalised: boolean;
}) {
  return (
    <section className="bg-background py-12 md:py-20">
      <div className="max-w-7xl mx-auto px-4">
        <div
          className={`gold-panel ${personalised ? 'personal-stake' : ''} relative bg-card/40 backdrop-blur overflow-hidden`}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 via-transparent to-red-600/10 pointer-events-none" />
          <div className="relative grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 items-center p-8 md:p-10">
            <div>
              <p className="text-yellow-400 font-bold text-xs uppercase tracking-[0.3em] mb-2">
                {eyebrow}
              </p>
              <h2 className="text-3xl md:text-4xl font-black text-white mb-2">
                A new Official Voice has been crowned
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
              <div className="flex items-center gap-4 mb-6">
                {latest.formerChampion && (
                  <div className="flex items-center gap-2">
                    {latest.formerChampion.avatarUrl && (
                      <Image
                        src={latest.formerChampion.avatarUrl}
                        alt={latest.formerChampion.username}
                        width={40}
                        height={40}
                        className="w-10 h-10 rounded-full object-cover opacity-50 grayscale border-2 border-gray-700"
                      />
                    )}
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-widest">
                        Former
                      </p>
                      <p className="text-sm text-gray-400 line-through">
                        @{latest.formerChampion.username}
                      </p>
                    </div>
                  </div>
                )}
                <div className="text-gray-500 text-xl" aria-hidden="true">→</div>
                {latest.newChampion && (
                  <div className="flex items-center gap-2">
                    {latest.newChampion.avatarUrl && (
                      <Image
                        src={latest.newChampion.avatarUrl}
                        alt={latest.newChampion.username}
                        width={48}
                        height={48}
                        className="w-12 h-12 rounded-full object-cover border-2 border-yellow-500"
                      />
                    )}
                    <div>
                      <p className="text-[10px] text-yellow-400 uppercase tracking-widest">
                        New Crown
                      </p>
                      <p className="text-base font-bold text-white">
                        @{latest.newChampion.username}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <Link
                href={`/battle/${latest.battleId}`}
                className="inline-flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-black font-bold py-3 px-6 rounded-lg uppercase tracking-widest text-sm transition"
              >
                <Play className="w-4 h-4" />
                {personalised ? 'Watch What Happened' : 'Watch the Moment'}
              </Link>
            </div>
            <div className="relative w-40 h-40 md:w-56 md:h-56 rounded-2xl overflow-hidden border border-yellow-500/40">
              <div className="absolute inset-0 -m-4 bg-yellow-500/30 rounded-3xl blur-2xl pointer-events-none" />
              <Image
                src={HERO_DETHRONED.src}
                alt={HERO_DETHRONED.alt}
                fill
                sizes="(max-width: 768px) 160px, 224px"
                className="object-cover relative z-10"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 11. Share cards row ─────────────────────────────────────────────

function ShareCardsRow() {
  const cards = [
    {
      title: 'Vote Now',
      sub: 'Who deserves the song?',
      icon: Vote,
      tone: 'red' as const,
      href: '#live-battle',
    },
    {
      title: 'Challenge the Voice',
      sub: 'Can you take the crown?',
      icon: Mic,
      tone: 'red' as const,
      href: '/upload',
    },
    {
      title: 'New Crown Moments',
      sub: 'See the latest dethronement.',
      icon: Crown,
      tone: 'gold' as const,
      href: '#',
    },
    {
      title: 'The Crown Is Always at Risk',
      sub: 'Defend it. Or take it.',
      icon: Shield,
      tone: 'gold' as const,
      href: '#',
    },
  ];

  const shareUrl =
    typeof window !== 'undefined' ? window.location.origin : 'https://vocalmatch.app';
  const shareText = 'VOCALMATCH — One song. Two voices. One crown.';

  const tiktokUrl = 'https://www.tiktok.com/';
  const instagramUrl = 'https://www.instagram.com/';
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(
    shareUrl,
  )}`;

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
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6 md:p-10 text-center">
            <p className="text-yellow-400 text-xs font-bold uppercase tracking-[0.3em] mb-2">
              Share the moment
            </p>
            <h2 className="text-3xl md:text-5xl font-black text-white">
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
              tiktokUrl={tiktokUrl}
              instagramUrl={instagramUrl}
              facebookUrl={facebookUrl}
              shareText={shareText}
              shareUrl={shareUrl}
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
  tiktokUrl,
  instagramUrl,
  facebookUrl,
  shareText,
  shareUrl,
}: {
  title: string;
  sub: string;
  Icon: typeof Crown;
  tone: 'red' | 'gold';
  href: string;
  tiktokUrl: string;
  instagramUrl: string;
  facebookUrl: string;
  shareText: string;
  shareUrl: string;
}) {
  const accent = tone === 'red' ? 'text-red-500' : 'text-yellow-400';
  const ring = tone === 'red' ? 'border-red-500/40' : 'border-yellow-400/40';

  const copyShare = () => {
    if (typeof navigator === 'undefined') return;
    void navigator.clipboard.writeText(`${shareText} ${shareUrl}`).catch(() => {});
  };

  return (
    <div className={`gold-panel bg-black/60 backdrop-blur p-5 flex flex-col`}>
      <Link href={href} className="block flex-1">
        <div className={`w-14 h-14 rounded-full border ${ring} flex items-center justify-center mb-4`}>
          <Icon className={`w-7 h-7 ${accent}`} />
        </div>
        <h3 className="text-base font-black text-white mb-1 uppercase tracking-widest">
          {title}
        </h3>
        <p className="text-sm text-gray-400 mb-4">{sub}</p>
      </Link>
      <div className="grid grid-cols-4 gap-2 pt-3 border-t border-yellow-500/20">
        <a
          href={tiktokUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on TikTok"
          onClick={copyShare}
          className="flex items-center justify-center py-2 rounded-md bg-white/5 hover:bg-white/10 transition"
        >
          <span className="text-[10px] font-bold text-white uppercase tracking-widest">
            TikTok
          </span>
        </a>
        <a
          href={instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on Instagram"
          onClick={copyShare}
          className="flex items-center justify-center py-2 rounded-md bg-white/5 hover:bg-white/10 transition"
        >
          <span className="text-[10px] font-bold text-white uppercase tracking-widest">
            IG
          </span>
        </a>
        <a
          href={facebookUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Share on Facebook"
          className="flex items-center justify-center py-2 rounded-md bg-white/5 hover:bg-white/10 transition"
        >
          <span className="text-[10px] font-bold text-white uppercase tracking-widest">
            FB
          </span>
        </a>
        <button
          type="button"
          onClick={copyShare}
          aria-label="Copy share link"
          className="flex items-center justify-center py-2 rounded-md bg-white/5 hover:bg-white/10 transition"
        >
          <Download className="w-3 h-3 text-white" />
        </button>
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
