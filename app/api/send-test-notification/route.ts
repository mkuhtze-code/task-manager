import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import webpush from '@/lib/webpush';
import { verifyUser } from '@/lib/verifyUser';

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: subs, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', auth.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!subs || subs.length === 0) {
    return NextResponse.json({ error: 'No subscriptions found for this user' }, { status: 404 });
  }

  const payload = JSON.stringify({
    title: 'Dokkit',
    body: 'This is a test notification — if you see this, you are all set.',
  });

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload
      )
    )
  );

  return NextResponse.json({ ok: true, sent: results.length });
}
