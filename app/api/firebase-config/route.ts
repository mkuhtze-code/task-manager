import { NextResponse } from 'next/server';
import { getFirebaseWebConfig } from '@/lib/fcm/config';

// Emits the public Firebase web configuration as a classic JavaScript file
// for the Service Worker. The SW cannot use Next's bundle-time env
// inlining, so it importScripts this route at install time. Returns a
// valid script in every case (null config when FCM is not configured), so
// a missing environment can never break the existing PWA service worker.
export const dynamic = 'force-dynamic';

export async function GET() {
  const config = getFirebaseWebConfig();
  const script = `self.DOKKIT_FIREBASE_CONFIG = ${JSON.stringify(config)};`;
  return new NextResponse(script, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}