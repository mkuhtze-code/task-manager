import './globals.css';
import './desktop-surface.css';
import './desktop-phase-2.css';
import './desktop-heart.css';
import './desktop-legacy.css';
import './desktop-complete.css';
import './desktop-jobs-convergence.css';
import './desktop-settings.css';
import './error-boundary.css';
import './dokkit-splash.css';
import './observation-layout-fix.css';
import './dokkit-player.css';
import './job-mobile.css';
import './today-header.css';
import './ux-instrument.css';
import './ux-nav.css';
import './ux-surface-tabs.css';
import './pill-reveal.css';
import './travel-aware.css';
import './ux-world-class-instrument.css';
import './ux-capture-paper.css';
import DokkitSplash from '@/components/DokkitSplash';
import AppChrome from '@/components/AppChrome';
import AppProviders from '@/components/providers/AppProviders';

export const metadata = {
  title: 'Dokkit',
  description: 'A personal thinking tool that understands time',
  manifest: '/app/manifest.json',
  icons: {
    icon: [
      { url: '/app/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/app/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/app/android-chrome-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/app/android-chrome-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/app/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: ['/favicon.ico'],
  },
};

export const viewport = {
  themeColor: '#1E6BE6',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var stored = localStorage.getItem('dokkit-theme');
                  var resolved = stored;
                  if (!resolved || resolved === 'system') {
                    resolved = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
                      ? 'dark'
                      : 'light';
                  }
                  if (resolved === 'dark') {
                    document.documentElement.setAttribute('data-theme', 'dark');
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
  href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..800&family=JetBrains+Mono:wght@500;600&family=Space+Mono:wght@400;700&display=swap"
  rel="stylesheet"
/>
      </head>
      <body>
        <DokkitSplash />
        <AppProviders>
          <AppChrome>{children}</AppChrome>
        </AppProviders>
      </body>
    </html>
  );
}
