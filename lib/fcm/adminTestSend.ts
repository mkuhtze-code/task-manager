import { WebPushMessage } from '@/lib/fcm/send';

// Admin-only FCM web test-send support (see /api/admin/fcm-test-send).
// Pure helpers kept out of the route so the selection/build behaviour can
// be unit-tested without Next.js runtime imports.

export interface FcmWebTokenCandidate {
  token: string;
}

// Picks which browser FCM token a test message goes to. Callers pass the
// non-revoked web tokens ordered most-recently-updated first. An explicit
// requestedToken targets that exact device (used by the admin UI to re-send
// to a specific phone); otherwise the most recently registered web token is
// used. Returns null when there is nothing to send to.
export function selectTestTargetToken(
  candidates: FcmWebTokenCandidate[],
  requestedToken?: string | null
): string | null {
  if (requestedToken) {
    const match = candidates.find((c) => c.token === requestedToken);
    return match ? match.token : null;
  }
  return candidates.length > 0 ? candidates[0].token : null;
}

// The single controlled test message. Data-only on purpose (the Service
// Worker renders it); dokkit_source marks it as an FCM message so the
// legacy web-push push handler skips it, and destination routes the click.
export function buildTestWebPushMessage(token: string): WebPushMessage {
  return {
    token,
    title: 'Dokkit',
    body: 'FCM web push test notification.',
    destination: '/app',
    type: 'test',
  };
}