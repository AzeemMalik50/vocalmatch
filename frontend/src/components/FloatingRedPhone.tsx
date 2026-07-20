'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Phone, Crown } from 'lucide-react';

/**
 * Global "Red Phone" call-to-action widget — a floating pulsing button
 * pinned to the bottom-right of the viewport across every page. Clicking
 * it either smooth-scrolls to the `#red-phone-challenge` section on the
 * homepage, or navigates to `/#red-phone-challenge` from any other page.
 *
 * The pulse ring + gold crown accent are intentional signature elements:
 * the pulse says "the line is ringing, someone always wants the crown",
 * and the gold accent ties this dark red widget back into the brand
 * palette (spotlight ruby + antique gold).
 *
 * Hidden on auth / onboarding / admin routes because those flows have
 * their own primary CTAs and a floating "challenge" button doesn't fit
 * the context (an admin working the queue isn't the user we're inviting
 * to challenge).
 */

// Routes where the widget is intentionally suppressed. Each is a prefix
// match, so `/login`, `/login?next=…`, `/admin/battles/123` all match.
const HIDDEN_ROUTE_PREFIXES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/onboarding',
  '/admin',
];

export default function FloatingRedPhone() {
  const pathname = usePathname();
  const router = useRouter();

  // `usePathname` can return null on the very first render in some Next.js
  // edge cases; treat that as "unknown route → don't show" so we never
  // flash the widget briefly on a page it shouldn't appear on.
  if (!pathname) return null;
  if (HIDDEN_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    if (pathname === '/') {
      // Same-page smooth scroll — feels far more premium than a
      // hash-nav that jumps.
      const target = document.getElementById('red-phone-challenge');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
    }
    // Cross-page: navigate to home + anchor. The browser handles the
    // anchor jump after mount; smooth-scroll fires from CSS `scroll-behavior`.
    router.push('/#red-phone-challenge');
  };

  return (
    <a
      href="/#red-phone-challenge"
      onClick={handleClick}
      aria-label="Red Phone — challenge the current Official Voice"
      className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-40 group focus:outline-none"
    >
      <div className="relative flex flex-col items-center gap-1.5">
        {/* Outer pulse halo — Tailwind's animate-ping expands and fades a
            copy of the underlying box. Sized to match the button so the
            ring feels like it's radiating out of the phone itself. */}
        <span
          aria-hidden="true"
          className="absolute top-0 h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-spotlight/40 animate-ping pointer-events-none"
        />
        {/* Softer inner glow — layered underneath so the button always
            has a "hot" backdrop even between pulse frames. */}
        <span
          aria-hidden="true"
          className="absolute top-0 h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-spotlight/30 blur-xl pointer-events-none"
        />

        {/* The phone button itself. `focus-visible:ring-*` keeps
            keyboard focus visible without shouting at mouse users. */}
        <span
          className="relative flex h-16 w-16 sm:h-20 sm:w-20 items-center justify-center rounded-full bg-spotlight text-white shadow-2xl shadow-spotlight/50 border-2 border-gold/50 transition-transform group-hover:scale-105 group-active:scale-95 group-focus-visible:ring-4 group-focus-visible:ring-gold/50"
        >
          <Phone
            className="h-7 w-7 sm:h-8 sm:w-8 fill-white/10"
            strokeWidth={2.5}
          />
          {/* Gold crown accent — the "prestige at stake" mark. Positioned
              at the top-right so it reads as "the crown is on this call".
              `drop-shadow` adds a subtle glow so it doesn't disappear
              against the red button when it overlaps. */}
          <Crown
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5 h-5 w-5 sm:h-6 sm:w-6 text-gold drop-shadow-[0_0_4px_rgba(212,165,75,0.8)]"
            strokeWidth={2.5}
            fill="currentColor"
          />
        </span>

        {/* Label — small caps, always visible so people know what the
            widget does. Contained in its own pill so the text remains
            legible over any page background beneath the widget. */}
        <span className="relative text-[10px] font-black uppercase tracking-[0.25em] text-white bg-black/70 backdrop-blur px-2 py-0.5 rounded border border-spotlight/40 whitespace-nowrap">
          Red Phone
        </span>
      </div>
    </a>
  );
}
