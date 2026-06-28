// frontend/src/app/reset-password/page.tsx
'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import { StageLoader } from '@/components/Loaders';
import { Button, Field, TextInput } from '@/components/forms';
import { api } from '@/lib/api';

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <>
          <Nav />
          <main className="max-w-md mx-auto px-6 py-12">
            <StageLoader message="Loading..." />
          </main>
        </>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params?.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!token) {
      setErr('Missing reset token. Use the link from your email.');
      return;
    }
    if (newPassword.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErr('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword({ token, newPassword });
      router.push('/login?reset=1');
    } catch (e: any) {
      setErr(e?.message ?? 'Reset failed. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Nav />
      <main className="max-w-md mx-auto px-6 py-12">
        <h1 className="text-3xl font-display text-white">Reset password</h1>
        <p className="mt-2 text-sm text-haze">Choose a new password.</p>

        <form onSubmit={submit} className="mt-6 space-y-4">
          {err && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-200 px-3 py-2 text-sm">
              {err}
            </div>
          )}
          <Field label="New password (8+ characters)">
            <TextInput
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
            />
          </Field>
          <Field label="Confirm new password">
            <TextInput
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </Field>
          <Button type="submit" disabled={loading || !token}>
            {loading ? 'Resetting...' : 'Reset password'}
          </Button>
          <p className="text-xs text-haze">
            <Link href="/login" className="text-spotlight hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      </main>
    </>
  );
}
