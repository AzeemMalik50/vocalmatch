import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-context';

export const metadata: Metadata = {
  title: 'VocalMatch — One Song. Two Voices. One Crown.',
  description:
    'A continuous competition for vocal performance. Watch, vote, challenge — claim the crown.',
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
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,800;9..144,900&family=Inter:wght@400;500;600;700&display=swap"
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
