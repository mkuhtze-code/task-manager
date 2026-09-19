import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUser } from '@/lib/verifyUser';
import { checkRateLimit } from '@/lib/ratelimit';
import webpush, { HIGH_PRIORITY_OPTIONS } from '@/lib/webpush';
import { logError } from '@/lib/logError';
import { deliverFcmToUser } from '@/lib/fcm/deliverToUser';

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { allowed } = await checkRateLimit(`user:${auth.userId}:test-notification`);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests, try again shortly.' }, { status: 429 });
  }

  const { data: settings } = await supabaseAdmin
    .from('user_settings')
    .select('notification_style')
    .eq('user_id', auth.userId)
    .maybeSingle();
  const silent = settings?.notification_style === 'silent';

  const title = 'Dokkit';
  const body = 'This is a test notification — if you see this, you are all set.';

  // Prefer FCM web tokens (background-capable path).
  const fcm = await deliverFcmToUser(auth.userId, {
    title,
    body,
    destination: '/app',
    type: 'test',
    silent,
  });

  if (fcm.sent > 0) {
    return NextResponse.json({
      ok: true,
      channel: 'fcm',
      sent: fcm.sent,
      failed: fcm.failed,
    });
  }

  // Fall back to legacy VAPID subscriptions if no FCM tokens or FCM not configured.
  const { data: subs, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', auth.userId);

  if (error) {
    await logError('server', 'send-test-notification', error, {}, auth.userId);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!subs || subs.length === 0) {
    if (fcm.notConfigured) {
      return NextResponse.json(
        {
          error:
            'No notification channel ready. Enable notifications in Preferences, and ensure FIREBASE_SERVICE_ACCOUNT_JSON is set on the server.',
        },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: 'No subscriptions found — enable notifications in Preferences first.' },
      { status: 404 }
    );
  }

  const payload = JSON.stringify({ title, body, silent });

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush
        .sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
          HIGH_PRIORITY_OPTIONS
        )
        .catch((err) => {
          throw { err, subId: sub.id, endpoint: sub.endpoint };
        })
    )
  );

  const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
  let staleRemoved = 0;

  for (const f of failures) {
    const { err, subId } = (f.reason || {}) as any;
    const statusCode = err?.statusCode;
    const responseBody = err?.body;

    if (statusCode === 404 || statusCode === 410) {
      await supabaseAdmin.from('push_subscriptions').delete().eq('id', subId);
      staleRemoved += 1;
    }

    await logError(
      'server',
      'send-test-notification:push',
      err || f.reason,
      {
        statusCode,
        responseBody,
        subId,
        failureCount: failures.length,
        totalSubs: subs.length,
      },
      auth.userId
    );
  }

  if (failures.length === results.length) {
    const hint =
      staleRemoved > 0
        ? 'That subscription was stale and has been removed — go to Preferences and tap "Enable notifications" again to reconnect.'
        : 'Check the Error Log for details.';
    return NextResponse.json({ error: `All deliveries failed. ${hint}` }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    channel: 'vapid',
    sent: results.length - failures.length,
    failed: failures.length,
    staleRemoved,
  });
}
