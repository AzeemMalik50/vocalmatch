'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Nav from '@/components/Nav';
import Logo from '@/components/Logo';
import { Button, Field, StepIndicator, TextInput } from '@/components/forms';
import { useAuth } from '@/lib/auth-context';

export default function SignupPage() {
  const { signup } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Live username validation
  const usernameValid =
    username.length >= 3 && /^[a-zA-Z0-9_.\-]+$/.test(username);
  const usernameTouched = username.length > 0;
  const usernameError =
    usernameTouched && !usernameValid
      ? 'Letters, numbers, _ . - only — minimum 3 characters'
      : undefined;

  // Password strength visualization
  const passwordStrength = (() => {
    if (password.length === 0) return null;
    if (password.length < 6) return { level: 1, label: 'Too short' };
    if (password.length < 10) return { level: 2, label: 'Could be stronger' };
    if (password.length < 14 || !/[A-Z]/.test(password) || !/[0-9]/.test(password))
      return { level: 3, label: 'Good' };
    return { level: 4, label: 'Strong' };
  })();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!usernameValid) {
      setErr('Pick a valid username first.');
      return;
    }
    setLoading(true);
    try {
      await signup(email, username, password);
      router.push('/onboarding');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Nav />
      <main className="relative z-10 max-w-md mx-auto px-6 py-12 md:py-16">
        <div className="mb-10">
          <StepIndicator
            total={2}
            current={1}
            labels={['Account', 'Profile']}
          />
        </div>

        <div className="text-center mb-10">
          <p className="text-xs uppercase tracking-[0.3em] text-haze/60 mb-3">
            Create your account
          </p>
          <h1 className="font-display text-4xl md:text-5xl font-bold leading-tight">
            Find your <span className="text-spotlight italic">voice</span>.
          </h1>
          <p className="mt-4 text-sm text-haze">
            Two minutes. Then you're on the stage.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-5">
          <Field
            label="Stage name"
            hint="This is your @handle. Make it memorable."
            error={usernameError}
          >
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-haze/60 font-bold pointer-events-none">
                @
              </span>
              <TextInput
                type="text"
                required
                minLength={3}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="pl-9"
                autoComplete="username"
                placeholder="your_handle"
                pattern="[a-zA-Z0-9_.\-]+"
              />
              {usernameTouched && usernameValid && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-spotlight">
                  ✓
                </span>
              )}
            </div>
          </Field>

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

          <Field label="Password" hint="At least 6 characters">
            <div className="relative">
              <TextInput
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
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

            {passwordStrength && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 flex gap-1">
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-all ${
                        i <= passwordStrength.level
                          ? passwordStrength.level <= 1
                            ? 'bg-red-500'
                            : passwordStrength.level === 2
                            ? 'bg-orange-400'
                            : passwordStrength.level === 3
                            ? 'bg-yellow-400'
                            : 'bg-green-400'
                          : 'bg-stage-700'
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs text-haze/70 tabular w-32 text-right">
                  {passwordStrength.label}
                </span>
              </div>
            )}
          </Field>

          {err && (
            <div className="text-sm text-red-300 bg-red-950/40 border border-red-900/40 rounded-md px-4 py-3">
              {err}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            fullWidth
            loading={loading}
          >
            Continue →
          </Button>
        </form>

        <p className="mt-8 text-center text-sm text-haze">
          Already have an account?{' '}
          <Link
            href="/login"
            className="text-spotlight font-bold hover:text-white transition-colors"
          >
            Sign in
          </Link>
        </p>

        <p className="mt-12 text-center text-xs text-haze/40 leading-relaxed">
          By signing up you agree to bring your best — fair voting, original
          performances, no harassment. We're building this together.
        </p>
      </main>
    </>
  );
}
