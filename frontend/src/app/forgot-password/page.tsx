// frontend/src/app/forgot-password/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { Button, Field, TextInput } from '@/components/forms';
import { api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      await api.forgotPassword({ email: email.trim().toLowerCase() });
      setSubmitted(true);
    } catch (e: any) {
      setErr(e?.message ?? 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Nav />
      <main className="max-w-md mx-auto px-6 py-12">
        <h1 className="text-3xl font-display text-white">Forgot password</h1>
        <p className="mt-2 text-sm text-haze">
          Enter your email and we&apos;ll send a link to reset your password.
        </p>

        {submitted ? (
          <div className="mt-6 rounded-md border border-stage-700/60 bg-stage-900/40 px-4 py-4 text-sm text-haze">
            If your email is registered, we&apos;ve sent a link to reset your
            password. Check your inbox (and spam folder). The link expires in
            1 hour.
            <p className="mt-3">
              <Link href="/login" className="text-spotlight hover:underline">
                Back to sign in
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {err && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-200 px-3 py-2 text-sm">
                {err}
              </div>
            )}
            <Field label="Email">
              <TextInput
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </Field>
            <Button type="submit" disabled={loading || !email}>
              {loading ? 'Sending...' : 'Send reset link'}
            </Button>
            <p className="text-xs text-haze">
              <Link href="/login" className="text-spotlight hover:underline">
                Back to sign in
              </Link>
            </p>
          </form>
        )}
      </main>
    </>
  );
}
