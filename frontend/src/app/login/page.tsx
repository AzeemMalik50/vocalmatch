'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { Button, Field, TextInput } from '@/components/forms';
import { useAuth } from '@/lib/auth-context';

/**
 * Pick a safe redirect target from `?next=`. Restricts to same-origin paths
 * (must start with "/" and not "//") so a malicious next= cannot send the
 * user to an external site.
 */
function safeNext(next: string | null): string {
  if (!next) return '/';
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}

/**
 * Next.js 14 requires useSearchParams() to be inside a <Suspense> boundary
 * for static prerendering to succeed — otherwise the build bails on /login.
 * The outer page mounts a thin Suspense wrapper; the form lives in the
 * inner component so it can read the param safely.
 */
export default function LoginPage() {
  return (
    <>
      <Nav />
      <main className="relative z-10 max-w-md mx-auto px-6 py-16 md:py-20">
        <div className="text-center mb-10">
          <p className="text-xs uppercase tracking-[0.3em] text-haze/60 mb-3">
            Welcome back
          </p>
          <h1 className="font-display text-4xl md:text-5xl font-bold">
            Step <span className="text-spotlight italic">back</span> on stage.
          </h1>
        </div>

        <Suspense fallback={<LoginFormSkeleton />}>
          <LoginForm />
        </Suspense>
      </main>
    </>
  );
}

function LoginForm() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNext(searchParams?.get('next') ?? null);
  // `identifier` is either an email OR a username — the backend looks
  // the user up against both columns. Keeping the variable named for
  // its UX semantics, even though the auth-context API still passes
  // it via the legacy `email` parameter name.
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(identifier, password);
      router.push(next);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <form onSubmit={submit} className="space-y-5">
        <Field label="Email or username">
          {/* type=text (was type=email) so the browser's native
              "Please include an @" validation doesn't reject usernames.
              autoComplete="username" lets password managers autofill
              both email- and username-style identifiers. */}
          <TextInput
            type="text"
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="username"
            placeholder="you@example.com or @username"
          />
        </Field>

        <Field label="Password">
          <div className="relative">
            <TextInput
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs uppercase tracking-widest font-bold text-haze/60 hover:text-spotlight transition-colors"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </Field>

        {err && (
          <div className="text-sm text-red-300 bg-red-950/40 border border-red-900/40 rounded-md px-4 py-3">
            {err}
          </div>
        )}

        <Button type="submit" size="lg" fullWidth loading={loading}>
          Sign in →
        </Button>
      </form>

      <p className="mt-8 text-center text-sm text-haze">
        New to the stage?{' '}
        <Link
          href={next === '/' ? '/signup' : `/signup?next=${encodeURIComponent(next)}`}
          className="text-spotlight font-bold hover:text-white transition-colors"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}

function LoginFormSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-12 bg-stage-900 border border-stage-700 rounded-md" />
      <div className="h-12 bg-stage-900 border border-stage-700 rounded-md" />
      <div className="h-12 bg-stage-800 rounded-md" />
    </div>
  );
}
