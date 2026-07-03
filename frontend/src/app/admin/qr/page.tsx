// frontend/src/app/admin/qr/page.tsx
'use client';

import { useMemo, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { qrImageUrl, downloadFile } from '@/lib/api';

const FRONTEND_BASE =
  process.env.NEXT_PUBLIC_FRONTEND_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'https://vocalmatch.com');

const BG_PRESETS = [
  { label: 'White', value: '#FFFFFF' },
  { label: 'Black', value: '#000000' },
  { label: 'Transparent', value: 'transparent' },
];

const SIZE_PRESETS = [256, 512, 1024, 2048];

export default function AdminQrPage() {
  const [path, setPath] = useState('/');
  const [fgColor, setFgColor] = useState('#FF4B57');
  const [bgColor, setBgColor] = useState('#FFFFFF');
  const [size, setSize] = useState(512);

  const [utmOpen, setUtmOpen] = useState(false);
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');

  const fullUrl = useMemo(() => {
    const cleanedPath = path.startsWith('/') ? path : `/${path}`;
    const base = `${FRONTEND_BASE.replace(/\/+$/, '')}${cleanedPath}`;
    const [bare, existing] = base.split('?');
    const sp = new URLSearchParams(existing ?? '');
    if (utmSource) sp.set('utm_source', utmSource);
    if (utmMedium) sp.set('utm_medium', utmMedium);
    if (utmCampaign) sp.set('utm_campaign', utmCampaign);
    const qs = sp.toString();
    return qs ? `${bare}?${qs}` : bare;
  }, [path, utmSource, utmMedium, utmCampaign]);

  const previewSrc = qrImageUrl({ url: fullUrl, size, fgColor, bgColor });

  const embed = `<img src="${previewSrc}" alt="QR code for ${fullUrl}" />`;

  // Transient "Copied!" state per button — matches the pattern used in
  // BattleVotePanel and QrShareModal so users get consistent feedback
  // across every copy-to-clipboard action.
  const [copiedKey, setCopiedKey] = useState<'url' | 'embed' | null>(null);
  const copyText = async (text: string, key: 'url' | 'embed') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(
        () => setCopiedKey((k) => (k === key ? null : k)),
        2000,
      );
    } catch {
      // best-effort — the clipboard API can reject on non-secure origins
      // or when the tab hasn't been focused since load.
    }
  };
  const copyEmbed = () => copyText(embed, 'embed');
  const copyUrl = () => copyText(fullUrl, 'url');

  // Cross-origin download: the QR image is served by the API domain,
  // so a bare `<a href download>` opens the file inline instead of
  // saving it. `downloadFile` fetches the bytes into a Blob and clicks
  // a synthetic anchor so the save dialog actually fires.
  const [downloadingKey, setDownloadingKey] = useState<
    'png-512' | 'png-1024' | 'svg' | null
  >(null);
  const handleDownload = async (
    key: 'png-512' | 'png-1024' | 'svg',
    src: string,
    filename: string,
  ) => {
    if (downloadingKey) return;
    setDownloadingKey(key);
    try {
      await downloadFile(src, filename);
    } catch {
      // best-effort — surfacing to the admin isn't worth a toast here.
    } finally {
      setDownloadingKey(null);
    }
  };

  return (
    <AdminShell>
      <header className="mb-6">
        <h1 className="text-3xl font-display text-white">QR Code Toolkit</h1>
        <p className="text-sm text-haze mt-1">
          Generate branded QR codes for any VOCALMATCH page. Tune size and
          colors, optionally add UTM tags, then download.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: controls */}
        <div className="space-y-6">
          <section>
            <label className="block text-xs uppercase tracking-[0.25em] text-haze mb-2">
              Page
            </label>
            <div className="flex items-stretch">
              <span className="px-3 py-2 bg-stage-900/40 border border-r-0 border-stage-700/60 rounded-l-md text-sm text-haze font-mono">
                {FRONTEND_BASE.replace(/\/+$/, '')}
              </span>
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/"
                className="flex-1 px-3 py-2 bg-stage-900/60 border border-stage-700/60 rounded-r-md text-white font-mono text-sm"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {['/', '/battles', '/songs', '/upload'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPath(p)}
                  className="px-2 py-1 text-xs rounded border border-stage-700/60 text-haze hover:text-white"
                >
                  {p}
                </button>
              ))}
            </div>
          </section>

          <section>
            <button
              onClick={() => setUtmOpen((v) => !v)}
              className="text-xs uppercase tracking-[0.25em] text-haze hover:text-white"
            >
              {utmOpen ? '▾' : '▸'} UTM tags (optional)
            </button>
            {utmOpen && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <UtmInput label="Source" value={utmSource} onChange={setUtmSource} placeholder="instagram" />
                <UtmInput label="Medium" value={utmMedium} onChange={setUtmMedium} placeholder="qr" />
                <UtmInput label="Campaign" value={utmCampaign} onChange={setUtmCampaign} placeholder="summer-2026" />
              </div>
            )}
          </section>

          <section>
            <label className="block text-xs uppercase tracking-[0.25em] text-haze mb-2">
              Colors
            </label>
            <div className="flex items-center gap-3">
              <label className="text-sm text-haze flex items-center gap-2">
                FG
                <input
                  type="color"
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                  className="w-10 h-10 rounded border border-stage-700/60"
                />
                <span className="font-mono text-xs">{fgColor}</span>
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {BG_PRESETS.map((bg) => (
                <button
                  key={bg.value}
                  onClick={() => setBgColor(bg.value)}
                  className={`px-3 py-1 text-xs rounded border ${
                    bgColor === bg.value
                      ? 'border-spotlight text-white'
                      : 'border-stage-700/60 text-haze'
                  }`}
                >
                  {bg.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <label className="block text-xs uppercase tracking-[0.25em] text-haze mb-2">
              Size
            </label>
            <div className="flex flex-wrap gap-2">
              {SIZE_PRESETS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={`px-3 py-1 text-xs rounded border ${
                    size === s
                      ? 'border-spotlight text-white'
                      : 'border-stage-700/60 text-haze'
                  }`}
                >
                  {s}px
                </button>
              ))}
            </div>
          </section>

          <section>
            <label className="block text-xs uppercase tracking-[0.25em] text-haze mb-2">
              Encoded URL
            </label>
            <div className="flex items-center gap-2">
              <input
                value={fullUrl}
                readOnly
                className="flex-1 px-3 py-2 bg-stage-900/60 border border-stage-700/60 rounded-md text-white font-mono text-xs"
              />
              <button
                onClick={copyUrl}
                aria-live="polite"
                className={`px-3 py-2 rounded-md border text-xs transition-colors ${
                  copiedKey === 'url'
                    ? 'border-green-500/50 bg-green-500/10 text-green-300'
                    : 'border-stage-700/60 text-haze hover:text-white'
                }`}
              >
                {copiedKey === 'url' ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </section>
        </div>

        {/* Right: preview + download */}
        <div>
          <div className="rounded-lg border border-stage-700 p-6 bg-stage-900/40 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewSrc}
              alt="QR preview"
              className="max-w-full"
              style={{ width: Math.min(size, 512) }}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                handleDownload(
                  'png-512',
                  qrImageUrl({ url: fullUrl, size: 512, fgColor, bgColor }),
                  'vocalmatch-qr-512.png',
                )
              }
              disabled={downloadingKey !== null}
              className="px-3 py-2 rounded-md bg-spotlight text-white text-sm font-semibold disabled:opacity-60"
            >
              {downloadingKey === 'png-512' ? 'Downloading…' : 'PNG 512'}
            </button>
            <button
              type="button"
              onClick={() =>
                handleDownload(
                  'png-1024',
                  qrImageUrl({ url: fullUrl, size: 1024, fgColor, bgColor }),
                  'vocalmatch-qr-1024.png',
                )
              }
              disabled={downloadingKey !== null}
              className="px-3 py-2 rounded-md bg-spotlight text-white text-sm font-semibold disabled:opacity-60"
            >
              {downloadingKey === 'png-1024' ? 'Downloading…' : 'PNG 1024'}
            </button>
            <button
              type="button"
              onClick={() =>
                handleDownload(
                  'svg',
                  qrImageUrl({
                    url: fullUrl,
                    format: 'svg',
                    fgColor,
                    bgColor,
                  }),
                  'vocalmatch-qr.svg',
                )
              }
              disabled={downloadingKey !== null}
              className="px-3 py-2 rounded-md bg-spotlight text-white text-sm font-semibold disabled:opacity-60"
            >
              {downloadingKey === 'svg' ? 'Downloading…' : 'SVG'}
            </button>
          </div>

          <div className="mt-4">
            <label className="block text-xs uppercase tracking-[0.25em] text-haze mb-2">
              Embed snippet
            </label>
            <textarea
              value={embed}
              readOnly
              rows={3}
              className="w-full px-3 py-2 bg-stage-900/60 border border-stage-700/60 rounded-md text-white font-mono text-xs"
            />
            <button
              onClick={copyEmbed}
              aria-live="polite"
              className={`mt-2 px-3 py-1.5 rounded-md border text-xs transition-colors ${
                copiedKey === 'embed'
                  ? 'border-green-500/50 bg-green-500/10 text-green-300'
                  : 'border-stage-700/60 text-haze hover:text-white'
              }`}
            >
              {copiedKey === 'embed' ? 'Copied!' : 'Copy embed'}
            </button>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function UtmInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="text-xs uppercase tracking-[0.25em] text-haze">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 block w-full px-3 py-2 bg-stage-900/60 border border-stage-700/60 rounded-md text-white text-sm font-mono"
      />
    </label>
  );
}
