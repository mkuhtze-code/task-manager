import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUser } from '@/lib/verifyUser';
import { checkRateLimit } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { allowed } = await checkRateLimit(`user:${auth.userId}:fcm-unregister`);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests, try again shortly.' }, { status: 429 });
  }

  const body = await req.json();
  const { token } = body;

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Missing FCM token' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('fcm_tokens')
    .delete()
    .eq('user_id', auth.userId)
    .eq('fcm_token', token);

  if (error) {
    console.error('[FCM] Token deletion error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
