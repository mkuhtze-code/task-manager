import { supabaseAdmin } from '@/lib/supabaseAdmin';

type VerifyResult =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; error: string; status: number };

// Validates the caller's Supabase token and rejects terminated accounts before
// any service-role route reads or writes user data. RLS supplies the same
// protection for direct browser-to-Supabase queries.
export async function verifyUser(req: Request): Promise<VerifyResult> {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) return { ok: false, error: 'Missing authorization token', status: 401 };

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return { ok: false, error: 'Invalid or expired session', status: 401 };

  const { data: account, error: accountError } = await supabaseAdmin
    .from('account_status')
    .select('status')
    .eq('user_id', data.user.id)
    .maybeSingle();

  if (accountError) return { ok: false, error: 'Could not verify account access', status: 503 };
  if (!account || account.status !== 'active') {
    return { ok: false, error: 'This account is no longer active', status: 403 };
  }

  return { ok: true, userId: data.user.id, email: data.user.email ?? null };
}
