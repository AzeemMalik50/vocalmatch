'use client';

import { useEffect, useRef } from 'react';

/**
 * Fires the supplied `refetch` callback whenever the device/browser
 * comes back online or the user returns to the tab.
 *
 * Mobile clients regularly drop and reacquire network — when the radio
 * comes back, the SSE connection auto-reconnects but any state changes
 * that happened during the gap (vote counts moved, battle finalized,
 * notifications written) are not replayed. Hitting REST on every
 * reconnect signal closes that gap with one round-trip.
 *
 * The callback runs at most once per signal — `online` and
 * `visibilitychange` are kept in a ref so a re-rendered parent doesn't
 * tear down the listeners.
 */
export function useReconnectRefetch(refetch: () => void) {
  const cbRef = useRef(refetch);
  useEffect(() => {
    cbRef.current = refetch;
  }, [refetch]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onOnline = () => {
      cbRef.current();
    };
    const onVisible = () => {
      // Tab/app coming back to the foreground also means a long stretch
      // of staleness — refetch even if `online` didn't fire (some mobile
      // browsers throttle that event aggressively in the background).
      if (document.visibilityState === 'visible') cbRef.current();
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
