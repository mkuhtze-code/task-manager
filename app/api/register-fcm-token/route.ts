import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUser } from '@/lib/verifyUser';
import { checkRateLimit } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { allowed } = await checkRateLimit(`user:${auth.userId}:fcm-register`);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests, try again shortly.' }, { status: 429 });
  }

  const body = await req.json();
  const { token, platform } = body;

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid FCM token' }, { status: 400 });
  }

  const validPlatforms = ['android', 'ios', 'web'];
  const platformValue = validPlatforms.includes(platform) ? platform : 'android';

  const { error } = await supabaseAdmin
    .from('fcm_tokens')
    .upsert(
      {
        user_id: auth.userId,
        fcm_token: token,
        platform: platformValue,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,fcm_token' }
    );

  if (error) {
    console.error('[FCM] Token registration error:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
