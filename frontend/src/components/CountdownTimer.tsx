'use client';

import { useEffect, useState } from 'react';

interface Props {
  /** ISO string for when the countdown ends. */
  endsAt: string;
  /** Called once when the timer crosses zero. */
  onExpired?: () => void;
  /** "Compact" variant for inline use, "large" for hero placement. */
  size?: 'compact' | 'large';
}

interface Parts {
  expired: boolean;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
}

function diff(target: Date): Parts {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) {
    return { expired: true, hours: 0, minutes: 0, seconds: 0, totalSeconds: 0 };
  }
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { expired: false, hours, minutes, seconds, totalSeconds };
}

/**
 * Live countdown to a target ISO timestamp. Updates every second.
 * Calls `onExpired` exactly once when the deadline passes.
 */
export default function CountdownTimer({ endsAt, onExpired, size = 'large' }: Props) {
  const target = new Date(endsAt);
  const [parts, setParts] = useState<Parts>(() => diff(target));
  const [hasFired, setHasFired] = useState(parts.expired);

  useEffect(() => {
    const tick = () => setParts(diff(target));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);

  useEffect(() => {
    if (parts.expired && !hasFired) {
      setHasFired(true);
      onExpired?.();
    }
  }, [parts.expired, hasFired, onExpired]);

  const pad = (n: number) => String(n).padStart(2, '0');

  if (size === 'compact') {
    return (
      <span className="font-mono text-sm tabular-nums text-haze">
        {parts.expired
          ? 'Closed'
          : `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`}
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-3">
      {parts.expired ? (
        <span className="font-display font-bold text-2xl text-haze">
          Voting closed
        </span>
      ) : (
        <>
          <TimerSegment label="Hours" value={pad(parts.hours)} />
          <TimerSeparator />
          <TimerSegment label="Min" value={pad(parts.minutes)} />
          <TimerSeparator />
          <TimerSegment label="Sec" value={pad(parts.seconds)} />
        </>
      )}
    </div>
  );
}

function TimerSegment({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center min-w-[3.5rem]">
      <span className="font-display font-black text-3xl md:text-4xl tabular-nums text-white leading-none">
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-widest text-haze/60 mt-1">
        {label}
      </span>
    </div>
  );
}

function TimerSeparator() {
  return (
    <span className="font-display font-black text-3xl md:text-4xl text-spotlight leading-none -mt-3">
      :
    </span>
  );
}
