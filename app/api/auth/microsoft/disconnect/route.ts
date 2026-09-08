import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/verifyUser';
import { checkRateLimit } from '@/lib/ratelimit';
import { clearConnection } from '@/lib/calendar/sync';

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { allowed } = await checkRateLimit(`user:${auth.userId}:ms-disconnect`);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests, try again shortly.' },
      { status: 429 }
    );
  }

  await clearConnection(auth.userId, 'microsoft');

  return NextResponse.json({ ok: true });
}