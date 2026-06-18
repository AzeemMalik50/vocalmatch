'use client';

import { useEffect, useRef, useState } from 'react';
import { buildStreamUrl } from './api';

export type LobbyChange =
  | 'created'
  | 'updated'
  | 'closed'
  | 'cancelled'
  | 'needs_decision';

export interface LobbyEvent {
  battleId: string;
  songId: string;
  status: 'live' | 'needs_decision' | 'completed' | 'cancelled';
  winnerPerformanceId: string | null;
  winnerUserId: string | null;
  closedAt: string | null;
  change: LobbyChange;
}

/**
 * Subscribes to the public `lobby` SSE channel and invokes `onLifecycle`
 * every time a battle changes status (created, cancelled, closed, tied,
 * etc.). Anonymous-friendly — works whether or not the visitor is signed in.
 *
 * Browser EventSource handles reconnection automatically; this hook just
 * keeps the listener attached for the component's lifetime.
 *
 * Returns a `bumpKey` counter that increments on every event — components
 * that prefer to refetch wholesale (e.g. `useEffect(..., [bumpKey])`) can
 * depend on it instead of writing their own merge logic.
 */
export function useLobby(onLifecycle?: (e: LobbyEvent) => void): number {
  const [bumpKey, setBumpKey] = useState(0);
  // Keep the callback in a ref so we don't tear down the stream every time
  // the parent re-renders with a fresh function identity.
  const cbRef = useRef(onLifecycle);
  useEffect(() => {
    cbRef.current = onLifecycle;
  }, [onLifecycle]);

  useEffect(() => {
    const url = buildStreamUrl({ lobby: true });
    if (!url) return;
    // Diagnostic logging — visible in the browser console so we can
    // see whether the stream connected and what's arriving. Keep these
    // on a single `[lobby]` prefix so they're easy to filter.
    // eslint-disable-next-line no-console
    console.log('[lobby] opening', url);
    const es = new EventSource(url);
    es.addEventListener('open', () => {
      // eslint-disable-next-line no-console
      console.log('[lobby] connected, readyState=', es.readyState);
    });
    es.addEventListener('ready', (e: MessageEvent) => {
      // eslint-disable-next-line no-console
      console.log('[lobby] ready frame', e.data);
    });
    es.addEventListener('lifecycle', (e: MessageEvent) => {
      // eslint-disable-next-line no-console
      console.log('[lobby] lifecycle', e.data);
      try {
        const payload = JSON.parse(e.data) as LobbyEvent;
        cbRef.current?.(payload);
        setBumpKey((k) => k + 1);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[lobby] malformed frame', err);
      }
    });
    es.addEventListener('error', () => {
      // EventSource auto-reconnects; this just surfaces it. readyState 2 = CLOSED.
      // eslint-disable-next-line no-console
      console.warn('[lobby] error / disconnect, readyState=', es.readyState);
    });
    return () => {
      // eslint-disable-next-line no-console
      console.log('[lobby] closing');
      es.close();
    };
  }, []);

  return bumpKey;
}
