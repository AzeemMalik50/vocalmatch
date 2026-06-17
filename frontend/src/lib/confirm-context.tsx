'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

export interface ConfirmOptions {
  title?: string;
  /** Primary message — the question the user is answering. */
  message: string;
  /** Optional secondary line (e.g. consequence reminder). */
  detail?: string;
  /** Confirm button label. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Cancel button label. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Use the danger (red) styling for destructive actions. */
  tone?: 'default' | 'danger';
}

type Resolver = (ok: boolean) => void;

interface QueueItem {
  id: number;
  opts: ConfirmOptions;
  resolve: Resolver;
}

interface ConfirmContextValue {
  /**
   * Request confirmation. Returns true when the user confirms, false on
   * cancel / dismiss. Drop-in replacement for `window.confirm` — just
   * `await` the call.
   */
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

/**
 * App-wide confirmation dialog. Mount <ConfirmProvider> high in the tree
 * (root layout); anywhere downstream, call useConfirm() and await the
 * returned promise to get a styled in-app dialog instead of the browser's
 * native `confirm()`. Honors keyboard: Enter confirms, Escape cancels,
 * focus traps inside the dialog. Stacks if multiple confirms fire close
 * together — the second one queues behind the first.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const nextId = useRef(0);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setQueue((prev) => [
        ...prev,
        { id: ++nextId.current, opts, resolve },
      ]);
    });
  }, []);

  const dismiss = useCallback((id: number, ok: boolean) => {
    setQueue((prev) => {
      const target = prev.find((q) => q.id === id);
      if (target) target.resolve(ok);
      return prev.filter((q) => q.id !== id);
    });
  }, []);

  const current = queue[0];

  // Lock background scroll while a dialog is open so accidental scrolling
  // can't change the page underneath. Restore the original overflow on
  // close.
  useEffect(() => {
    if (!current || typeof document === 'undefined') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [current]);

  // Global key handlers — Enter confirms the topmost dialog, Escape cancels.
  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss(current.id, false);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        dismiss(current.id, true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, dismiss]);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {current && (
        <ConfirmDialog
          opts={current.opts}
          onCancel={() => dismiss(current.id, false)}
          onConfirm={() => dismiss(current.id, true)}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): (opts: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error(
      'useConfirm must be used within a ConfirmProvider (mount it in the root layout).',
    );
  }
  return ctx.confirm;
}

function ConfirmDialog({
  opts,
  onCancel,
  onConfirm,
}: {
  opts: ConfirmOptions;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const tone = opts.tone ?? 'default';
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Auto-focus the primary action so Enter works without a tab dance, but
  // also so a screen reader announces the dialog properly on open.
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
    >
      {/* Backdrop — click to cancel */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out]"
        onClick={onCancel}
        aria-hidden="true"
      />
      {/* Panel */}
      <div className="relative w-full sm:max-w-md mx-0 sm:mx-4 bg-stage-900 border-t sm:border border-stage-700/80 sm:rounded-2xl shadow-2xl p-6 animate-[slideUp_0.2s_ease-out]">
        <h2
          id="confirm-title"
          className="font-display text-xl sm:text-2xl font-bold leading-tight mb-2"
        >
          {opts.title ?? (tone === 'danger' ? 'Are you sure?' : 'Confirm')}
        </h2>
        <p className="text-sm sm:text-base text-haze leading-relaxed">
          {opts.message}
        </p>
        {opts.detail && (
          <p className="mt-2 text-xs sm:text-sm text-haze/70">{opts.detail}</p>
        )}
        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 text-sm font-bold rounded-md bg-stage-800 border border-stage-700 text-haze hover:text-white hover:border-stage-500 transition-colors"
          >
            {opts.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            ref={confirmRef}
            onClick={onConfirm}
            className={`px-4 py-2.5 text-sm font-bold rounded-md transition-colors ${
              tone === 'danger'
                ? 'bg-red-500/15 text-red-300 border border-red-500/40 hover:bg-red-500/25'
                : 'bg-spotlight text-white border border-spotlight hover:bg-spotlight-dim'
            }`}
          >
            {opts.confirmLabel ??
              (tone === 'danger' ? 'Yes, do it' : 'Confirm')}
          </button>
        </div>
      </div>
      {/* Local keyframes — keep here so the component is drop-in without
          a Tailwind plugin. */}
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
