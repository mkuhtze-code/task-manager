import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUser } from '@/lib/verifyUser';
import { checkRateLimit } from '@/lib/ratelimit';

export type AdminAccess =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; response: NextResponse };

/**
 * Shared Admin API boundary:
 *  1. Valid session + active account (verifyUser)
 *  2. Per-admin rate limit (anti-abuse; fails open if Redis missing)
 *  3. Membership of public.admins
 *
 * UI gates are never security controls — every /api/admin route must call this.
 */
export async function requireAdmin(req: Request): Promise<AdminAccess> {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return {
      ok: false,
      response: NextResponse.json({ error: auth.error }, { status: auth.status }),
    };
  }

  const rate = await checkRateLimit(`admin:${auth.userId}`);
  if (!rate.allowed) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429 }),
    };
  }

  const { data: adminRow } = await supabaseAdmin
    .from('admins')
    .select('user_id')
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (!adminRow) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  return { ok: true, userId: auth.userId, email: auth.email };
}
