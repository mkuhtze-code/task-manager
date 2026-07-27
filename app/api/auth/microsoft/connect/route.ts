
import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIp } from '@/lib/ratelimit';

export async function GET(req: NextRequest) {
  const { allowed } = await checkRateLimit(`ip:${getClientIp(req)}:ms-connect`);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests, try again shortly.' }, { status: 429 });
  }

  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
  }

  const tenant = process.env.MICROSOFT_TENANT_ID || 'common';
  const redirectUri = `${req.nextUrl.origin}/api/auth/microsoft/callback`;

  const authUrl = new URL(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`);
  authUrl.searchParams.set('client_id', process.env.MICROSOFT_CLIENT_ID as string);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_mode', 'query');
  authUrl.searchParams.set('scope', 'offline_access Calendars.Read User.Read');
  authUrl.searchParams.set('state', userId);

  return NextResponse.redirect(authUrl.toString());
}
