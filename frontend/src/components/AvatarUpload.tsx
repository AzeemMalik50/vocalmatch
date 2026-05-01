'use client';

import { useState, useRef } from 'react';
import { api } from '@/lib/api';
import { Spinner } from './forms';

interface Props {
  currentUrl: string | null;
  username: string;
  onUploaded: (url: string) => void;
  size?: 'md' | 'lg';
}

export default function AvatarUpload({
  currentUrl,
  username,
  onUploaded,
  size = 'lg',
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const inputRef = useRef<HTMLInputElement>(null);

  const dim = size === 'lg' ? 'w-32 h-32 md:w-36 md:h-36' : 'w-24 h-24';
  const fontSize = size === 'lg' ? 'text-5xl' : 'text-3xl';

  const handleFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      setError('Max image size is 5 MB.');
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }

    setError(null);
    setUploading(true);

    // Local preview while uploading
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);

    try {
      const updated = await api.uploadAvatar(file);
      setPreviewUrl(updated.avatarUrl);
      if (updated.avatarUrl) onUploaded(updated.avatarUrl);
    } catch (e: any) {
      setError(e.message);
      setPreviewUrl(currentUrl);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className={`relative ${dim} rounded-full bg-gradient-to-br from-stage-800 to-stage-900 border-2 border-spotlight/30 hover:border-spotlight transition-all overflow-hidden group shadow-2xl`}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={username}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className={`w-full h-full flex items-center justify-center font-display font-black text-haze ${fontSize}`}
          >
            {username[0]?.toUpperCase() ?? '♪'}
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          {uploading ? (
            <Spinner size={24} />
          ) : (
            <div className="flex flex-col items-center gap-1 text-white">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M3 4a2 2 0 012-2h2.5l1-1h3l1 1H17a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4zm10 5a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-[10px] uppercase tracking-widest font-bold">
                Upload
              </span>
            </div>
          )}
        </div>

        {/* Always-visible camera badge */}
        {!uploading && (
          <div className="absolute bottom-1 right-1 w-9 h-9 rounded-full bg-spotlight flex items-center justify-center border-2 border-stage-950 shadow-lg group-hover:opacity-0 transition-opacity">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="white">
              <path d="M3 4a2 2 0 012-2h2.5l1-1h3l1 1H17a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4zm10 5a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = ''; // allow re-selecting same file
        }}
      />

      {error && (
        <p className="text-xs text-spotlight text-center max-w-xs">{error}</p>
      )}
    </div>
  );
}
