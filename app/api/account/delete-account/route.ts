import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUser } from '@/lib/verifyUser';
import { checkRateLimit } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { allowed } = await checkRateLimit(`user:${auth.userId}:delete-account`);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests, try again shortly.' }, { status: 429 });
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(auth.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Cascade is the deliberate contract: every user-owned table references
  // auth.users(id) with ON DELETE CASCADE — tasks, subtasks, task_types,
  // time_logs, meetings, user_settings, push_subscriptions,
  // calendar_connections, trips, trip_days (via trips), activities,
  // accommodations, admins, error_logs. feedback keeps its rows but
  // anonymizes them (user_id ON DELETE SET NULL), and feedback_replies
  // survive alongside the feedback row they belong to. No explicit
  // per-table cleanup is needed and none is performed, so unrelated or
  // shared data is never touched.
  return NextResponse.json({ ok: true });
}
