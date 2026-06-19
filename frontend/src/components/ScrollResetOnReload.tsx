'use client';

import { useEffect, useLayoutEffect } from 'react';

// useLayoutEffect runs synchronously after DOM mutations but before paint —
// scrollTo here happens *before* the browser ever paints the restored
// position, so the user never sees a flash. SSR has no layout effect, so
// we fall back to useEffect there to avoid hydration warnings.
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * Bug #44 — on a hard refresh (Cmd+R / F5), the browser restored the
 * previous scroll position, which left users mid-page after a reload
 * and caused the "page auto-scrolled even though the URL is plain"
 * complaint. Two-layer fix:
 *
 *   1. Turn off the browser's native scroll restoration globally so it
 *      can't race React. From this point on, scroll position is owned
 *      entirely by client code.
 *   2. On every reload navigation, force scroll back to the top in a
 *      layout effect (before paint) so the user never sees a flash.
 *
 * Back-button restores still work because `history.scrollRestoration`
 * being `manual` doesn't affect them — the popstate path uses its own
 * scroll-state mechanism in Next's App Router.
 */
export default function ScrollResetOnReload() {
  useIsomorphicLayoutEffect(() => {
    if (typeof window === 'undefined') return;
    // Once-per-tab toggle. Setting it here is fine — Next mounts the
    // root layout exactly once per navigation, and this component
    // sits in that root.
    try {
      if ('scrollRestoration' in history) {
        history.scrollRestoration = 'manual';
      }
    } catch {
      /* Some embedded browsers reject this — silent no-op. */
    }

    try {
      const nav = performance.getEntriesByType(
        'navigation',
      )[0] as PerformanceNavigationTiming | undefined;
      // Only force-scroll on a real refresh. Initial navigations land
      // at the top by default; back/forward should respect the user's
      // saved scroll position.
      if (nav?.type === 'reload') {
        // Only when there's no hash — `#section` anchors should still
        // jump as the browser/user expects.
        if (!window.location.hash) {
          window.scrollTo(0, 0);
        }
      }
    } catch {
      /* PerformanceNavigationTiming not supported — silent no-op. */
    }
  }, []);
  return null;
}
