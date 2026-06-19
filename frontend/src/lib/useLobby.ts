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
 * Module-level shared connection. Bug #53 — every `useLobby()` caller
 * used to open its own `EventSource`. With 5+ panels subscribing on the
 * homepage (Hero, LiveBattle, ChampionSection, DethronedPanel,
 * WinnersCarousel, CrownAtRiskPanel) we blew past the browser's
 * ~6-connection-per-origin HTTP/1.1 cap. SSE connections are long-lived
 * and never freed a slot for the parallel API fetches the sections
 * needed, so `listBattles` / `getBattle` / `getVideo` queued
 * indefinitely and panels stayed pinned on their loading skeletons.
 *
 * One shared stream, fan-out via a subscriber set. Stream opens on the
 * first subscriber and closes when the last unmounts.
 */
type Subscriber = (e: LobbyEvent) => void;
let sharedSource: EventSource | null = null;
const subscribers = new Set<Subscriber>();

function ensureStream() {
  if (sharedSource) return;
  const url = buildStreamUrl({ lobby: true });
  if (!url) return;
  // eslint-disable-next-line no-console
  console.log('[lobby] opening shared stream', url);
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
      for (const cb of subscribers) cb(payload);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[lobby] malformed frame', err);
    }
  });
  es.addEventListener('error', () => {
    // eslint-disable-next-line no-console
    console.warn('[lobby] error / disconnect, readyState=', es.readyState);
  });
  sharedSource = es;
}

function teardownStreamIfIdle() {
  if (subscribers.size > 0) return;
  if (!sharedSource) return;
  // eslint-disable-next-line no-console
  console.log('[lobby] closing shared stream (no subscribers)');
  sharedSource.close();
  sharedSource = null;
}

/**
 * Subscribes to the public `lobby` SSE channel and invokes `onLifecycle`
 * every time a battle changes status (created, cancelled, closed, tied,
 * etc.). Anonymous-friendly — works whether or not the visitor is signed in.
 *
 * Multiple components can call this hook freely; under the hood there's
 * exactly one `EventSource` per page (see the module-level singleton
 * above). Browser EventSource handles reconnection automatically; this
 * hook just keeps the listener attached for the component's lifetime.
 *
 * Returns a `bumpKey` counter that increments on every event — components
 * that prefer to refetch wholesale (e.g. `useEffect(..., [bumpKey])`) can
 * depend on it instead of writing their own merge logic.
 */
export function useLobby(onLifecycle?: (e: LobbyEvent) => void): number {
  const [bumpKey, setBumpKey] = useState(0);
  // Keep the callback in a ref so we don't tear down the subscription
  // every time the parent re-renders with a fresh function identity.
  const cbRef = useRef(onLifecycle);
  useEffect(() => {
    cbRef.current = onLifecycle;
  }, [onLifecycle]);

  useEffect(() => {
    const sub: Subscriber = (payload) => {
      cbRef.current?.(payload);
      setBumpKey((k) => k + 1);
    };
    subscribers.add(sub);
    ensureStream();
    return () => {
      subscribers.delete(sub);
      teardownStreamIfIdle();
    };
  }, []);

  return bumpKey;
}
