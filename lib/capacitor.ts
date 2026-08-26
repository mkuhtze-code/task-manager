import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { apiUrl } from '@/lib/authedFetch';

export const isNative = Capacitor.isNativePlatform();

const DOKKIT_CHANNEL_ID = 'dokkit_default';

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNative) {
    console.log('[FCM] requestNotificationPermission: skipped — not native');
    return false;
  }

  try {
    const status = await PushNotifications.requestPermissions();
    console.log('[FCM] requestPermissions result:', status.receive);
    if (status.receive === 'granted') {
      await PushNotifications.createChannel({
        id: DOKKIT_CHANNEL_ID,
        name: 'Dokkit Notifications',
        description: 'General Dokkit notifications',
        importance: 3,
        vibration: true,
      });
      return true;
    }
    console.log('[FCM] Permission not granted:', status.receive);
    return false;
  } catch (e) {
    console.error('[FCM] requestNotificationPermission error:', e);
    return false;
  }
}

export async function registerCurrentToken(): Promise<void> {
  if (!isNative) return;
  try {
    console.log('[FCM] Calling PushNotifications.register()');
    await PushNotifications.register();
    console.log('[FCM] PushNotifications.register() resolved');
  } catch (e) {
    console.error('[FCM] PushNotifications.register() error:', e);
  }
}

export async function unregisterFCMToken(
  fcmToken: string,
  accessToken: string
): Promise<void> {
  if (!isNative) return;

  try {
    await fetch(apiUrl('/api/unregister-fcm-token'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token: fcmToken }),
    });
  } catch {
    // Best-effort cleanup; stale tokens will be ignored server-side
  }
}

async function saveFCMToken(
  fcmToken: string,
  accessToken: string,
  platform: string
): Promise<void> {
  try {
    console.log('[FCM] Sending token to /app/api/register-fcm-token');
    const res = await fetch(apiUrl('/api/register-fcm-token'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ token: fcmToken, platform }),
    });
    const body = await res.json();
    console.log('[FCM] API response:', res.status, body);
  } catch (e) {
    console.error('[FCM] saveFCMToken fetch error:', e);
  }
}

export function setupPushNotifications(getAccessToken: () => string | null): void {
  if (!isNative) {
    console.log('[FCM] setupPushNotifications: skipped — not native');
    return;
  }

  console.log('[FCM] setupPushNotifications: registering listeners');
  let lastRegisteredToken: string | null = null;

  PushNotifications.addListener('registration', (token) => {
    console.log('[FCM] registration event fired, token length:', token.value.length);
    lastRegisteredToken = token.value;
    const accessToken = getAccessToken();
    if (accessToken) {
      saveFCMToken(token.value, accessToken, Capacitor.getPlatform());
    } else {
      console.log('[FCM] No access token available at registration time');
    }
  });

  PushNotifications.addListener('pushNotificationReceived', (notification) => {
    // Foreground notification received; for this stage we do not display
    // a custom in-app notification — the system notification already shows.
  });

  PushNotifications.addListener('registrationError', (error) => {
    console.error('[FCM] Registration error:', error.error);
  });

  // Expose lastRegisteredToken for cleanup on sign-out
  (globalThis as any).__dokkitLastFCMToken = () => lastRegisteredToken;
}
