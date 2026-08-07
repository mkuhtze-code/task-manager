import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { checkRateLimit, getClientIp } from '@/lib/ratelimit';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Public, unauthenticated endpoint — there's no session to key a rate
// limit off of, so it's keyed by IP instead. Kept deliberately generous
// (same shared limiter as everything else) since a real visitor should
// never hit it, only scripted abuse would.
export async function POST(req: NextRequest) {
  const { allowed } = await checkRateLimit(`ip:${getClientIp(req)}:request-access`);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests, try again shortly.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 200) : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 320) : '';
  const marketingOptIn = body.marketingOptIn === true;

  if (name.length === 0) {
    return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from('waitlist_signups').insert({
    name,
    email,
    marketing_opt_in: marketingOptIn,
  });

  if (error) {
    // 23505 = unique_violation — this email is already on the waitlist.
    // Not an error from the user's point of view, so respond accordingly
    // rather than showing a generic failure.
    if (error.code === '23505') {
      return NextResponse.json(
        { ok: true, alreadyOnList: true },
        { status: 200 }
      );
    }
    return NextResponse.json({ error: 'Could not submit your request.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
