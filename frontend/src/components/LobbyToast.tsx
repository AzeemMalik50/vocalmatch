'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLobby, LobbyEvent } from '@/lib/useLobby';

interface Toast {
  id: number;
  text: string;
  icon: string;
  href?: string;
}

/**
 * Small floating toast that pops in when the lobby SSE channel fires a
 * lifecycle event. The page sections already silently refetch — this
 * gives visitors a visible heartbeat so they know the page is alive and
 * staying current without a manual refresh.
 *
 * Mounted once on the homepage. Anonymous-friendly (same lobby stream as
 * HomeBattleStatus / FeaturedBattle / RecentWinners).
 */
export default function LobbyToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  // Suppress the very first wave of events that fire right after we
  // connect (some browsers replay buffered events on reconnect; we only
  // want to surface fresh state changes, not historical noise).
  const ready = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => {
      ready.current = true;
    }, 800);
    return () => clearTimeout(t);
  }, []);

  const handle = useCallback((e: LobbyEvent) => {
    if (!ready.current) return;
    const t = renderToast(e, ++nextId.current);
    if (!t) return;
    setToasts((prev) => [...prev, t]);
    // Auto-dismiss after 4s. Multiple toasts stack.
    setTimeout(() => {
      setToasts((prev) => prev.filter((x) => x.id !== t.id));
    }, 4000);
  }, []);

  useLobby(handle);

  if (toasts.length === 0) return null;

  return (
    // Bug #85 — was `fixed bottom-4 right-4` at all widths. On iPhone
    // the browser chrome (Safari address bar + tab bar) eats ~80px
    // off the bottom, which pushed the toast almost off-screen, and
    // its right-anchored full-width look read as "leaning right /
    // not centered." Pin to top-center on mobile (where push-style
    // toasts conventionally land, clear of browser chrome), keep the
    // original bottom-right anchor from `sm:` upward.
    // Bug #102 — was `left-1/2 -translate-x-1/2 items-center`, which
    // sized the container to the toast's content width (so the
    // toast hugged its text on mobile and never spanned the
    // viewport). Switch to `inset-x-4` (edge-to-edge with 1rem
    // gutters) + `items-stretch` so toasts fill the available
    // mobile width. Desktop layout (bottom-right, content-width)
    // restored from `sm:` upward.
    <div
      className="
        fixed z-50 flex flex-col gap-2 pointer-events-none
        top-4 inset-x-4 items-stretch
        sm:top-auto sm:bottom-6 sm:right-6 sm:left-auto sm:inset-x-auto sm:items-end
      "
    >
      {toasts.map((t) => (
        // Rounded-2xl (handles wrapping cleanly), items-start (icon
        // stays aligned with the first line), tightened padding +
        // line-height. `w-full` makes each toast fill the mobile
        // container; `sm:w-auto sm:max-w-sm` reverts to content
        // width capped at `max-w-sm` on desktop.
        <div
          key={t.id}
          className="pointer-events-auto bg-stage-900/95 backdrop-blur border border-spotlight/40 rounded-2xl px-3.5 py-2.5 shadow-2xl flex items-start gap-2.5 w-full sm:w-auto sm:max-w-sm animate-[slideUp_0.25s_ease-out]"
        >
          <span
            className="text-base leading-none mt-0.5 shrink-0"
            aria-hidden="true"
          >
            {t.icon}
          </span>
          {t.href ? (
            <Link
              href={t.href}
              className="text-sm font-semibold leading-snug hover:text-spotlight transition-colors"
            >
              {t.text}
            </Link>
          ) : (
            <span className="text-sm font-semibold leading-snug">{t.text}</span>
          )}
        </div>
      ))}
      {/* keyframes inline so we don't have to wire a Tailwind plugin */}
      <style jsx>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

function renderToast(e: LobbyEvent, id: number): Toast | null {
  switch (e.change) {
    case 'created':
      return {
        id,
        icon: '🔴',
        text: 'A new battle just opened — vote now',
        href: `/battle/${e.battleId}`,
      };
    case 'closed':
      return {
        id,
        icon: '🏆',
        text: 'A battle just closed — see the winner',
        href: `/battle/${e.battleId}`,
      };
    case 'cancelled':
      return { id, icon: '✕', text: 'A battle was cancelled' };
    case 'needs_decision':
      return {
        id,
        icon: '⚖️',
        text: 'A battle ended in a tie — admin reviewing',
      };
    default:
      return null;
  }
}
