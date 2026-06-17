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
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto bg-stage-900/95 backdrop-blur border border-spotlight/40 rounded-full px-4 py-2.5 shadow-2xl flex items-center gap-2 max-w-[calc(100vw-2rem)] animate-[slideUp_0.25s_ease-out]"
        >
          <span className="text-base" aria-hidden="true">
            {t.icon}
          </span>
          {t.href ? (
            <Link
              href={t.href}
              className="text-sm font-bold hover:text-spotlight transition-colors"
            >
              {t.text}
            </Link>
          ) : (
            <span className="text-sm font-bold">{t.text}</span>
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
