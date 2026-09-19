import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { logError } from '@/lib/logError';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { writeAdminAudit } from '@/lib/admin/audit';
import { sendWebPushNotification } from '@/lib/fcm/send';
import { normalizeFcmToken } from '@/lib/fcm/tokenValidation';
import { selectTestTargetToken, buildTestWebPushMessage } from '@/lib/fcm/adminTestSend';

// Admin-only controlled test send for the browser FCM web-push path.
// Never returns the full device token in the response body.

export async function POST(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

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
    await logError('server', 'fcm-test-send:query', error, {}, access.userId);
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
  await writeAdminAudit({
    actorId: access.userId,
    action: 'fcm.test_send',
    metadata: { ok: result.ok, code: result.ok ? undefined : result.code },
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message, code: result.code },
      { status: result.code === 'not_configured' ? 503 : 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
