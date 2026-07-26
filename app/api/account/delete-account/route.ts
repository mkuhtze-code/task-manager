import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUser } from '@/lib/verifyUser';

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(auth.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // All rows in tasks, subtasks, meetings, user_settings, push_subscriptions,
  // and calendar_connections reference auth.users(id) with ON DELETE CASCADE,
  // so deleting the auth user above already removes everything else.
  return NextResponse.json({ ok: true });
}
