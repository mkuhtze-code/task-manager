
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

// NOTE: this route trusts the userId passed in the request body, matching
// the pattern already used elsewhere in this app (e.g. /api/send-test-notification).
// That's an acceptable risk while sign-up stays locked to trusted testers, but
// before opening sign-ups publicly this needs real server-side verification
// that the caller's auth token actually belongs to the userId being deleted.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { userId } = body;

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // All rows in tasks, subtasks, meetings, user_settings, and push_subscriptions
  // reference auth.users(id) with ON DELETE CASCADE, so deleting the auth user
  // above already removes everything else — no manual cleanup needed here.
  return NextResponse.json({ ok: true });
}
