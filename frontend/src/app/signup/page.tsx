'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { useAuth } from '@/lib/auth-context';

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await signup(email, username, password);
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
        <h1 className="font-display text-5xl font-bold mb-2">Join the feed.</h1>
        <p className="opacity-70 mb-8">One account. One vote per video.</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-widest mb-2 font-semibold">
              Username
            </label>
            <input
              type="text"
              required
              minLength={2}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 bg-paper border-2 border-ink focus:outline-none focus:border-accent"
            />
          </div>
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
              Password <span className="opacity-50">(6+ chars)</span>
            </label>
            <input
              type="password"
              required
              minLength={6}
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
            {loading ? 'Creating…' : 'Create account →'}
          </button>
        </form>

        <p className="mt-6 text-sm opacity-70">
          Already have an account?{' '}
          <Link href="/login" className="underline font-semibold hover:text-accent">
            Sign in
          </Link>
        </p>
      </main>
    </>
  );
}
