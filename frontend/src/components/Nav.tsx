'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';

export default function Nav() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();

  return (
    <header className="relative z-10 border-b-2 border-ink">
      <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link href="/" className="font-display text-3xl font-bold tracking-tight">
          Vocal<span className="text-accent">·</span>Match
        </Link>

        <nav className="flex items-center gap-3 text-sm">
          {loading ? null : user ? (
            <>
              <Link
                href="/upload"
                className="px-4 py-2 bg-ink text-paper font-semibold hover:bg-accent transition-colors"
              >
                Upload
              </Link>
              <span className="hidden sm:inline font-medium">
                @{user.username}
              </span>
              <button
                onClick={() => {
                  logout();
                  router.push('/');
                }}
                className="px-3 py-2 border-2 border-ink font-semibold hover:bg-ink hover:text-paper transition-colors"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-3 py-2 font-semibold hover:text-accent transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="px-4 py-2 bg-ink text-paper font-semibold hover:bg-accent transition-colors"
              >
                Join
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
