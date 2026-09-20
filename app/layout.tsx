import './globals.css';
import './desktop-surface.css';
import './dokkit-splash.css';
import './observation-layout-fix.css';
import './dokkit-player.css';
import DokkitSplash from '@/components/DokkitSplash';
import AppChrome from '@/components/AppChrome';

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
        {/* Runs before first paint. Reads the stored theme choice —
            'light' | 'dark' | 'system' | null — and resolves it to an
            actual attribute. 'system' and null both defer to the OS
            preference; only 'dark' sets data-theme, since light mode
            is the unmarked default already in :root. */}
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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600&display=swap"
          rel="stylesheet"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }).then(function (reg) {
                    console.log('SW registered:', reg.scope);
                  }).catch(function (err) {
                    console.error('SW registration failed:', err);
                  });
                });
              }
            `,
          }}
        />
      </head>
      <body>
        <DokkitSplash />
        <AppChrome>{children}</AppChrome>
      </body>
    </html>
  );
}
