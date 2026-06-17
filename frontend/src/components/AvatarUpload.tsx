'use client';

import { useState, useRef } from 'react';
import { api } from '@/lib/api';
import { useConfirm } from '@/lib/confirm-context';
import { Spinner } from './forms';

interface Props {
  currentUrl: string | null;
  username: string;
  /**
   * Fires whenever the avatar changes — including removal. Receives the
   * new URL, or `null` when the user removed their photo. Consumers
   * should update both the local profile object and any cached auth
   * snapshot with the same value.
   */
  onUploaded: (url: string | null) => void;
  size?: 'md' | 'lg';
}

export default function AvatarUpload({
  currentUrl,
  username,
  onUploaded,
  size = 'lg',
}: Props) {
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentUrl);
  const inputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();

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

  // Remove the current profile photo. Confirms first so a stray click
  // doesn't wipe the avatar. After success, the preview falls back to
  // the username-initial tile and the parent is notified via the same
  // onUploaded callback (empty string -> null in the public profile).
  const handleRemove = async () => {
    if (!previewUrl) return;
    const ok = await confirm({
      title: 'Remove your profile photo?',
      message: 'Your profile will fall back to the initial tile until you upload a new one.',
      confirmLabel: 'Remove photo',
      tone: 'danger',
    });
    if (!ok) return;
    setError(null);
    setRemoving(true);
    try {
      const updated = await api.removeAvatar();
      setPreviewUrl(updated.avatarUrl ?? null);
      onUploaded(updated.avatarUrl ?? null);
    } catch (e: any) {
      setError(e.message || 'Could not remove profile photo');
    } finally {
      setRemoving(false);
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

      {/* Remove button — only shown when there's a photo to remove.
          Sits below the avatar tile so it can't be hit by an accidental
          tap targeting the upload button. */}
      {previewUrl && !uploading && (
        <button
          type="button"
          onClick={handleRemove}
          disabled={removing}
          className="text-xs font-bold uppercase tracking-widest text-haze hover:text-red-300 disabled:opacity-50 transition-colors"
        >
          {removing ? 'Removing…' : 'Remove photo'}
        </button>
      )}

      {error && (
        <p className="text-xs text-spotlight text-center max-w-xs">{error}</p>
      )}
    </div>
  );
}
