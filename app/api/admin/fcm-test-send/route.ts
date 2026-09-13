import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUser } from '@/lib/verifyUser';
import { logError } from '@/lib/logError';
import { sendWebPushNotification } from '@/lib/fcm/send';
import { normalizeFcmToken } from '@/lib/fcm/tokenValidation';
import { selectTestTargetToken, buildTestWebPushMessage } from '@/lib/fcm/adminTestSend';

// Admin-only controlled test send for the browser FCM web-push path.
//
// Sends exactly ONE data-only FCM message to a registered, non-revoked
// fcm_web_tokens entry (the most recently updated web token by default, or
// an optional explicit `token` to retarget a specific device). This is a
// development/verification tool — it is NOT wired to any real Dokkit
// notification event and never touches the Android-owned fcm_tokens table.
// The caller must be an authenticated admin (mirrors every other /api/admin
// route); there is no unauthenticated or user-scoped send path here.

async function requireAdmin(req: Request) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }
  const { data: adminRow } = await supabaseAdmin
    .from('admins')
    .select('user_id')
    .eq('user_id', auth.userId)
    .maybeSingle();
  if (!adminRow) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { userId: auth.userId };
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if ('response' in gate) return gate.response;

  let requestedToken: string | null = null;
  try {
    const body = (await req.json()) as { token?: unknown };
    if (typeof body.token === 'string' && body.token) {
      requestedToken = normalizeFcmToken(body.token);
      if (!requestedToken) {
        return NextResponse.json({ error: 'Invalid FCM token' }, { status: 400 });
      }
    }
  } catch {
    // Empty body is fine — send to the latest registered web token.
  }

  const { data: tokens, error } = await supabaseAdmin
    .from('fcm_web_tokens')
    .select('token')
    .eq('revoked', false)
    .order('updated_at', { ascending: false });

  if (error) {
    await logError('server', 'fcm-test-send:query', error, {}, gate.userId);
    return NextResponse.json({ error: 'Could not look up web FCM tokens' }, { status: 500 });
  }

  const token = selectTestTargetToken((tokens ?? []) as { token: string }[], requestedToken);
  if (!token) {
    return NextResponse.json(
      { error: 'No active web FCM token registered for this project' },
      { status: 404 }
    );
  }

  const result = await sendWebPushNotification(buildTestWebPushMessage(token));
  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code, token },
      { status: result.code === 'not_configured' ? 503 : 502 }
    );
  }

  return NextResponse.json({ ok: true, token });
}