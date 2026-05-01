'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Nav from '@/components/Nav';
import AvatarUpload from '@/components/AvatarUpload';
import {
  Button,
  ChipGroup,
  Field,
  Select,
  StepIndicator,
  TextArea,
  TextInput,
} from '@/components/forms';
import { useAuth } from '@/lib/auth-context';
import {
  api,
  GENRE_OPTIONS,
  VoiceType,
  VOICE_TYPE_LABELS,
} from '@/lib/api';

const VOICE_OPTIONS: { value: VoiceType; label: string }[] = (
  Object.keys(VOICE_TYPE_LABELS) as VoiceType[]
).map((v) => ({ value: v, label: VOICE_TYPE_LABELS[v] }));

export default function OnboardingPage() {
  const { user, loading: authLoading, patchUser } = useAuth();
  const router = useRouter();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [voiceType, setVoiceType] = useState<VoiceType | ''>('');
  const [genres, setGenres] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Route guard
  useEffect(() => {
    if (!authLoading && !user) router.replace('/signup');
  }, [authLoading, user, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSubmitting(true);
    try {
      await api.updateProfile({
        displayName: displayName || undefined,
        bio: bio || undefined,
        voiceType: voiceType || undefined,
        genres: genres.length ? genres : undefined,
        location: location || undefined,
      });
      patchUser({ avatarUrl, profileCompleted: true });
      router.push('/');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const skip = async () => {
    setSkipping(true);
    try {
      await api.skipOnboarding();
      patchUser({ profileCompleted: true });
      router.push('/');
    } catch (e: any) {
      setErr(e.message);
      setSkipping(false);
    }
  };

  if (authLoading || !user) {
    return (
      <>
        <Nav />
        <main className="max-w-md mx-auto px-6 py-16 text-haze/60">
          Loading…
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="relative z-10 max-w-2xl mx-auto px-6 py-12 md:py-16">
        <div className="mb-10">
          <StepIndicator
            total={2}
            current={2}
            labels={['Account', 'Profile']}
          />
        </div>

        <div className="mb-10">
          <p className="text-xs uppercase tracking-[0.3em] text-haze/60 mb-3">
            Build your stage presence
          </p>
          <h1 className="font-display text-4xl md:text-5xl font-bold leading-tight">
            Tell us how to <br />
            <span className="text-spotlight italic">introduce</span> you.
          </h1>
          <p className="mt-4 text-haze leading-relaxed max-w-lg">
            Voters and fellow performers see this. Each detail is optional —
            but full profiles get fairer Main Stage matchups (1v1, same song,
            voted in 24–48 hours).
          </p>
        </div>

        <form onSubmit={submit} className="space-y-8">
          {/* Avatar */}
          <div className="flex flex-col items-center py-8 bg-stage-900/40 border border-stage-700/40 rounded-2xl">
            <p className="text-xs uppercase tracking-widest text-haze/60 mb-5 font-bold">
              Profile photo
            </p>
            <AvatarUpload
              currentUrl={avatarUrl}
              username={user.username}
              onUploaded={(url) => setAvatarUrl(url)}
            />
            <p className="text-xs text-haze/50 mt-4 text-center max-w-xs">
              Square images work best. Faces get auto-centered.
            </p>
          </div>

          <Field
            label="Display name"
            hint='Your stage name (can differ from your @handle)'
            optional
          >
            <TextInput
              maxLength={80}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={`e.g. Maya R., or just @${user.username}`}
            />
          </Field>

          <Field
            label="Bio"
            hint="Two sentences about your voice and what you love to sing."
            optional
          >
            <TextArea
              rows={3}
              maxLength={280}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              showCount
              placeholder="Tell people what your voice is about — vibe, range, story."
            />
          </Field>

          <Field
            label="Voice type"
            hint="Helps the Main Stage match you with comparable performers."
            optional
          >
            <Select
              value={voiceType}
              onChange={(v) => setVoiceType(v as VoiceType)}
              placeholder="Select your range"
              options={[
                { value: '', label: 'Select your range' },
                ...VOICE_OPTIONS,
              ]}
            />
          </Field>

          <Field
            label="Genres"
            hint={`Pick up to 4. ${genres.length}/4 selected.`}
            optional
          >
            <ChipGroup
              options={GENRE_OPTIONS}
              selected={genres}
              onChange={setGenres}
              max={4}
            />
          </Field>

          <Field label="Location" hint="City, country. Helps build local scenes." optional>
            <TextInput
              maxLength={120}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Lahore, PK"
            />
          </Field>

          {err && (
            <div className="text-sm text-red-300 bg-red-950/40 border border-red-900/40 rounded-md px-4 py-3">
              {err}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-stage-700/40">
            <Button
              variant="ghost"
              onClick={skip}
              loading={skipping}
              disabled={submitting}
            >
              Skip for now
            </Button>
            <div className="flex-1" />
            <Button
              type="submit"
              size="lg"
              loading={submitting}
              disabled={skipping}
            >
              Save & take the stage →
            </Button>
          </div>
        </form>
      </main>
    </>
  );
}
