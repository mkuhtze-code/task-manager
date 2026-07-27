// Minimal Microsoft Graph helper for read-only calendar sync. No SDK needed —
// these are just the two OAuth token endpoints plus one Graph call.

const TENANT = process.env.MICROSOFT_TENANT_ID || 'common';
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
const SCOPE = 'offline_access Calendars.Read User.Read';

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID as string,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET as string,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    scope: SCOPE,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`Token exchange failed: ${await res.text()}`);
  }
  return res.json();
}

export async function refreshAccessToken(refreshToken: string) {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID as string,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET as string,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: SCOPE,
  });

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${await res.text()}`);
  }
  return res.json();
}

// Microsoft Graph returns event times in UTC by default when no Prefer
// header is sent, so we can trust these and just append "Z".
export async function fetchTodayEvents(accessToken: string) {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

  const url = new URL('https://graph.microsoft.com/v1.0/me/calendarview');
  url.searchParams.set('startDateTime', startOfDay.toISOString());
  url.searchParams.set('endDateTime', endOfDay.toISOString());
  url.searchParams.set('$select', 'id,subject,start,end,isCancelled,showAs');
  url.searchParams.set('$orderby', 'start/dateTime');
  url.searchParams.set('$top', '50');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Graph calendarview failed: ${await res.text()}`);
  }
  const data = await res.json();
  return (data.value || []) as Array<{
    id: string;
    subject: string;
    start: { dateTime: string };
    end: { dateTime: string };
    isCancelled: boolean;
    showAs: string;
  }>;
}
