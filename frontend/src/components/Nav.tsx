'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import Logo from './Logo';
import NotificationBell from './NotificationBell';

export default function Nav() {
  const { user, logout, loading } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click OR Escape — keyboard users need a way out
  // of the disclosure menu without grabbing the mouse.
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 border-b border-stage-700/60 backdrop-blur-md bg-stage-950/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
        <Link href="/" className="hover:opacity-90 transition-opacity shrink-0">
          <Logo />
        </Link>

        <nav className="flex items-center gap-1.5 sm:gap-3 text-sm shrink-0">
          {loading ? null : user ? (
            <>
              <NotificationBell />
              {/* Bug #40 (new) — Admin link was `hidden md:inline-flex`
                  so it disappeared on iPhone portrait. It now renders in
                  every orientation; padding tightens on narrow widths
                  so the row still fits. */}
              {user.isAdmin && (
                <Link
                  href="/admin"
                  className="inline-flex items-center px-2 sm:px-3 py-2 text-spotlight font-bold hover:opacity-90 transition-opacity uppercase tracking-widest text-xs whitespace-nowrap"
                  title="Admin dashboard"
                >
                  Admin
                </Link>
              )}
              {/* Upload is a singer action — admins don't have a singer surface,
                  so we hide the prominent CTA for them.
                  Bug #31 — previously the whole button was hidden on
                  portrait iPhone (`hidden sm:inline-flex`). It now stays
                  visible everywhere; the "Upload" label collapses to
                  an icon-only button below the sm breakpoint. */}
              {!user.isAdmin && (
                <Link
                  href="/upload"
                  aria-label="Upload performance"
                  className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 bg-spotlight text-white font-bold hover:bg-spotlight-dim transition-colors rounded-md shadow-lg shadow-spotlight/20 whitespace-nowrap"
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <path d="M7 1v12M1 7h12" stroke="white" strokeWidth="2" />
                  </svg>
                  <span className="hidden sm:inline">Upload</span>
                </Link>
              )}

              {/* Avatar menu */}
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label={`Account menu for @${user.username}`}
                  className="flex items-center gap-2 p-1 pr-3 rounded-full border border-stage-700 hover:border-spotlight/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spotlight focus-visible:ring-offset-2 focus-visible:ring-offset-stage-950 transition-colors"
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
                  <div
                    role="menu"
                    aria-label="Account"
                    className="absolute right-0 top-full mt-2 w-56 bg-stage-900 border border-stage-700 rounded-xl shadow-2xl overflow-hidden"
                  >
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
                    {!user.isAdmin && (
                      <Link
                        href="/upload"
                        onClick={() => setMenuOpen(false)}
                        className="sm:hidden block px-4 py-3 text-sm font-semibold hover:bg-stage-800 transition-colors"
                      >
                        Upload performance
                      </Link>
                    )}
                    {/* Admin link removed from the dropdown — the top-bar
                        Admin link is now always visible (bug #40), so this
                        duplicate would just be clutter. */}
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
                className="px-2 sm:px-3 py-2 text-haze hover:text-white font-medium transition-colors whitespace-nowrap"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="sm:hidden px-3 py-2 bg-spotlight text-white font-bold hover:bg-spotlight-dim transition-colors rounded-md shadow-lg shadow-spotlight/20 whitespace-nowrap"
              >
                Join
              </Link>
              <Link
                href="/signup"
                className="hidden sm:inline-flex items-center px-4 py-2 bg-spotlight text-white font-bold hover:bg-spotlight-dim transition-colors rounded-md shadow-lg shadow-spotlight/20 whitespace-nowrap"
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
