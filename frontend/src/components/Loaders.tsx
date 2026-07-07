'use client';

import { ReactNode } from 'react';

/**
 * The single source of truth for loading UI across the app.
 *
 * Design intent: every loading state should feel like the curtain rising on
 * a stage — never a frozen page. We have two flavors:
 *
 *   - **Skeletons** — shape-of-content placeholders that keep the layout
 *     stable so nothing pops. Use these whenever we know what's coming.
 *   - **StageLoader** — a small block of "spotlight" pulse + brand-voice
 *     copy ("Cueing up the stage…", "Tuning in…"). Use this for sections
 *     where the content shape is unknown or the wait is brief.
 *
 * Never use bare "Loading…" text — it breaks the feel.
 */

// ─── Primitives ────────────────────────────────────────────────────

/**
 * A pulsing spotlight dot — the same visual language as the "Live" indicator
 * in the Nav and on battle cards. Reuse this everywhere we need a small
 * "we're alive" signal.
 */
export function Spinner({
  size = 'md',
  tone = 'spotlight',
}: {
  size?: 'sm' | 'md' | 'lg';
  tone?: 'spotlight' | 'gold' | 'haze';
}) {
  const dim =
    size === 'sm' ? 'h-2.5 w-2.5' : size === 'lg' ? 'h-4 w-4' : 'h-3 w-3';
  const color =
    tone === 'gold'
      ? 'bg-gold'
      : tone === 'haze'
        ? 'bg-haze'
        : 'bg-spotlight';
  return (
    <span className={`relative inline-flex ${dim}`} aria-hidden="true">
      <span
        className={`animate-ping absolute inline-flex h-full w-full rounded-full ${color} opacity-60`}
      />
      <span className={`relative inline-flex rounded-full ${dim} ${color}`} />
    </span>
  );
}

/**
 * Single skeleton block. Picks up the `.skeleton` shimmer defined in
 * globals.css. Use the size variants for consistency, or pass className
 * for one-offs.
 */
export function SkeletonBlock({
  className = '',
  rounded = 'md',
}: {
  className?: string;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
}) {
  const r =
    rounded === 'full'
      ? 'rounded-full'
      : rounded === 'sm'
        ? 'rounded'
        : rounded === 'lg'
          ? 'rounded-lg'
          : rounded === 'xl'
            ? 'rounded-xl'
            : 'rounded-md';
  return <div className={`skeleton ${r} ${className}`} aria-hidden="true" />;
}

// ─── Block-level loading states ────────────────────────────────────

/**
 * A small centered "we're loading" block with a spotlight pulse and copy.
 * Defaults to "Cueing up the stage…" — pass `message` to override.
 */
