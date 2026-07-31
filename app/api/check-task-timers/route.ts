import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import webpush from '@/lib/webpush';
import { getUserLocalTime, timeStringToMinutes } from '@/lib/timezone';

const OVERDUE_REPEAT_MINS = 30; // how often to re-ping once a task is running over
const STALE_FLOOR_MINS = 180; // minimum elapsed time before a task counts as "likely forgotten"
const STALE_ESTIMATE_MULTIPLIER = 4; // or 4x the estimate, whichever is larger

function fmtMinsServer(mins: number): string {
  mins = Math.round(mins);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

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

    const { data: settings } = await supabaseAdmin
      .from('user_settings')
      .select('notification_style, work_end, work_days, timezone')
      .eq('user_id', task.user_id)
      .maybeSingle();

    // A task is "stale" once it's run long enough that it's more likely
    // forgotten than actively worked — a flat 3-hour floor so short tasks
    // don't get flagged too eagerly, scaling up for genuinely long ones.
    const staleThresholdMins = Math.max(STALE_FLOOR_MINS, task.estimate_mins * STALE_ESTIMATE_MULTIPLIER);
    const isStale = elapsedMins >= staleThresholdMins;

    // Work-day-end is the strongest forgotten-task signal there is, but
    // needs the user's real timezone to evaluate — the server only knows
    // UTC. If timezone hasn't synced yet, this quietly stays false rather
    // than guessing.
    let pastWorkEnd = false;
    if (settings?.timezone && settings?.work_end && settings?.work_days) {
      const local = getUserLocalTime(settings.timezone);
      if (local) {
        pastWorkEnd =
          settings.work_days.includes(local.dayOfWeek) &&
          local.minutesOfDay >= timeStringToMinutes(settings.work_end);
      }
    }

    const triggerOverdue = ratio >= 1 || isStale;

    let shouldNotify = false;
    const title = 'Dokkit';
    let body = '';
    let updateFields: any = {};

    if (triggerOverdue) {
      const lastPing = task.last_overdue_ping_at ? new Date(task.last_overdue_ping_at).getTime() : null;
      const minsSinceLastPing = lastPing ? (Date.now() - lastPing) / 60000 : null;
      const dueForRepeat = minsSinceLastPing === null || minsSinceLastPing >= OVERDUE_REPEAT_MINS;

      if (!task.over_notified) {
        // First time crossing into overdue/stale territory
        shouldNotify = true;
        if (pastWorkEnd) {
          body = `"${task.text}" is still running, and your work day has ended — stop it if you're done for today.`;
        } else if (isStale) {
          body = `"${task.text}" has been running for ${fmtMinsServer(elapsedMins)} — still on it, or did it get left on?`;
        } else {
          body = `"${task.text}" has gone past its estimate — worth a check when you get a moment.`;
        }
        updateFields = { over_notified: true, last_overdue_ping_at: new Date().toISOString() };
      } else if (dueForRepeat) {
        // Still running, hasn't been touched — nudge again on the same
        // cadence as before, with a message reflecting how long it's
        // actually been and whether the work day is over.
        shouldNotify = true;
        const overBy = Math.max(elapsedMins - task.estimate_mins, 0);
        if (pastWorkEnd) {
          body = `"${task.text}" is still logged as active after hours — ${fmtMinsServer(elapsedMins)} total so far.`;
        } else if (isStale) {
          body = `"${task.text}" is still running — ${fmtMinsServer(elapsedMins)} so far. Stop it if you're finished.`;
        } else {
          body = `"${task.text}" is still running — ${fmtMinsServer(overBy)} past its estimate now.`;
        }
        updateFields = { last_overdue_ping_at: new Date().toISOString() };
      }
    } else if (ratio >= 0.7 && !task.near_notified) {
      shouldNotify = true;
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
