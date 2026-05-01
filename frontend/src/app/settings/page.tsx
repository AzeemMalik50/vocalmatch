'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Footer from '@/components/Footer';
import AvatarUpload from '@/components/AvatarUpload';
import {
  Button,
  ChipGroup,
  Field,
  Select,
  TextArea,
  TextInput,
} from '@/components/forms';
import { useAuth } from '@/lib/auth-context';
import {
  api,
  GENRE_OPTIONS,
  PublicUser,
  VoiceType,
  VOICE_TYPE_LABELS,
} from '@/lib/api';

const VOICE_OPTIONS = [
  { value: '', label: 'Not specified' },
  ...(Object.keys(VOICE_TYPE_LABELS) as VoiceType[]).map((v) => ({
    value: v,
    label: VOICE_TYPE_LABELS[v],
  })),
];

export default function SettingsPage() {
  const { user, loading: authLoading, patchUser, logout } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile fields
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [voiceType, setVoiceType] = useState<VoiceType | ''>('');
  const [genres, setGenres] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [instagram, setInstagram] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [youtube, setYoutube] = useState('');
  const [website, setWebsite] = useState('');
  const [privateProfile, setPrivateProfile] = useState(false);
  const [hideStats, setHideStats] = useState(false);

  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await api.me();
        if (cancelled) return;
        setProfile(me);
        setDisplayName(me.displayName ?? '');
        setBio(me.bio ?? '');
        setVoiceType((me.voiceType ?? '') as VoiceType | '');
        setGenres(me.genres ?? []);
        setLocation(me.location ?? '');
        setInstagram(me.instagramHandle ?? '');
        setTiktok(me.tiktokHandle ?? '');
        setYoutube(me.youtubeChannel ?? '');
        setWebsite(me.websiteUrl ?? '');
        setPrivateProfile(!!me.privateProfile);
        setHideStats(!!me.hideStatsUntilFirstBattle);
      } catch (e: any) {
        setErr(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setSaving(true);
    try {
      const updated = await api.updateProfile({
        displayName,
        bio,
        voiceType: (voiceType || null) as VoiceType | null,
        genres,
        location,
        instagramHandle: instagram,
        tiktokHandle: tiktok,
        youtubeChannel: youtube,
        websiteUrl: website,
        privateProfile,
        hideStatsUntilFirstBattle: hideStats,
      });
      setProfile(updated);
      patchUser({ profileCompleted: true });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2400);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (authLoading || loading || !user || !profile) {
    return (
      <>
        <Nav />
        <main className="max-w-2xl mx-auto px-6 py-16 text-haze/60">
          Loading settings…
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <main className="relative z-10 max-w-2xl mx-auto px-6 py-12 md:py-16">
        <div className="mb-10">
          <p className="text-xs uppercase tracking-[0.3em] text-haze/60 mb-3">
            Settings
          </p>
          <h1 className="font-display text-4xl md:text-5xl font-bold">
            Your <span className="text-spotlight italic">stage profile</span>
          </h1>
          <Link
            href={`/u/${user.username}`}
            className="inline-block mt-4 text-sm text-spotlight font-bold hover:text-white transition-colors"
          >
            View public profile →
          </Link>
        </div>

        <form onSubmit={submit} className="space-y-10">
          {/* Avatar */}
          <Section title="Profile photo">
            <div className="flex justify-center py-2">
              <AvatarUpload
                currentUrl={profile.avatarUrl}
                username={user.username}
                onUploaded={(url) => {
                  setProfile({ ...profile, avatarUrl: url });
                  patchUser({ avatarUrl: url });
                }}
              />
            </div>
          </Section>

          {/* Identity */}
          <Section
            title="Identity"
            subtitle="What people see first when your name comes up."
          >
            <Field label="Display name" optional>
              <TextInput
                maxLength={80}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={`e.g. ${user.username}`}
              />
            </Field>
            <Field
              label="Bio"
              hint="Two sentences. What's your voice about?"
              optional
            >
              <TextArea
                rows={3}
                maxLength={280}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                showCount
                placeholder="Tell people what your voice is about."
              />
            </Field>
            <Field label="Location" optional>
              <TextInput
                maxLength={120}
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City, country"
              />
            </Field>
          </Section>

          {/* Singer profile */}
          <Section
            title="Singer profile"
            subtitle="Helps the Main Stage match you with the right battles."
          >
            <Field label="Voice type" optional>
              <Select
                value={voiceType}
                onChange={(v) => setVoiceType(v as VoiceType | '')}
                options={VOICE_OPTIONS}
              />
            </Field>
            <Field
              label="Genres"
              hint={`${genres.length}/4 selected — pick what you sing most.`}
              optional
            >
              <ChipGroup
                options={GENRE_OPTIONS}
                selected={genres}
                onChange={setGenres}
                max={4}
              />
            </Field>
          </Section>

          {/* Social */}
          <Section
            title="Where else can people find you?"
            subtitle="Add the platforms you use. We'll link them on your profile."
          >
            <Field label="Instagram handle" optional>
              <PrefixInput
                prefix="@"
                value={instagram}
                onChange={setInstagram}
                placeholder="your_handle"
                maxLength={60}
              />
            </Field>
            <Field label="TikTok handle" optional>
              <PrefixInput
                prefix="@"
                value={tiktok}
                onChange={setTiktok}
                placeholder="your_handle"
                maxLength={60}
              />
            </Field>
            <Field label="YouTube channel" optional>
              <TextInput
                value={youtube}
                onChange={(e) => setYoutube(e.target.value)}
                placeholder="@channel or full URL"
                maxLength={120}
              />
            </Field>
            <Field label="Website" optional>
              <TextInput
                type="url"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                placeholder="https://your-site.com"
                maxLength={200}
              />
            </Field>
          </Section>

          {/* Privacy */}
          <Section
            title="Privacy"
            subtitle="Control how your profile appears to others."
          >
            <ToggleRow
              label="Private profile"
              hint="Only you can view your profile page. Your videos still appear on the public feed unless marked private individually."
              value={privateProfile}
              onChange={setPrivateProfile}
            />
            <ToggleRow
              label="Hide stats until first battle"
              hint="Battles, wins, streak — hidden from your public profile until you're matched into one."
              value={hideStats}
              onChange={setHideStats}
            />
          </Section>

          {err && (
            <div className="text-sm text-red-300 bg-red-950/40 border border-red-900/40 rounded-md px-4 py-3">
              {err}
            </div>
          )}

          <div className="sticky bottom-4 z-20 flex items-center justify-between gap-4 p-4 bg-stage-900/95 backdrop-blur-md border border-stage-700 rounded-xl shadow-2xl">
            <p className="text-sm text-haze">
              {savedFlash ? (
                <span className="text-spotlight font-bold">✓ Saved</span>
              ) : (
                'Changes are private until you save.'
              )}
            </p>
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
          </div>
        </form>

        {/* Account section — separate forms (each requires current password) */}
        <div className="mt-16 space-y-10">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-haze/60 mb-3">
              Account
            </p>
            <h2 className="font-display text-3xl font-bold">
              Sign-in &amp; security
            </h2>
          </div>

          <ChangeEmailSection
            currentEmail={user.email}
            onUpdated={(email) => patchUser({ email })}
          />
          <ChangePasswordSection
            onTokenRotated={(token) => {
              localStorage.setItem('vm_token', token);
            }}
          />
          <SignOutEverywhereSection
            onTokenRotated={(token) => {
              localStorage.setItem('vm_token', token);
            }}
          />
          <DeleteAccountSection
            onDeleted={() => {
              logout();
              router.push('/');
            }}
          />
        </div>
      </main>
      <Footer />
    </>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-stage-900/40 border border-stage-700/40 rounded-2xl p-6 md:p-8">
      <div className="mb-5">
        <h2 className="font-display text-xl font-bold">{title}</h2>
        {subtitle && (
          <p className="text-sm text-haze/70 mt-1">{subtitle}</p>
        )}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function PrefixInput({
  prefix,
  value,
  onChange,
  placeholder,
  maxLength,
}: {
  prefix: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <div className="relative">
      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-haze/60 font-bold pointer-events-none">
        {prefix}
      </span>
      <TextInput
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/^@/, ''))}
        placeholder={placeholder}
        maxLength={maxLength}
        className="pl-9"
      />
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-4 py-2">
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`shrink-0 mt-0.5 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          value ? 'bg-spotlight' : 'bg-stage-700'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
            value ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
      <div>
        <p className="font-bold text-sm">{label}</p>
        {hint && <p className="text-xs text-haze/70 mt-1 leading-relaxed">{hint}</p>}
      </div>
    </div>
  );
}

function ChangeEmailSection({
  currentEmail,
  onUpdated,
}: {
  currentEmail: string;
  onUpdated: (email: string) => void;
}) {
  const [newEmail, setNewEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.changeEmail({
        newEmail,
        currentPassword: pwd,
      });
      onUpdated(res.email);
      setNewEmail('');
      setPwd('');
      setMsg({ kind: 'ok', text: 'Email updated.' });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Change email"
      subtitle={`Currently signed in as ${currentEmail || 'your account'}.`}
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label="New email">
          <TextInput
            type="email"
            required
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="you@new-domain.com"
          />
        </Field>
        <Field label="Current password">
          <TextInput
            type="password"
            required
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <FormResult msg={msg} />
        <Button type="submit" loading={busy}>
          Update email
        </Button>
      </form>
    </Section>
  );
}

function ChangePasswordSection({
  onTokenRotated,
}: {
  onTokenRotated: (token: string) => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const { token } = await api.changePassword({
        currentPassword: current,
        newPassword: next,
      });
      onTokenRotated(token);
      setCurrent('');
      setNext('');
      setMsg({
        kind: 'ok',
        text: 'Password changed. All other sessions were signed out.',
      });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Change password"
      subtitle="Other devices will be signed out for safety."
    >
      <form onSubmit={submit} className="space-y-5">
        <Field label="Current password">
          <TextInput
            type="password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
          />
        </Field>
        <Field label="New password" hint="At least 6 characters.">
          <TextInput
            type="password"
            required
            minLength={6}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <FormResult msg={msg} />
        <Button type="submit" loading={busy}>
          Update password
        </Button>
      </form>
    </Section>
  );
}

function SignOutEverywhereSection({
  onTokenRotated,
}: {
  onTokenRotated: (token: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const click = async () => {
    if (
      !window.confirm(
        'Sign out everywhere except this device? You will stay signed in here.',
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      const { token } = await api.signOutEverywhere();
      onTokenRotated(token);
      setMsg({ kind: 'ok', text: 'Other sessions signed out.' });
    } catch (e: any) {
      setMsg({ kind: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Sign out everywhere else"
      subtitle="Useful if you've signed in on a shared computer or lost a device."
    >
      <FormResult msg={msg} />
      <Button type="button" variant="secondary" loading={busy} onClick={click}>
        Sign out other sessions
      </Button>
    </Section>
  );
}

function DeleteAccountSection({ onDeleted }: { onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [pwd, setPwd] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmText !== 'DELETE') {
      setErr('Type DELETE to confirm.');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await api.deleteAccount({ currentPassword: pwd });
      onDeleted();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="bg-red-950/20 border border-red-900/40 rounded-2xl p-6 md:p-8">
      <div className="mb-5">
        <h2 className="font-display text-xl font-bold text-red-300">
          Delete account
        </h2>
        <p className="text-sm text-red-200/70 mt-1">
          Permanently remove your profile and all uploaded performances. This
          cannot be undone.
        </p>
      </div>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-5 py-3 text-sm font-bold border border-red-900/60 text-red-300 hover:bg-red-950/40 rounded-md transition-colors"
        >
          I want to delete my account
        </button>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <Field label="Current password">
            <TextInput
              type="password"
              required
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              autoComplete="current-password"
            />
          </Field>
          <Field label="Type DELETE to confirm" hint="Case-sensitive.">
            <TextInput
              required
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
            />
          </Field>
          {err && (
            <p className="text-sm text-red-300 bg-red-950/40 border border-red-900/40 rounded-md px-4 py-3">
              {err}
            </p>
          )}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="px-5 py-3 text-sm font-bold bg-red-600 hover:bg-red-500 text-white rounded-md disabled:opacity-50"
            >
              {busy ? 'Deleting…' : 'Permanently delete account'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setErr(null);
              }}
              className="text-sm font-bold text-haze hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

function FormResult({
  msg,
}: {
  msg: { kind: 'ok' | 'err'; text: string } | null;
}) {
  if (!msg) return null;
  return msg.kind === 'ok' ? (
    <p className="text-sm text-spotlight font-bold">✓ {msg.text}</p>
  ) : (
    <p className="text-sm text-red-300 bg-red-950/40 border border-red-900/40 rounded-md px-4 py-3">
      {msg.text}
    </p>
  );
}
