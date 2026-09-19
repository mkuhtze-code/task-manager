import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  sendWebPushNotification,
  type WebPushMessage,
} from '@/lib/fcm/send';
import { supabaseFcmWebTokenStore } from '@/lib/fcm/registration';

export type DeliverToUserResult = {
  attempted: number;
  sent: number;
  failed: number;
  /** True when Firebase is not configured — caller may fall back to VAPID. */
  notConfigured: boolean;
};

/**
 * Send one logical notification to every active FCM web token for a user.
 * Revokes tokens FCM reports as unregistered.
 */
export async function deliverFcmToUser(
  userId: string,
  message: Omit<WebPushMessage, 'token'>
): Promise<DeliverToUserResult> {
  const { data: rows, error } = await supabaseAdmin
    .from('fcm_web_tokens')
    .select('token')
    .eq('user_id', userId)
    .eq('revoked', false);

  if (error || !rows?.length) {
    return { attempted: 0, sent: 0, failed: 0, notConfigured: false };
  }

  let sent = 0;
  let failed = 0;
  let notConfigured = false;

  for (const row of rows) {
    const result = await sendWebPushNotification({
      token: row.token,
      title: message.title,
      body: message.body,
      destination: message.destination,
      type: message.type,
      entityId: message.entityId,
      silent: message.silent,
      startedAt: message.startedAt,
      estimateMins: message.estimateMins,
      loggedMins: message.loggedMins,
      text: message.text,
    });

    if (result.ok) {
      sent += 1;
      continue;
    }

    if (result.code === 'not_configured') {
      notConfigured = true;
      failed += 1;
      break;
    }

    if (result.code === 'unregistered') {
      await supabaseFcmWebTokenStore.revokeByToken(row.token);
    }
    failed += 1;
  }

  return { attempted: rows.length, sent, failed, notConfigured };
}
