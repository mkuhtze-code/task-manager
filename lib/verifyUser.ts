import { supabaseAdmin } from '@/lib/supabaseAdmin';

type VerifyResult = { userId: string; error?: undefined } | { userId?: undefined; error: string; status: number };

// Verifies the caller actually is who they claim to be, by validating their
// Supabase access token server-side. The client sends this as a standard
// `Authorization: Bearer <token>` header — the token itself is the proof,
// not anything the client says in the request body.
export async function verifyUser(req: Request): Promise<VerifyResult> {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');

  if (!token) {
    return { error: 'Missing authorization token', status: 401 };
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data.user) {
    return { error: 'Invalid or expired session', status: 401 };
  }

  return { userId: data.user.id };
}
