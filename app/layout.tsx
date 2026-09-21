import type { Metadata, Viewport } from 'next';
import AppChrome from '@/components/AppChrome';
import ErrorBoundary from '@/components/ErrorBoundary';
import './globals.css';
import './desktop-surface.css';
import './desktop-phase-2.css';

export const metadata: Metadata = {
  title: 'Dokkit',
  description: 'Dock it. Do it.',
  manifest: '/app/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Dokkit',
  },
  icons: {
    icon: '/app/icon-192.png',
    apple: '/app/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3EFE7' },
    { media: '(prefers-color-scheme: dark)', color: '#141414' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary>
          <AppChrome>{children}</AppChrome>
        </ErrorBoundary>
      </body>
    </html>
  );
}
