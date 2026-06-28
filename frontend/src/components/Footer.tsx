import Link from 'next/link';
import Logo from './Logo';

// Hard-coded slugs are intentional: the dynamic /legal/[slug] route serves
// any page in the DB, but the footer only links to the canonical set.
// Adding a 7th legal page would require touching this list — acceptable
// given legal pages change rarely.
const LEGAL_LINKS: { slug: string; label: string }[] = [
  { slug: 'terms', label: 'Terms of Service' },
  { slug: 'privacy', label: 'Privacy Policy' },
  { slug: 'dmca', label: 'Copyright' },
  { slug: 'competition-rules', label: 'Competition Rules' },
  { slug: 'community', label: 'Community Standards' },
  { slug: 'contact', label: 'Contact' },
];

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-stage-700/60 mt-24">
      <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div>
          <Logo size="sm" />
          <p className="mt-3 text-sm text-haze max-w-md">
            One song. Two voices. One crown. Two singers perform the same song;
            you decide who wins.
          </p>
        </div>
        <p className="text-[11px] uppercase tracking-[0.25em] text-spotlight/80 font-bold">
          Watch → Vote → Challenge
        </p>
      </div>
      <div className="border-t border-stage-700/40 py-6">
        <div className="max-w-7xl mx-auto px-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-haze/70">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.slug}
                href={`/legal/${link.slug}`}
                className="hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <p className="text-xs text-haze/40 tabular">
            © VOCALMATCH 2026. All Rights Reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
