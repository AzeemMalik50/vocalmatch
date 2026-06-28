// frontend/src/components/TurnstileWidget.tsx
'use client';

import { useEffect } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { useTurnstileConfig } from '@/lib/turnstile';

interface Props {
  onToken: (token: string) => void;
  onExpire?: () => void;
  /** Force a fresh widget — pass a bumping integer to reset after a failed submit. */
  resetKey?: number;
}

export default function TurnstileWidget({ onToken, onExpire, resetKey }: Props) {
  const { enabled, siteKey } = useTurnstileConfig();

  // When Turnstile is disabled, immediately signal "open" so submit
  // gating doesn't deadlock.
  useEffect(() => {
    if (!enabled) onToken('');
  }, [enabled, onToken]);

  if (!enabled || !siteKey) return null;

  return (
    <div className="mt-2">
      <Turnstile
        key={resetKey}
        siteKey={siteKey}
        options={{ theme: 'dark', size: 'normal' }}
        onSuccess={onToken}
        onExpire={() => {
          onToken('');
          onExpire?.();
        }}
      />
    </div>
  );
}
