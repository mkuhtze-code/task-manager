
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { exchangeCodeForTokens } from '@/lib/microsoftGraph';
import { checkRateLimit, getClientIp } from '@/lib/ratelimit';

export async function GET(req: NextRequest) {
  const { allowed } = await checkRateLimit(`ip:${getClientIp(req)}:ms-callback`);
  if (!allowed) {
    return NextResponse.redirect(`${req.nextUrl.origin}/app/settings?calendar=error`);
  }

  const code = req.nextUrl.searchParams.get('code');
  const userId = req.nextUrl.searchParams.get('state');
  const oauthError = req.nextUrl.searchParams.get('error');

  const redirectUri = `${req.nextUrl.origin}/app/api/auth/microsoft/callback`;

  if (oauthError || !code || !userId) {
    return NextResponse.redirect(`${req.nextUrl.origin}/app/settings?calendar=error`);
  }

  try {
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Best-effort lookup of the connected account's email, just for display
    // on the Settings page — sync still works fine if this fails.
    let connectedEmail: string | null = null;
    try {
      const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        connectedEmail = me.mail || me.userPrincipalName || null;
      }
    } catch {
      // non-fatal
    }

    await supabaseAdmin.from('calendar_connections').upsert(
      {
        user_id: userId,
        provider: 'microsoft',
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: expiresAt,
        connected_email: connectedEmail,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    return NextResponse.redirect(`${req.nextUrl.origin}/app/settings?calendar=connected`);
  } catch (e) {
    return NextResponse.redirect(`${req.nextUrl.origin}/app/settings?calendar=error`);
  }
}
