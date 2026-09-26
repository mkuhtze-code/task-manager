import { NextRequest, NextResponse } from 'next/server';
import { exchangeCodeForTokens, fetchMe } from '@/lib/microsoftGraph';
import { checkRateLimit, getClientIp } from '@/lib/ratelimit';
import { API_BASE_PATH } from '@/lib/authedFetch';
import { logError } from '@/lib/logError';
import { upsertConnection } from '@/lib/calendar/store';
import { seedConnectionCalendars } from '@/lib/calendar/sync';
import {
import { assertCanUseFeature } from '@/lib/billing/serverEntitlements';
  oauthCookieOptions,
  OAUTH_STATE_COOKIE,
  OAUTH_USER_COOKIE,
  verifyOAuthState,
} from '@/lib/calendar/oauthState';

export async function GET(req: NextRequest) {
  const { allowed } = await checkRateLimit(`ip:${getClientIp(req)}:ms-callback`);
  if (!allowed) {
    return NextResponse.redirect(
      `${req.nextUrl.origin}${API_BASE_PATH}/preferences?calendar=error`
    );
  }

  const preferencesUrl = `${req.nextUrl.origin}${API_BASE_PATH}/preferences`;

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const oauthError = req.nextUrl.searchParams.get('error');

  const stateCookie = req.cookies.get(OAUTH_STATE_COOKIE)?.value;
  const userCookie = req.cookies.get(OAUTH_USER_COOKIE)?.value;

  if (oauthError) {
    const res = NextResponse.redirect(`${preferencesUrl}?calendar=denied`);
    clearOauthCookies(req, res);
    return res;
  }

  const verdict = verifyOAuthState(stateCookie, state);
  if (verdict !== 'ok') {
    const reason =
      verdict === 'expired_state'
        ? 'expired'
        : verdict === 'missing_state'
          ? 'missing'
          : 'invalid';
    const res = NextResponse.redirect(`${preferencesUrl}?calendar=${encodeURIComponent(reason)}`);
    clearOauthCookies(req, res);
    return res;
  }

  if (!userCookie) {
    const res = NextResponse.redirect(`${preferencesUrl}?calendar=not_authed`);
    clearOauthCookies(req, res);
    return res;
  }

  const gate = await assertCanUseFeature(userCookie, 'calendar');
  if (!gate.ok) {
    const res = NextResponse.redirect(`${preferencesUrl}?calendar=plan_required`);
    clearOauthCookies(req, res);
    return res;
  }

  const redirectUri = `${req.nextUrl.origin}${API_BASE_PATH}/api/auth/microsoft/callback`;

  try {
    const tokens = await exchangeCodeForTokens(code as string, redirectUri);
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Token exchange returned no tokens');
    }

    const me = await fetchMe(tokens.access_token);
    const connectedEmail = me.mail || me.userPrincipalName || null;

    const connection = await upsertConnection({
      userId: userCookie,
      provider: 'microsoft',
      providerAccountId: me.id,
      connectedEmail,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
        : null,
      scopes: 'offline_access Calendars.Read User.Read',
    });

    // Best-effort: discover the account's calendars so Preferences shows
    // them (default already selected) immediately. A failure here must not
    // fail the whole connection — the cron sync will populate calendars.
    try {
      await seedConnectionCalendars(connection);
    } catch (seedError) {
      await logError('server', 'microsoft-oauth-callback', seedError, {
        stage: 'seed-calendars',
      });
    }

    const res = NextResponse.redirect(`${preferencesUrl}?calendar=connected`);
    clearOauthCookies(req, res);
    return res;
  } catch (error) {
    await logError('server', 'microsoft-oauth-callback', error, {
      stage: 'exchange',
    });
    const res = NextResponse.redirect(`${preferencesUrl}?calendar=error`);
    clearOauthCookies(req, res);
    return res;
  }
}

function clearOauthCookies(req: NextRequest, res: NextResponse) {
  for (const name of [OAUTH_STATE_COOKIE, OAUTH_USER_COOKIE]) {
    res.cookies.set(name, '', {
      ...oauthCookieOptions(),
      maxAge: 0,
      path: '/app/api/auth/microsoft',
    });
  }
}
