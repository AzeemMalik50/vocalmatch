'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import Nav from './Nav';
import { StageLoader } from './Loaders';
import { useAuth } from '@/lib/auth-context';

interface Props {
  children: ReactNode;
}

const TABS: { href: string; label: string }[] = [
  { href: '/admin', label: 'Backstage' },
  { href: '/admin/battles', label: 'Battles' },
  { href: '/admin/challenges', label: 'Red Phone' },
  { href: '/admin/champions', label: 'Champions' },
  { href: '/admin/songs', label: 'Songs' },
  { href: '/admin/performances', label: 'Performances' },
  { href: '/admin/users', label: 'People' },
  { href: '/admin/legal', label: 'Legal' },
];

/**
 * Wraps every /admin/* page. Gates access on `user.isAdmin` — the server
 * still enforces this via AdminGuard, but redirecting non-admins client-side
 * avoids a confusing flash of an empty admin page.
 */
export default function AdminShell({ children }: Props) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname || '/admin')}`);
      return;
    }
    if (!user.isAdmin) {
      router.replace('/');
      return;
    }
    setAuthChecked(true);
  }, [user, loading, pathname, router]);

  if (!authChecked) {
    return (
      <>
        <Nav />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <StageLoader message="Checking admin access…" />
        </main>
      </>
    );
  }

  return (
    <>
      <Nav />
      <div className="border-b border-stage-700/60 bg-stage-900/40">
        {/* Bug #33 — the Nav already shows an "Admin" link for admin
            users on desktop, so rendering a second "Admin" eyebrow here
            doubled up the label. The tab strip below is self-evidently
            the admin surface. */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {TABS.map((tab) => {
              const active =
                pathname === tab.href ||
                (tab.href !== '/admin' && pathname?.startsWith(tab.href));
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                    active
                      ? 'bg-spotlight text-white'
                      : 'text-haze hover:text-white hover:bg-stage-800'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">{children}</main>
    </>
  );
}
