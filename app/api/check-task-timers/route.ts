import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import webpush from '@/lib/webpush';

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret');
  if (secret !== process.env.CRON_CHECK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: activeTasks, error } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('status', 'active');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;

  for (const task of activeTasks || []) {
    if (!task.started_at) continue;
    const elapsedMins = task.logged_mins + (Date.now() - new Date(task.started_at).getTime()) / 60000;
    const ratio = task.estimate_mins > 0 ? elapsedMins / task.estimate_mins : 0;

    let shouldNotify = false;
    let title = '';
    let body = '';
    let updateFields: any = {};

    if (ratio >= 1 && !task.over_notified) {
      shouldNotify = true;
      title = 'Docket';
      body = `"${task.text}" has gone past its estimate — worth a check when you get a moment.`;
      updateFields = { over_notified: true };
    } else if (ratio >= 0.7 && !task.near_notified) {
      shouldNotify = true;
      title = 'Docket';
      const pctLeft = Math.max(Math.round((1 - ratio) * 100), 0);
      body = `Almost done with "${task.text}" — about ${pctLeft}% of your estimate left.`;
      updateFields = { near_notified: true };
    }

    if (!shouldNotify) continue;

    const { data: subs } = await supabaseAdmin
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', task.user_id);

    if (subs && subs.length > 0) {
      const { data: settings } = await supabaseAdmin
        .from('user_settings')
        .select('notification_style')
        .eq('user_id', task.user_id)
        .maybeSingle();
      const silent = settings?.notification_style === 'silent';
      const payload = JSON.stringify({ title, body, silent });
      await Promise.allSettled(
        subs.map((sub) =>
          webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          )
        )
      );
      sent += 1;
    }

    await supabaseAdmin.from('tasks').update(updateFields).eq('id', task.id);
  }

  return NextResponse.json({ ok: true, checked: (activeTasks || []).length, sent });
}
