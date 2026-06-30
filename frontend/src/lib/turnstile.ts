// frontend/src/lib/turnstile.ts
'use client';

import { useEffect, useState } from 'react';
import { api, TurnstileConfigDto } from './api';

let cached: TurnstileConfigDto | undefined;
let inflight: Promise<TurnstileConfigDto> | null = null;

function fetchOnce(): Promise<TurnstileConfigDto> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api
      .getTurnstileConfig()
      .then((config) => {
        cached = config;
        return config;
      })
      .catch((_err) => {
        inflight = null;
        // Fail-open: if config fetch fails, behave as disabled.
        // Worst case is that legitimate users sail through; the server
        // still rejects requests if Turnstile is actually enabled.
        const fallback: TurnstileConfigDto = { enabled: false, siteKey: null };
        cached = fallback;
        return fallback;
      });
  }
  return inflight;
}

export function useTurnstileConfig(): TurnstileConfigDto {
  const [config, setConfig] = useState<TurnstileConfigDto>(
    cached ?? { enabled: false, siteKey: null },
  );

  useEffect(() => {
    if (cached) return;
    let cancelled = false;
    fetchOnce().then((c) => {
      if (!cancelled) setConfig(c);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return config;
}
