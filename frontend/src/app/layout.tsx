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

// Runs before React hydrates to set the right theme class on <html>.
// Prevents a flash of the wrong palette on first paint.
const themeBootstrap = `
(function(){try{
  var s=localStorage.getItem('vm_theme');
  var t = s==='light'||s==='dark' ? s
    : (window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  if(t==='light') document.documentElement.classList.add('theme-light');
  document.documentElement.style.colorScheme = t;
}catch(e){}})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
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
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="stage-bg vignette min-h-screen">
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
