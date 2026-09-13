import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/verifyUser';
import { checkRateLimit } from '@/lib/ratelimit';
import { logError } from '@/lib/logError';
import { registerFcmToken, revokeFcmToken, supabaseFcmWebTokenStore } from '@/lib/fcm/registration';
import { normalizeFcmToken } from '@/lib/fcm/tokenValidation';

// Authenticated FCM token registration for the browser web-push path.
//
// This is deliberately separate from /api/subscribe (the legacy
// web-push PushSubscription path) and from the Android-owned
// public.fcm_tokens table: browser registrations live in their own
// fcm_web_tokens table, so neither delivery path can entangle with the
// other platform's data. Every write is ownership-checked against the
// authenticated user — a token can never be re-claimed by another
// account.

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { allowed } = await checkRateLimit(`user:${auth.userId}:fcm-token`);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests, try again shortly.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const { token, platform, userAgent } = (body ?? {}) as {
    token?: unknown;
    platform?: unknown;
    userAgent?: unknown;
  };

  let result;
  try {
    result = await registerFcmToken(supabaseFcmWebTokenStore, auth.userId, {
      token: typeof token === 'string' ? token : '',
      platform: typeof platform === 'string' ? platform : '',
      userAgent: typeof userAgent === 'string' ? userAgent : null,
    });
  } catch (err) {
    await logError('server', 'fcm-token:register', err, {}, auth.userId);
    return NextResponse.json({ error: 'Could not register this device for notifications.' }, { status: 500 });
  }

  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { allowed } = await checkRateLimit(`user:${auth.userId}:fcm-token`);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests, try again shortly.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  const token = normalizeFcmToken((body as { token?: unknown })?.token);
  if (!token) {
    return NextResponse.json({ error: 'Invalid FCM token' }, { status: 400 });
  }

  try {
    const result = await revokeFcmToken(supabaseFcmWebTokenStore, auth.userId, token);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });
  } catch (err) {
    await logError('server', 'fcm-token:revoke', err, {}, auth.userId);
    return NextResponse.json({ error: 'Could not remove this device registration.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}