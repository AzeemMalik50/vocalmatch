'use client';

import { useEffect } from 'react';

/**
 * Bug #44 — on a hard refresh (Cmd+R / F5), the browser restores the
 * previous scroll position, which left users mid-page after a reload.
 * We force scroll back to the top, but only for refresh navigations —
 * back-button restores remain intact so users don't lose context when
 * returning to a long list.
 */
export default function ScrollResetOnReload() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const nav = performance.getEntriesByType(
        'navigation',
      )[0] as PerformanceNavigationTiming | undefined;
      if (nav?.type === 'reload') {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      }
    } catch {
      /* PerformanceNavigationTiming not supported — silent no-op. */
    }
  }, []);
  return null;
}
