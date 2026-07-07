// frontend/src/components/QrShareModal.tsx
'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { qrImageUrl, downloadFile } from '@/lib/api';

interface Props {
  url: string;
  title?: string;
  open: boolean;
  onClose: () => void;
}

export default function QrShareModal({ url, title, open, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState<'png' | 'svg' | null>(null);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Reset `copied` when the modal reopens so a stale "Copied!" state
  // from a previous open never leaks into a fresh session.
  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!open) return null;
  // SSR guard: `createPortal` needs `document`. Even though this is a
  // client component, the initial hydration render can execute before
  // `document` is safe to reference in some Next.js flows.
  if (typeof document === 'undefined') return null;

  const previewSrc = qrImageUrl({ url, size: 512 });
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // best-effort
    }
  };
  const handleDownload = async (format: 'png' | 'svg') => {
    if (downloading) return;
    setDownloading(format);
    try {
      const src =
        format === 'png'
          ? qrImageUrl({ url, size: 512 })
          : qrImageUrl({ url, format: 'svg' });
      await downloadFile(src, `vocalmatch-qr.${format}`);
    } catch {
      // best-effort — the browser will surface fetch failures in devtools.
    } finally {
      setDownloading(null);
    }
  };

  // Portal to <body>. Without this, the overlay's `position: fixed`
  // resolves relative to the nearest ancestor with `transform`,
  // `filter`, `backdrop-filter`, `perspective`, `will-change: transform`,
  // or `contain: paint/layout/strict` — a CSS containing-block gotcha.
  // The home page nests this modal deep inside sections with
  // `backdrop-blur-*` decorative treatments, so the "fixed" overlay
  // was being anchored to whichever section owned the trigger button
  // rather than to the viewport. Escaping to <body> guarantees the
  // overlay covers the actual viewport regardless of scroll position
  // or the trigger's DOM location.
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-stage-900 border border-stage-600 rounded-lg p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between mb-4">
          <h2 className="text-xl font-display text-white">
            {title ?? 'Share as QR'}
          </h2>
          <button
            onClick={onClose}
            className="text-haze hover:text-white text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="flex items-center justify-center bg-white/5 rounded-md p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewSrc} alt="QR" className="max-w-full" style={{ width: 320 }} />
        </div>

        <p className="mt-3 text-xs text-haze break-all font-mono">{url}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          {/* Buttons (not anchors with `download`): the QR image is served
              cross-origin from the API domain, and browsers ignore the
              `download` attribute on cross-origin resources — that's why
              clicking previously opened the image inline. `downloadFile`
              fetches to a Blob and clicks a synthetic anchor, which
              actually triggers a save. */}
          <button
            type="button"
            onClick={() => handleDownload('png')}
            disabled={downloading !== null}
            className="px-3 py-2 rounded-md bg-spotlight text-white text-sm font-semibold disabled:opacity-60"
          >
            {downloading === 'png' ? 'Downloading…' : 'Download PNG'}
          </button>
          <button
            type="button"
            onClick={() => handleDownload('svg')}
            disabled={downloading !== null}
            className="px-3 py-2 rounded-md border border-stage-700/60 text-white text-sm font-semibold disabled:opacity-60"
          >
            {downloading === 'svg' ? 'Downloading…' : 'Download SVG'}
          </button>
          <button
            onClick={copyLink}
            aria-live="polite"
            className={`px-3 py-2 rounded-md border text-sm transition-colors ${
              copied
                ? 'border-green-500/50 bg-green-500/10 text-green-300'
                : 'border-stage-700/60 text-haze hover:text-white'
            }`}
          >
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
