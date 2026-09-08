// Minimal Microsoft Graph helper for read-only calendar sync. No SDK needed —
// these are just the two OAuth token endpoints plus the Graph calls we make.

const TENANT = process.env.MICROSOFT_TENANT_ID || 'common';
const TOKEN_URL = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
export const MICROSOFT_OAUTH_SCOPE = 'offline_access Calendars.Read User.Read';

export type MicrosoftTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
};

export interface MicrosoftMe {
  id: string;
  mail?: string | null;
  userPrincipalName?: string | null;
}

async function tokenRequest(params: URLSearchParams) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
    cache: 'no-store',
  });
  const text = await res.text();
  if (!res.ok) {
    const errorDescription = extractErrorDescription(text);
    throw new Error(errorDescription || `Token endpoint failed with ${res.status}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('Token endpoint returned malformed JSON');
  }
}

function extractErrorDescription(body: string): string | null {
  if (!body) {
    return null;
  }
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.error_description === 'string') {
      const match = parsed.error_description.match(/^([^:]+)/);
      return match ? match[1].trim() : null;
    }
    return typeof parsed?.error === 'string' ? parsed.error : null;
  } catch {
    return body.length <= 200 ? body : 'Token endpoint error';
  }
}

export async function exchangeCodeForTokens(code: string, redirectUri: string) {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID as string,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET as string,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    scope: MICROSOFT_OAUTH_SCOPE,
  });
  return tokenRequest(params) as Promise<MicrosoftTokenResponse>;
}

export async function refreshAccessToken(refreshToken: string) {
  const params = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID as string,
    client_secret: process.env.MICROSOFT_CLIENT_SECRET as string,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: MICROSOFT_OAUTH_SCOPE,
  });
  return tokenRequest(params) as Promise<MicrosoftTokenResponse>;
}

export async function fetchMe(accessToken: string): Promise<MicrosoftMe> {
  const res = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Graph /me failed with ${res.status}`);
  }
  const data = await res.json();
  return {
    id: String(data?.id ?? ''),
    mail: data?.mail ?? null,
    userPrincipalName: data?.userPrincipalName ?? null,
  };
}

export interface MicrosoftGraphEvent {
  id: string;
  subject?: string | null;
  start?: { dateTime?: string; timeZone?: string } | null;
  end?: { dateTime?: string; timeZone?: string } | null;
  isAllDayEvent?: boolean;
  isCancelled?: boolean;
  showAs?: string;
  location?: { displayName?: string | null } | null;
  bodyPreview?: string | null;
  webLink?: string | null;
  lastModifiedDateTime?: string | null;
}

// Microsoft Graph calendar list item — read-only discovery of the calendars
// inside one connected account. No extra permission needed beyond the
// Calendars.Read scope already granted at connect time.
export interface MicrosoftGraphCalendar {
  id: string;
  name?: string | null;
  isDefaultCalendar?: boolean;
  color?: string | null;
  owner?: { name?: string | null; address?: string | null } | null;
}

export async function fetchCalendars(
  accessToken: string
): Promise<MicrosoftGraphCalendar[]> {
  const url = new URL('https://graph.microsoft.com/v1.0/me/calendars');
  url.searchParams.set(
    '$select',
    'id,name,isDefaultCalendar,color,owner'
  );
  url.searchParams.set('$top', '200');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Graph calendars failed with ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data?.value) ? (data.value as MicrosoftGraphCalendar[]) : [];
}

// Microsoft Graph returns event times in UTC by default (no Prefer header),
// so the startDateTime/endDateTime we send are interpreted as UTC and the
// returned dateTime values carry a "Z" suffix we can trust. Scoped to one
// calendar inside the connected account (me/calendars/{id}/calendarview).
export async function fetchCalendarEvents(
  accessToken: string,
  calendarId: string,
  startUtc: Date,
  endUtc: Date
): Promise<MicrosoftGraphEvent[]> {
  const url = new URL(
    `https://graph.microsoft.com/v1.0/me/calendars/${encodeURIComponent(calendarId)}/calendarview`
  );
  url.searchParams.set('startDateTime', startUtc.toISOString());
  url.searchParams.set('endDateTime', endUtc.toISOString());
  url.searchParams.set(
    '$select',
    'id,subject,start,end,isAllDayEvent,isCancelled,showAs,location,bodyPreview,webLink,lastModifiedDateTime'
  );
  url.searchParams.set('$orderby', 'start/dateTime');
  url.searchParams.set('$top', '200');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Graph calendarview failed with ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data?.value) ? (data.value as MicrosoftGraphEvent[]) : [];
}