// frontend/src/components/QrShareModal.tsx
'use client';

import { useEffect } from 'react';
import { qrImageUrl } from '@/lib/api';

interface Props {
  url: string;
  title?: string;
  open: boolean;
  onClose: () => void;
}

export default function QrShareModal({ url, title, open, onClose }: Props) {
  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const previewSrc = qrImageUrl({ url, size: 512 });
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // best-effort
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-stage-900 border border-stage-700/60 rounded-lg p-6 max-w-md w-full"
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
          <a
            href={qrImageUrl({ url, size: 512 })}
            download="vocalmatch-qr.png"
            className="px-3 py-2 rounded-md bg-spotlight text-white text-sm font-semibold"
          >
            Download PNG
          </a>
          <a
            href={qrImageUrl({ url, format: 'svg' })}
            download="vocalmatch-qr.svg"
            className="px-3 py-2 rounded-md border border-stage-700/60 text-white text-sm font-semibold"
          >
            Download SVG
          </a>
          <button
            onClick={copyLink}
            className="px-3 py-2 rounded-md border border-stage-700/60 text-haze hover:text-white text-sm"
          >
            Copy link
          </button>
        </div>
      </div>
    </div>
  );
}
