import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import webpush, { HIGH_PRIORITY_OPTIONS } from '@/lib/webpush';
import { getUserLocalTime, timeStringToMinutes } from '@/lib/timezone';
import { logError } from '@/lib/logError';
import { deliverFcmToUser } from '@/lib/fcm/deliverToUser';

function fmtMinsServer(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}

export async function GET() {
  const now = new Date();

  const { data: activeTasks, error } = await supabaseAdmin
    .from('tasks')
    .select('*')
    .eq('status', 'active');

  if (error) {
    await logError('server', 'check-task-timers', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let sent = 0;

  for (const task of activeTasks || []) {
    if (!task.started_at) continue;

    // Always refresh the closed-app ongoing timer notification (silent FCM).
    {
      await deliverFcmToUser(task.user_id, {
        title: task.text || 'Dokkit timer',
        body: 'Timer running',
        destination: '/app',
        type: 'active_timer',
        entityId: task.id,
        silent: true,
        startedAt: task.started_at,
        estimateMins: task.estimate_mins || 0,
        loggedMins: task.logged_mins || 0,
        text: task.text || 'Dokkit timer',
      });
    }

    // Near / over alerts only when there is an estimate to measure against
    if (!task.estimate_mins || task.estimate_mins <= 0) continue;

    const started = new Date(task.started_at).getTime();
    const elapsedMins = (now.getTime() - started) / 60000;
    const ratio = elapsedMins / task.estimate_mins;

    const { data: settings } = await supabaseAdmin
      .from('user_settings')
      .select('work_end, notification_style, timezone')
      .eq('user_id', task.user_id)
      .maybeSingle();

    const workEnd = settings?.work_end || '16:00';
    const tz = settings?.timezone || 'Pacific/Auckland';
    const local = getUserLocalTime(tz, now);
    const localMins =
      local?.minutesOfDay ?? now.getUTCHours() * 60 + now.getUTCMinutes();
    const workEndMins = timeStringToMinutes(workEnd);
    const pastWorkEnd = localMins >= workEndMins;

    const STALE_AFTER_MINS = 90;
    const OVERDUE_PING_EVERY_MINS = 30;
    const isStale = elapsedMins >= STALE_AFTER_MINS;
    const lastPing = task.last_overdue_ping_at
      ? new Date(task.last_overdue_ping_at).getTime()
      : 0;
    const minsSincePing = lastPing ? (now.getTime() - lastPing) / 60000 : 999;

    let shouldNotify = false;
    let title = 'Dokkit';
    let body = '';
    let updateFields: Record<string, unknown> = {};

    if (ratio >= 1 || isStale || pastWorkEnd) {
      if (!task.over_notified) {
        shouldNotify = true;
        const overBy = Math.max(elapsedMins - task.estimate_mins, 0);
        if (pastWorkEnd) {
          body = `"${task.text}" is still logged as active after hours — ${fmtMinsServer(elapsedMins)} total so far.`;
        } else if (isStale) {
          body = `"${task.text}" is still running — ${fmtMinsServer(elapsedMins)} so far. Stop it if you're finished.`;
        } else {
          body = `"${task.text}" ran past its estimate by ${fmtMinsServer(overBy)}.`;
        }
        updateFields = { over_notified: true, last_overdue_ping_at: now.toISOString() };
      } else if (minsSincePing >= OVERDUE_PING_EVERY_MINS) {
        shouldNotify = true;
        const overBy = Math.max(elapsedMins - task.estimate_mins, 0);
        if (pastWorkEnd) {
          body = `"${task.text}" is still logged as active after hours — ${fmtMinsServer(elapsedMins)} total so far.`;
        } else if (isStale) {
          body = `"${task.text}" is still running — ${fmtMinsServer(elapsedMins)} so far. Stop it if you're finished.`;
        } else {
          body = `"${task.text}" is still running — ${fmtMinsServer(overBy)} past its estimate now.`;
        }
        updateFields = { last_overdue_ping_at: now.toISOString() };
      }
    } else if (ratio >= 0.7 && !task.near_notified) {
      shouldNotify = true;
      const pctLeft = Math.max(Math.round((1 - ratio) * 100), 0);
      body = `Almost done with "${task.text}" — about ${pctLeft}% of your estimate left.`;
      updateFields = { near_notified: true };
    }

    if (!shouldNotify) continue;

    const silent = settings?.notification_style === 'silent';
    let delivered = false;

    const fcm = await deliverFcmToUser(task.user_id, {
      title,
      body,
      destination: '/app',
      type: 'task_timer',
      entityId: task.id,
      silent,
    });
    if (fcm.sent > 0) {
      delivered = true;
    }

    if (!delivered) {
      const { data: subs } = await supabaseAdmin
        .from('push_subscriptions')
        .select('*')
        .eq('user_id', task.user_id);

      if (subs && subs.length > 0) {
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
                throw { err, subId: sub.id };
              })
          )
        );

        const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        for (const f of failures) {
          const { err, subId } = (f.reason || {}) as any;
          const statusCode = err?.statusCode;

          if (statusCode === 404 || statusCode === 410) {
            await supabaseAdmin.from('push_subscriptions').delete().eq('id', subId);
          }

          await logError(
            'server',
            'check-task-timers:push',
            err || f.reason,
            {
              taskId: task.id,
              userId: task.user_id,
              statusCode,
              responseBody: err?.body,
              subId,
              failureCount: failures.length,
              totalSubs: subs.length,
            },
            task.user_id
          );
        }

        if (failures.length < results.length) delivered = true;
      }
    }

    if (delivered) sent += 1;

    await supabaseAdmin.from('tasks').update(updateFields).eq('id', task.id);
  }

  return NextResponse.json({ ok: true, checked: (activeTasks || []).length, sent });
}
