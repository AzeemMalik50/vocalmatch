'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Bug #92 — page scroll position was persisting across route changes.
 * Concrete symptom: navigating from a long page (e.g. homepage scrolled
 * to the bottom) into a Champion's profile opened the profile already
 * scrolled to the bottom, hiding the header. Browsers/Next normally
 * scroll to top on forward navigation, but the sibling
 * `ScrollResetOnReload` component sets `history.scrollRestoration =
 * 'manual'` globally (so a hard refresh doesn't restore the previous
 * position), and that disables the browser's automatic top-on-nav
 * behavior too.
 *
 * This component re-establishes the expected default: on every
 * `pathname` change, scroll the window to the top. Two carve-outs:
 *
 *   1. **Back/forward** — when the user uses the browser back or
 *      forward button, we WANT to restore their previous position.
 *      We listen for `popstate` and skip the next scroll-reset.
 *   2. **Hash links** — if the new URL has a `#section` anchor, the
 *      browser's anchor jump should win. Skip reset when a hash is
 *      present.
 *
 * Mounted once at the top of the root layout, next to
 * `ScrollResetOnReload`.
 */
export default function ScrollResetOnNavigate() {
  const pathname = usePathname();
  const skipNextRef = useRef(false);
  // First render — already at top from the initial page load, so no
  // reset needed. Avoids a redundant scrollTo on mount.
  const hasMounted = useRef(false);

  // Mark popstate (back/forward) navigations so the next pathname
  // change can preserve scroll instead of resetting it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPop = () => {
      skipNextRef.current = true;
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    if (typeof window === 'undefined') return;
    if (skipNextRef.current) {
      skipNextRef.current = false;
      return;
    }
    if (window.location.hash) return;
    window.scrollTo(0, 0);
    // Pathname-only dependency. Query-string-only changes (filter
    // pills, sort, pagination) are intentional in-page interactions
    // and shouldn't yank the user back to the top.
  }, [pathname]);

  return null;
}
