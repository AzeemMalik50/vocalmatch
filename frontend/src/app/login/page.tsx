'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { Button, Field, TextInput } from '@/components/forms';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await login(email, password);
      router.push('/');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

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

        <form onSubmit={submit} className="space-y-5">
          <Field label="Email">
            <TextInput
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
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
            href="/signup"
            className="text-spotlight font-bold hover:text-white transition-colors"
          >
            Create an account
          </Link>
        </p>
      </main>
    </>
  );
}
