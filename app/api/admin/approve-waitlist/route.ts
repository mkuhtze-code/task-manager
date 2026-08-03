import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUser } from '@/lib/verifyUser';
import { checkRateLimit } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // verifyUser only proves who's calling, not that they're allowed to
  // approve signups — that's a separate authorization check against the
  // admins table, same as the client-side gate on the admin pages, but
  // enforced here too since this route could otherwise be hit directly.
  const { data: adminRow } = await supabaseAdmin
    .from('admins')
    .select('user_id')
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (!adminRow) {
    return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
  }

  const { allowed } = await checkRateLimit(`user:${auth.userId}:approve-waitlist`);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests, try again shortly.' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : null;
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : null;

  if (!id || !email) {
    return NextResponse.json({ error: 'Missing id or email.' }, { status: 400 });
  }

  const { error: allowlistError } = await supabaseAdmin
    .from('allowed_signup_emails')
    .upsert({ email }, { onConflict: 'email', ignoreDuplicates: true });

  if (allowlistError) {
    return NextResponse.json({ error: allowlistError.message }, { status: 500 });
  }

  const approvedAt = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from('waitlist_signups')
    .update({ approved_at: approvedAt })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, approvedAt });
}
