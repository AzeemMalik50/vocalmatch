'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { useAuth } from '@/lib/auth-context';

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      <main className="relative z-10 max-w-md mx-auto px-6 py-16">
        <h1 className="font-display text-5xl font-bold mb-2">Welcome back.</h1>
        <p className="opacity-70 mb-8">Sign in to cast your votes.</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2 font-semibold">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-paper border-2 border-ink focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2 font-semibold">
              Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-paper border-2 border-ink focus:outline-none focus:border-accent"
            />
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full px-4 py-3 bg-ink text-paper font-bold hover:bg-accent transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in →'}
          </button>
        </form>

        <p className="mt-6 text-sm opacity-70">
          New here?{' '}
          <Link href="/signup" className="underline font-semibold hover:text-accent">
            Create an account
          </Link>
        </p>
      </main>
    </>
  );
}
