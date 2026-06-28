'use client';

import { useState } from 'react';
import QrShareModal from './QrShareModal';
import { qrImageUrl } from '@/lib/api';

interface Props {
  url: string;
  /** Modal title when expanded. */
  title?: string;
  /** Visible badge text rendered to the right of the QR (default: "Scan"). */
  label?: string;
  /** Pixel size of the inline QR thumbnail. Defaults to 88. */
  size?: number;
  /** Extra Tailwind classes applied to the outer button. */
  className?: string;
}

/**
 * Always-visible QR card for the given URL. Renders a small QR
 * thumbnail; clicking opens the full QrShareModal for downloads.
 *
 * Used on battle, video, and homepage surfaces so visitors can scan
 * the current page instantly — no extra click required.
 */
export default function InlineQrCard({
  url,
  title,
  label = 'Scan',
  size = 88,
  className = '',
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group flex items-center gap-3 rounded-lg border border-stage-700/60 bg-white/95 p-2 hover:border-spotlight transition-colors ${className}`}
        aria-label={`Show QR code for ${url}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrImageUrl({ url, size: 256, fgColor: '#0B0F1A', bgColor: '#FFFFFF' })}
          alt=""
          width={size}
          height={size}
          className="block"
          style={{ width: size, height: size }}
        />
        <span className="pr-2 text-[10px] uppercase tracking-[0.25em] text-stage-900 font-bold">
          {label}
        </span>
      </button>

      <QrShareModal
        open={open}
        onClose={() => setOpen(false)}
        url={url}
        title={title}
      />
    </>
  );
}
