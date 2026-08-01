import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/ratelimit';
import { logError } from '@/lib/logError';

// Deliberately no auth requirement — a crash can happen before a session
// exists (e.g. on the sign-in screen itself). Rate-limited by IP instead
// so this can't be used to flood the table.
export async function POST(req: NextRequest) {
  const { allowed } = await checkRateLimit(`ip:${getClientIp(req)}:client-error`);
  if (!allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const body = await req.json().catch(() => ({} as any));
  const { message, stack, componentStack, url } = body || {};

  const err = new Error(message || 'Unknown client error');
  if (stack) err.stack = stack;

  await logError('client', url || 'unknown', err, { componentStack });

  return NextResponse.json({ ok: true });
}
