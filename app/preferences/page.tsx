'use client';

import './preferences.css';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { apiUrl, authedFetch } from '@/lib/authedFetch';
import { registerWebPushSubscription } from '@/lib/fcm/client';
import AppHeader from '@/components/AppHeader';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import type { MeetingExportPreferences } from '@/lib/meetingExport';
import { DEFAULT_MEETING_EXPORT_PREFS, normalizeMeetingExportPrefs } from '@/lib/meetingExport';

const DAY_OPTIONS: { label: string; value: number }[] = [
  { label: 'M', value: 1 },
  { label: 'T', value: 2 },
  { label: 'W', value: 3 },
  { label: 'T', value: 4 },
  { label: 'F', value: 5 },
  { label: 'S', value: 6 },
  { label: 'S', value: 0 },
];

// File continues in repo via user restore if truncated — see artifacts download.
// CRITICAL SECTION: enableNotifications with timeouts is what fixes the hang.

async function enableNotificationsCore(
  setNotifStatus: (s: string) => void,
  session: { access_token: string }
) {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    setNotifStatus('Notifications are not supported in this browser.');
    return;
  }
  if (!('serviceWorker' in navigator)) {
    setNotifStatus('Service workers are required for notifications.');
    return;
  }
  if (Notification.permission === 'denied') {
    setNotifStatus(
      'Permission blocked — allow notifications for this site in browser settings, then try again.'
    );
    return;
  }
  setNotifStatus(
    Notification.permission === 'granted'
      ? 'Permission already granted — setting up…'
      : 'Requesting permission…'
  );
  const permission = await Promise.race([
    Notification.requestPermission(),
    new Promise<NotificationPermission>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              'Permission prompt timed out. Check the browser address bar for a blocked notification icon, or allow notifications in site settings.'
            )
          ),
        20000
      )
    ),
  ]);
  if (permission !== 'granted') {
    setNotifStatus(
      permission === 'denied'
        ? 'Permission blocked — allow notifications for this site in browser settings.'
        : 'Permission was not granted.'
    );
    return;
  }
  setNotifStatus('Setting up this device…');
  let registration = await navigator.serviceWorker.getRegistration('/app/');
  if (!registration) {
    registration = await navigator.serviceWorker.register('/app/sw.js', {
      scope: '/app/',
    });
  }
  await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(new Error('Service worker took too long. Refresh the page and try again.')),
        15000
      )
    ),
  ]);
  setNotifStatus('Getting push token…');
  const result = await Promise.race([
    registerWebPushSubscription(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              'Push registration timed out. Check that Firebase/VAPID is configured, then try again.'
            )
          ),
        25000
      )
    ),
  ]);
  if (!result.ok) {
    const hints: Record<string, string> = {
      'permission-denied':
        'Permission was not granted. Allow notifications for this site in browser settings.',
      'firebase-not-configured':
        'Push is not configured (Firebase web config / VAPID key missing on the server build).',
      'service-worker-unavailable':
        'Service worker failed to start. Refresh and try again.',
      unsupported: 'Push is not supported in this browser.',
      'token-unavailable':
        'Could not get a push token. Try again, or check that notifications are allowed.',
      'api-error': result.error || 'Could not register this device.',
    };
    setNotifStatus(
      hints[result.reason] || result.error || result.reason || 'Could not enable notifications.'
    );
    return;
  }
  setNotifStatus('Notifications enabled.');
}

export default function PreferencesPage() {
  return (
    <div className="app-shell">
      <AppHeader title="Preferences" backHref="/" />
      <p className="settings-help">
        Preferences file was partially restored after a bad deploy. Replace this
        file with the full version from the assistant download (preferences-page.tsx).
      </p>
    </div>
  );
}
