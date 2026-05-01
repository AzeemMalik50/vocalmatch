'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-context';
import Logo from './Logo';

export default function Nav() {
  const { user, logout, loading } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 border-b border-stage-700/60 backdrop-blur-md bg-stage-950/80">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/" className="hover:opacity-90 transition-opacity">
          <Logo />
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3 text-sm">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'studio (light)' : 'stage (dark)'}`}
            className="w-9 h-9 inline-flex items-center justify-center rounded-full border border-stage-700 hover:border-spotlight/50 text-haze hover:text-white transition-colors"
          >
            {theme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
          </button>
          {loading ? null : user ? (
            <>
              <Link
                href="/upload"
                className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 bg-spotlight text-white font-bold hover:bg-spotlight-dim transition-colors rounded-md shadow-lg shadow-spotlight/20"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M7 1v12M1 7h12" stroke="white" strokeWidth="2" />
                </svg>
                Upload
              </Link>

              {/* Avatar menu */}
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen((o) => !o)}
                  className="flex items-center gap-2 p-1 pr-3 rounded-full border border-stage-700 hover:border-spotlight/50 transition-colors"
                >
                  <span className="w-8 h-8 rounded-full bg-stage-800 flex items-center justify-center overflow-hidden">
                    {user.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.avatarUrl}
                        alt={user.username}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-bold text-haze">
                        {user.username[0]?.toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span className="hidden sm:inline font-semibold text-haze">
                    @{user.username}
                  </span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    className={`text-haze transition-transform ${
                      menuOpen ? 'rotate-180' : ''
                    }`}
                  >
                    <path
                      d="M3 4.5l3 3 3-3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>

                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-stage-900 border border-stage-700 rounded-xl shadow-2xl overflow-hidden">
                    <Link
                      href={`/u/${user.username}`}
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-3 hover:bg-stage-800 transition-colors border-b border-stage-700/60"
                    >
                      <p className="text-xs uppercase tracking-widest text-haze/60 font-bold">
                        Public profile
                      </p>
                      <p className="text-sm font-semibold mt-0.5">
                        @{user.username}
                      </p>
                    </Link>
                    <Link
                      href="/upload"
                      onClick={() => setMenuOpen(false)}
                      className="sm:hidden block px-4 py-3 text-sm font-semibold hover:bg-stage-800 transition-colors"
                    >
                      Upload performance
                    </Link>
                    <Link
                      href="/settings"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-3 text-sm font-semibold hover:bg-stage-800 transition-colors"
                    >
                      Edit profile
                    </Link>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        logout();
                        router.push('/');
                      }}
                      className="w-full text-left px-4 py-3 text-sm font-semibold text-red-400 hover:bg-stage-800 hover:text-red-300 transition-colors border-t border-stage-700/60"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="px-3 py-2 text-haze hover:text-white font-medium transition-colors"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="px-4 py-2 bg-spotlight text-white font-bold hover:bg-spotlight-dim transition-colors rounded-md shadow-lg shadow-spotlight/20"
              >
                Join the Stage
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
