import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/verifyUser';
import { assertCanUseFeature } from '@/lib/billing/serverEntitlements';
import { checkRateLimit } from '@/lib/ratelimit';
import { API_BASE_PATH } from '@/lib/authedFetch';
import { MICROSOFT_OAUTH_SCOPE } from '@/lib/microsoftGraph';
import {
  encodeOAuthStateCookie,
  generateOAuthState,
  oauthCookieOptions,
  OAUTH_STATE_COOKIE,
  OAUTH_USER_COOKIE,
} from '@/lib/calendar/oauthState';

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const gate = await assertCanUseFeature(auth.userId, 'calendar');
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }


  const { allowed } = await checkRateLimit(`user:${auth.userId}:ms-connect`);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests, try again shortly.' },
      { status: 429 }
    );
  }

  const redirectUri = `${req.nextUrl.origin}${API_BASE_PATH}/api/auth/microsoft/callback`;

  const tenant = process.env.MICROSOFT_TENANT_ID || 'common';
  const state = generateOAuthState();

  const authUrl = new URL(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`
  );
  authUrl.searchParams.set('client_id', process.env.MICROSOFT_CLIENT_ID as string);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_mode', 'query');
  authUrl.searchParams.set('scope', MICROSOFT_OAUTH_SCOPE);
  authUrl.searchParams.set('state', state);

  const res = NextResponse.json({ url: authUrl.toString() });
  const opts = oauthCookieOptions();
  res.cookies.set(OAUTH_STATE_COOKIE, encodeOAuthStateCookie(state), opts);
  res.cookies.set(OAUTH_USER_COOKIE, auth.userId, opts);
  return res;
}
