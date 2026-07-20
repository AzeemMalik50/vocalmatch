'use client';

import { FormEvent, useState } from 'react';
import Nav from '@/components/Nav';
import { api } from '@/lib/api';

/**
 * Public "YOUR SONG COULD BE NEXT" submission form.
 *
 * Spec: songwriters submit Song, Lyrics, and Contact info. Final song
 * selection always rests with VOCALMATCH — that language is on the
 * page so submitters understand the review model.
 *
 * Wired to POST /song-submissions on the backend, which queues the
 * submission for admin review.
 */

type Field = 'title' | 'songwriter' | 'lyrics' | 'contactName' | 'contactEmail' | 'notes';

const INITIAL: Record<Field, string> = {
  title: '',
  songwriter: '',
  lyrics: '',
  contactName: '',
  contactEmail: '',
  notes: '',
};

export default function SubmitSongPage() {
  const [values, setValues] = useState(INITIAL);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function setField(field: Field, value: string) {
    setValues((v) => ({ ...v, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function validate(): boolean {
    const next: Partial<Record<Field, string>> = {};
    if (!values.title.trim()) next.title = 'Song title is required.';
    if (!values.songwriter.trim()) next.songwriter = 'Songwriter name is required.';
    if (!values.lyrics.trim()) next.lyrics = 'Lyrics are required.';
    if (!values.contactName.trim()) next.contactName = 'Your name is required.';
    if (!values.contactEmail.trim()) {
      next.contactEmail = 'Contact email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contactEmail.trim())) {
      next.contactEmail = 'Enter a valid email address.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setServerError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await api.submitSong({
        title: values.title.trim(),
        songwriter: values.songwriter.trim(),
        lyrics: values.lyrics.trim(),
        contactName: values.contactName.trim(),
        contactEmail: values.contactEmail.trim(),
        notes: values.notes.trim() || undefined,
      });
      setSubmitted(true);
      setValues(INITIAL);
    } catch (err) {
      setServerError(
        err instanceof Error
          ? err.message
          : "Couldn't submit right now — please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10 md:py-16">
        <header className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[0.35em] text-spotlight font-black mb-3">
            Song Submission
          </p>
          <h1 className="font-display text-4xl md:text-6xl font-black text-white mb-3">
            Your Song Could Be Next
          </h1>
          <p className="text-base md:text-lg text-white/70 max-w-xl mx-auto">
            Selected songs may become future Centerstage Songs. Final song
            selection always rests with VOCALMATCH.
          </p>
        </header>

        {submitted ? (
          <div className="bg-card/60 border border-gold/50 rounded-2xl p-8 text-center">
            <p className="text-2xl font-black text-gold mb-2">
              Submission received.
            </p>
            <p className="text-white/80 mb-6">
              Thanks for sending your song in. Our team will review it and be
              in touch if it's selected.
            </p>
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="inline-flex items-center px-5 py-2.5 rounded-lg bg-spotlight hover:bg-spotlight-dim text-white text-xs font-black uppercase tracking-[0.2em] transition-colors"
            >
              Submit Another
            </button>
          </div>
        ) : (
          <form
            onSubmit={onSubmit}
            noValidate
            className="bg-card/50 backdrop-blur border border-stage-700 rounded-2xl p-6 md:p-8 space-y-6"
          >
            <FormField
              label="Song Title"
              required
              error={errors.title}
            >
              <input
                type="text"
                value={values.title}
                onChange={(e) => setField('title', e.target.value)}
                maxLength={120}
                className="w-full bg-black/40 border border-stage-700 focus:border-spotlight rounded-lg px-4 py-3 text-white placeholder-white/30 outline-none transition-colors"
                placeholder="e.g. Midnight Serenade"
              />
            </FormField>

            <FormField
              label="Songwriter"
              required
              error={errors.songwriter}
            >
              <input
                type="text"
                value={values.songwriter}
                onChange={(e) => setField('songwriter', e.target.value)}
                maxLength={120}
                className="w-full bg-black/40 border border-stage-700 focus:border-spotlight rounded-lg px-4 py-3 text-white placeholder-white/30 outline-none transition-colors"
                placeholder="Who wrote this song?"
              />
            </FormField>

            <FormField
              label="Lyrics"
              required
              error={errors.lyrics}
              hint="Paste the full lyrics."
            >
              <textarea
                value={values.lyrics}
                onChange={(e) => setField('lyrics', e.target.value)}
                maxLength={10_000}
                rows={10}
                className="w-full bg-black/40 border border-stage-700 focus:border-spotlight rounded-lg px-4 py-3 text-white placeholder-white/30 outline-none transition-colors font-mono text-sm resize-y"
                placeholder="Verse 1..."
              />
            </FormField>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FormField
                label="Your Name"
                required
                error={errors.contactName}
              >
                <input
                  type="text"
                  value={values.contactName}
                  onChange={(e) => setField('contactName', e.target.value)}
                  maxLength={120}
                  className="w-full bg-black/40 border border-stage-700 focus:border-spotlight rounded-lg px-4 py-3 text-white placeholder-white/30 outline-none transition-colors"
                  placeholder="Jane Doe"
                />
              </FormField>

              <FormField
                label="Contact Email"
                required
                error={errors.contactEmail}
              >
                <input
                  type="email"
                  value={values.contactEmail}
                  onChange={(e) => setField('contactEmail', e.target.value)}
                  maxLength={254}
                  className="w-full bg-black/40 border border-stage-700 focus:border-spotlight rounded-lg px-4 py-3 text-white placeholder-white/30 outline-none transition-colors"
                  placeholder="you@example.com"
                />
              </FormField>
            </div>

            <FormField
              label="Notes (optional)"
              hint="Anything else we should know."
            >
              <textarea
                value={values.notes}
                onChange={(e) => setField('notes', e.target.value)}
                maxLength={2000}
                rows={3}
                className="w-full bg-black/40 border border-stage-700 focus:border-spotlight rounded-lg px-4 py-3 text-white placeholder-white/30 outline-none transition-colors text-sm resize-y"
                placeholder="Genre, mood, backstory..."
              />
            </FormField>

            {serverError && (
              <p className="text-sm text-red-400" role="alert">
                {serverError}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center bg-spotlight hover:bg-spotlight-dim disabled:opacity-60 disabled:cursor-not-allowed text-white font-black uppercase tracking-[0.25em] text-sm py-4 rounded-lg transition-colors"
            >
              {submitting ? 'Submitting…' : 'Submit Song'}
            </button>
          </form>
        )}
      </main>
    </>
  );
}

function FormField({
  label,
  children,
  required,
  error,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  error?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-1 text-xs font-black uppercase tracking-[0.2em] text-white/80 mb-2">
        {label}
        {required && <span className="text-spotlight">*</span>}
      </span>
      {children}
      {hint && !error && (
        <span className="mt-1 block text-[11px] text-white/40">{hint}</span>
      )}
      {error && (
        <span className="mt-1 block text-[11px] text-red-400" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