export function StageLoader({
  message = 'Cueing up the stage…',
  className = '',
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center gap-3 py-12 text-haze ${className}`}
      role="status"
      aria-live="polite"
    >
      <Spinner size="md" />
      <span className="text-sm font-medium tracking-wide">{message}</span>
    </div>
  );
}

/**
 * Full-page loader (rare — most surfaces should use a shape-aware skeleton).
 * Used as a last resort when we have no idea what's coming.
 */
export function FullPageLoader({
  message = 'Cueing up the stage…',
}: {
  message?: string;
}) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
      <Spinner size="lg" />
      <p className="text-haze text-sm tracking-wide">{message}</p>
    </div>
  );
}

// ─── Shape-aware skeletons ─────────────────────────────────────────

/**
 * Matches the LiveBattleCard in HomeBattleStatus. Use exactly N of these
 * (3 by default) so the grid is stable while the live battles list loads.
 */
export function BattleCardSkeleton() {
  return (
    <div className="bg-stage-900 border border-stage-600 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2">
        <Spinner size="sm" />
        <SkeletonBlock className="h-3 w-12" />
      </div>
      <SkeletonBlock className="h-5 w-3/4" />
      <SkeletonBlock className="h-3 w-1/2" />
      <div className="pt-4 border-t border-stage-700/60 flex items-end justify-between">
        <div className="space-y-1.5">
          <SkeletonBlock className="h-2 w-14" />
          <SkeletonBlock className="h-4 w-20" />
        </div>
      </div>
    </div>
  );
}

/**
 * Skeleton grid sized to whatever count you pass. Defaults to 3.
 */
export function BattleCardGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <BattleCardSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Matches the FeaturedBattle hero card on the right side of the homepage hero.
 * Used while the live-battle lookup is in flight so the hero never collapses.
 */
export function FeaturedBattleSkeleton() {
  return (
    <div className="relative bg-stage-900 border border-stage-600 rounded-2xl p-6 overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <Spinner size="sm" />
        <SkeletonBlock className="h-3 w-20" />
      </div>
      <SkeletonBlock className="h-6 w-3/4 mb-2" />
      <SkeletonBlock className="h-3 w-1/2 mb-4" />
      <div className="flex items-center justify-center gap-4 py-4 border-y border-stage-700/60 mb-4">
        <div className="flex flex-col items-center gap-2">
          <SkeletonBlock className="h-12 w-12" rounded="full" />
          <SkeletonBlock className="h-2 w-12" />
        </div>
        <SkeletonBlock className="h-6 w-6" />
        <div className="flex flex-col items-center gap-2">
          <SkeletonBlock className="h-12 w-12" rounded="full" />
          <SkeletonBlock className="h-2 w-12" />
        </div>
      </div>
      <SkeletonBlock className="h-10 w-full" rounded="md" />
    </div>
  );
}

/**
 * Full battle page skeleton — header, two video panes, vote panel.
 */
export function BattlePageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <SkeletonBlock className="h-6 w-20" rounded="full" />
          <SkeletonBlock className="h-4 w-24" />
        </div>
        <SkeletonBlock className="h-10 w-2/3" />
        <SkeletonBlock className="h-4 w-1/2" />
      </div>
      <div className="flex justify-center py-4">
        <SkeletonBlock className="h-12 w-64" />
      </div>
      <div className="grid md:grid-cols-2 gap-4 md:gap-6">
        <PerformancePaneSkeleton side="A" />
        <PerformancePaneSkeleton side="B" />
      </div>
      <div className="bg-stage-900 border border-stage-600 rounded-2xl p-6 md:p-8 space-y-4">
        <SkeletonBlock className="h-8 w-1/2 mx-auto" />
        <SkeletonBlock className="h-3 w-1/3 mx-auto" />
        <div className="grid grid-cols-2 gap-3 pt-2">
          <SkeletonBlock className="h-20" rounded="lg" />
          <SkeletonBlock className="h-20" rounded="lg" />
        </div>
      </div>
    </div>
  );
}

export function PerformancePaneSkeleton({ side }: { side: 'A' | 'B' }) {
  const accent = side === 'A' ? 'border-spotlight/30' : 'border-gold/30';
  return (
    <div
      className={`bg-stage-900 border-2 ${accent} rounded-xl overflow-hidden`}
    >
      <SkeletonBlock className="aspect-video" rounded="sm" />
      <div className="p-4 space-y-2">
        <p className="text-[11px] uppercase tracking-widest text-haze/60 font-bold">
          Side {side}
        </p>
        <SkeletonBlock className="h-5 w-3/4" />
        <SkeletonBlock className="h-3 w-1/3" />
      </div>
    </div>
  );
}

/**
 * For admin tables (Users, Battles list, etc.). Renders N rows of skeleton
 * cells matching a typical 5–6 column row.
 */
export function TableRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="bg-stage-900 border border-stage-600 rounded-xl p-4 flex items-center gap-3"
        >
          <SkeletonBlock className="h-9 w-9" rounded="full" />
          <div className="flex-1 space-y-1.5">
            <SkeletonBlock className="h-4 w-1/3" />
            <SkeletonBlock className="h-3 w-1/2" />
          </div>
          <SkeletonBlock className="h-6 w-16" rounded="sm" />
        </div>
      ))}
    </div>
  );
}

/**
 * Wrap any block where loading is in flight. Renders the children when
 * `loading=false`, otherwise renders the fallback. Keeps page code clean.
 */
export function When({
  loading,
  fallback,
  children,
}: {
  loading: boolean;
  fallback: ReactNode;
  children: ReactNode;
}) {
  return <>{loading ? fallback : children}</>;
}
