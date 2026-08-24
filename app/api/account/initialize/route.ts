import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUser } from '@/lib/verifyUser';
import webpush, { HIGH_PRIORITY_OPTIONS } from '@/lib/webpush';
import { logError } from '@/lib/logError';

async function notifyAdminsOnce(userId: string, email: string | null) {
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from('account_status')
    .update({ admin_notified_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('admin_notified_at', null)
    .select('user_id');

  if (claimError || !claimed?.length) return;

  const { data: admins } = await supabaseAdmin.from('admins').select('user_id');
  const adminIds = (admins || []).map((admin) => admin.user_id);
  if (adminIds.length === 0) return;

  const { data: subscriptions } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .in('user_id', adminIds);

  const payload = JSON.stringify({
    title: 'New Dokkit user',
    body: `${email || 'A new user'} has joined Dokkit.`,
    silent: false,
  });

  await Promise.all((subscriptions || []).map(async (subscription) => {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
        payload,
        HIGH_PRIORITY_OPTIONS
      );
    } catch (error: any) {
      if (error?.statusCode === 404 || error?.statusCode === 410) {
        await supabaseAdmin.from('push_subscriptions').delete().eq('id', subscription.id);
      }
      await logError('server', 'account-initialize:admin-push', error, { userId, subscriptionId: subscription.id }, userId);
    }
  }));
}

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { error: insertError } = await supabaseAdmin
    .from('user_settings')
    .upsert({ user_id: auth.userId }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (insertError) return NextResponse.json({ error: 'Could not initialize account' }, { status: 500 });

  const { data: settings, error: settingsError } = await supabaseAdmin
    .from('user_settings')
    .select('onboarded')
    .eq('user_id', auth.userId)
    .single();
  if (settingsError || !settings) return NextResponse.json({ error: 'Could not load account settings' }, { status: 500 });

  await notifyAdminsOnce(auth.userId, auth.email);
  return NextResponse.json({ onboarded: settings.onboarded });
}
