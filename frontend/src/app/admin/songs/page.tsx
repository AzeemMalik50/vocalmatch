'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { TableRowsSkeleton } from '@/components/Loaders';
import { api, SongDto } from '@/lib/api';

interface SongFormState {
  title: string;
  artist: string;
  trackUrl: string;
  coverArtUrl: string;
}

const empty: SongFormState = { title: '', artist: '', trackUrl: '', coverArtUrl: '' };

export default function AdminSongsPage() {
  const [songs, setSongs] = useState<SongDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SongFormState>(empty);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await api.listSongs('all');
      setSongs(resp.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim() || !form.artist.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.createSong({
        title: form.title.trim(),
        artist: form.artist.trim(),
        trackUrl: form.trackUrl.trim() || undefined,
        coverArtUrl: form.coverArtUrl.trim() || undefined,
      });
      setForm(empty);
      setShowForm(false);
      await load();
    } catch (e: any) {
      setError(e.message || 'Could not create song');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStatus = async (s: SongDto) => {
    const next = s.status === 'active' ? 'retired' : 'active';
    await api.updateSong(s.id, { status: next });
    await load();
  };

  return (
    <AdminShell>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display font-black text-3xl mb-1">Songs</h1>
          <p className="text-haze">
            The Centerstage Song catalog. Active songs appear publicly and can host battles.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="px-5 py-2.5 bg-spotlight text-white font-bold rounded-md hover:bg-spotlight-dim transition-colors"
        >
          {showForm ? 'Cancel' : '+ New song'}
        </button>
      </div>

      {showForm && (
        <form
          onSubmit={submit}
          className="bg-stage-900 border border-stage-700/60 rounded-xl p-5 mb-8 space-y-4 max-w-2xl"
        >
          <Field label="Title" required>
            <input
              type="text"
              required
              maxLength={200}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2.5 bg-stage-950 border border-stage-700 rounded-md focus:outline-none focus:border-spotlight transition-colors"
            />
          </Field>
          <Field label="Artist" required>
            <input
              type="text"
              required
              maxLength={200}
              value={form.artist}
              onChange={(e) => setForm({ ...form, artist: e.target.value })}
              className="w-full px-3 py-2.5 bg-stage-950 border border-stage-700 rounded-md focus:outline-none focus:border-spotlight transition-colors"
            />
          </Field>
          <Field label="Backing track URL (optional)">
            <input
              type="url"
              maxLength={2000}
              value={form.trackUrl}
              onChange={(e) => setForm({ ...form, trackUrl: e.target.value })}
              placeholder="https://…"
              className="w-full px-3 py-2.5 bg-stage-950 border border-stage-700 rounded-md focus:outline-none focus:border-spotlight transition-colors"
            />
          </Field>
          <Field label="Cover art URL (optional)">
            <input
              type="url"
              maxLength={2000}
              value={form.coverArtUrl}
              onChange={(e) => setForm({ ...form, coverArtUrl: e.target.value })}
              placeholder="https://…"
              className="w-full px-3 py-2.5 bg-stage-950 border border-stage-700 rounded-md focus:outline-none focus:border-spotlight transition-colors"
            />
          </Field>
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2.5 bg-spotlight text-white font-bold rounded-md hover:bg-spotlight-dim transition-colors disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Save song'}
          </button>
        </form>
      )}

      {loading ? (
        <TableRowsSkeleton rows={3} />
      ) : songs.length === 0 ? (
        <div className="text-center py-16 border-2 border-dashed border-stage-700 rounded-2xl">
          <p className="font-display text-2xl mb-2">No songs yet</p>
          <p className="text-haze">Create the first Centerstage Song to host battles.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {songs.map((s) => (
            <li
              key={s.id}
              className="bg-stage-900 border border-stage-700/60 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <p className="font-display font-bold text-lg">{s.title}</p>
                <p className="text-sm text-haze">{s.artist}</p>
                {s.currentChampionStreak > 0 && (
                  <p className="text-xs text-gold mt-1">
                    Defending Champion · streak {s.currentChampionStreak}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-[10px] uppercase tracking-widest font-bold ${
                    s.status === 'active' ? 'text-spotlight' : 'text-haze/60'
                  }`}
                >
                  {s.status}
                </span>
                <button
                  type="button"
                  onClick={() => toggleStatus(s)}
                  className="px-3 py-1.5 text-xs font-bold rounded-md bg-stage-800 border border-stage-700 hover:border-spotlight/40 transition-colors"
                >
                  {s.status === 'active' ? 'Retire' : 'Activate'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-widest font-bold text-haze mb-2">
        {label} {required && <span className="text-spotlight">*</span>}
      </label>
      {children}
    </div>
  );
}
