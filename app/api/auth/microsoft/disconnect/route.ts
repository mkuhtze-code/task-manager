import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUser } from '@/lib/verifyUser';

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  await supabaseAdmin.from('calendar_connections').delete().eq('user_id', auth.userId);
  await supabaseAdmin.from('meetings').delete().eq('user_id', auth.userId).eq('source', 'outlook');

  return NextResponse.json({ ok: true });
}
