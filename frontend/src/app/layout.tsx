import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Allura, Bebas_Neue, Inter } from 'next/font/google';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-context';
import { ConfirmProvider } from '@/lib/confirm-context';
import ScrollResetOnReload from '@/components/ScrollResetOnReload';

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, '') ||
  'https://vocalmatch.app';

// Phase 3 typography — self-hosted via next/font, so the browser no
// longer makes a render-blocking request to Google Fonts. Each face
// writes into the CSS variable already consumed by globals.css and
// tailwind.config.js, so nothing else has to change.
const bebasNeue = Bebas_Neue({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-display',
  display: 'swap',
});

const allura = Allura({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-script',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

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
        width: 1536,
        height: 1536,
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

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
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
    // entire tree. The font className list injects next/font CSS vars
    // (--font-display, --font-script, --font-sans) at the html level so
    // Tailwind + globals.css pick them up automatically.
    <html
      lang="en"
      style={{ colorScheme: 'dark' }}
      className={`${bebasNeue.variable} ${allura.variable} ${inter.variable}`}
    >
      <body className="vm-force-dark stage-bg vignette min-h-screen">
        <ScrollResetOnReload />
        <ThemeProvider>
          <AuthProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
