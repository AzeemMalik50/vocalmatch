'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface DarkSelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  options: DarkSelectOption[];
  /** Optional placeholder for when `value === ''`. */
  placeholder?: string;
  /** Override the trigger button class. */
  className?: string;
  /** Accessible label. */
  ariaLabel?: string;
}

/**
 * Bug #95 — Safari (and to a lesser extent Firefox) ignores
 * `<option>` styling on a native `<select>`, so even with
 * `color-scheme: dark` the dropdown PANEL renders in the OS's
 * default light theme on macOS and iOS. The only fully reliable
 * cross-browser fix is to render our own option panel.
 *
 * DarkSelect is a minimal, dependency-free replacement for native
 * `<select>` with the same one-pick semantics:
 *   - Click trigger → panel opens beneath it.
 *   - Click an option → fires `onChange` and closes.
 *   - Click outside / Escape → closes without changing value.
 *   - Arrow keys move focus when the panel is open; Enter selects.
 *
 * Styling matches the existing styled selects: stage-900 surface,
 * border, focus ring. Looks identical to the native trigger in dark
 * mode but the panel is now ours and stays dark in Safari.
 */
// useLayoutEffect throws a warning on SSR; fall back to useEffect there.
const useIsoLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default function DarkSelect({
  value,
  onChange,
  options,
  placeholder,
  className,
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Bug #97 — render the panel via a portal into document.body so it
  // escapes every ancestor's stacking context and overflow rules.
  // Compute pixel-anchored position from the trigger's bounding box.
  const [panelRect, setPanelRect] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const reposition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPanelRect({
      top: r.bottom + window.scrollY + 4,
      left: r.left + window.scrollX,
      width: r.width,
    });
  };

  useIsoLayoutEffect(() => {
    if (!open) return;
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? null;
  const triggerLabel = selected?.label ?? placeholder ?? 'Select…';

  // Close on outside click + Escape. Bug #97 — the panel is rendered
  // in a portal so it's NOT a DOM descendant of rootRef anymore;
  // include listRef in the "inside" check so clicks on the panel
  // don't immediately close it.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideRoot = rootRef.current?.contains(target) ?? false;
      const insidePanel = listRef.current?.contains(target) ?? false;
      if (!insideRoot && !insidePanel) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // When the panel opens, seed the active index to the current value
  // so keyboard nav starts somewhere sensible.
  useEffect(() => {
    if (!open) return;
    const idx = options.findIndex((o) => o.value === value);
    setActiveIndex(idx >= 0 ? idx : 0);
  }, [open, options, value]);

  const commit = (idx: number) => {
    const opt = options[idx];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
  };

  const onTriggerKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(activeIndex);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActiveIndex(options.length - 1);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKey}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel ?? placeholder ?? 'Select'}
        className={
          className ??
          'inline-flex items-center justify-between gap-2 bg-muted/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-red-600 min-w-[10rem]'
        }
      >
        <span className="truncate">{triggerLabel}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 text-haze transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <path
            d="M3 4.5l3 3 3-3"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* Bug #97 — render the panel via a React portal into <body> so
          it escapes every ancestor's stacking context AND any
          `overflow: hidden` clipping up the tree (the filter row /
          carousel containers were chopping the bottom options).
          Positioning is computed from the trigger's getBoundingClientRect
          and refreshed on scroll/resize. */}
      {open && panelRect && typeof document !== 'undefined' && createPortal(
        <ul
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          aria-label={ariaLabel ?? placeholder ?? 'Options'}
          onKeyDown={onListKey}
          style={{
            position: 'absolute',
            top: panelRect.top,
            left: panelRect.left,
            width: panelRect.width,
            backgroundColor: '#0a060e',
            border: '1px solid #261a1e',
            colorScheme: 'dark',
            zIndex: 9999,
          }}
          className="max-h-72 overflow-auto rounded-lg shadow-2xl focus:outline-none"
        >
          {options.map((opt, i) => {
            const isSelected = opt.value === value;
            const isActive = i === activeIndex;
            return (
              <li
                key={opt.value}
                role="option"
                aria-selected={isSelected}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => commit(i)}
                style={{
                  backgroundColor: isActive ? '#160f12' : 'transparent',
                  color: isSelected || isActive ? '#ffffff' : '#d2c6b8',
                  fontWeight: isSelected ? 700 : 400,
                }}
                className="cursor-pointer px-3 py-2 text-sm transition-colors"
              >
                <span className="inline-flex items-center gap-2">
                  {isSelected && (
                    <span aria-hidden="true" style={{ color: '#ef4444' }}>
                      ✓
                    </span>
                  )}
                  <span className={isSelected ? '' : 'pl-4'}>{opt.label}</span>
                </span>
              </li>
            );
          })}
        </ul>,
        document.body,
      )}
    </div>
  );
}
