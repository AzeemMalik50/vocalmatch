import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-context';

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ||
  'https://vocalmatch.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'VocalMatch — One Song. Two Voices. One Crown.',
    template: '%s · VocalMatch',
  },
  description:
    'A continuous competition for vocal performance. Watch, vote, challenge — claim the crown.',
  openGraph: {
    type: 'website',
    siteName: 'VocalMatch',
    title: 'VocalMatch — One Song. Two Voices. One Crown.',
    description:
      'Two singers, same song. The audience decides who owns it. The winner becomes the Official Voice... until someone takes the crown.',
    images: [
      {
        url: '/hero/main-hero.jpg',
        width: 1024,
        height: 1024,
        alt: 'Official Voice and Challenger facing off, fire and crowd between them',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VocalMatch — One Song. Two Voices. One Crown.',
    description:
      'Two singers, same song. The audience decides who owns it.',
    images: ['/hero/main-hero.jpg'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // VOCALMATCH is a cinematic dark-only brand surface. Pin the dark
    // palette globally — colorScheme on <html> tells the browser to use
    // dark chrome (form inputs, scrollbars, native autofill); .vm-force-dark
    // on <body> pins our design tokens to the Battlefield palette for the
    // entire tree. ThemeProvider stays for now in case a downstream
    // component needs `useTheme`; the toggle UI has been removed.
    <html lang="en" style={{ colorScheme: 'dark' }}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Phase 3 typography:
            Bebas Neue — cinematic condensed display, hero + section headlines
            Allura     — script accent ("Where Great Songs Live Again")
            Inter      — body text */}
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Allura&family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="vm-force-dark stage-bg vignette min-h-screen">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
