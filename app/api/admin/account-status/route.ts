import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUser } from '@/lib/verifyUser';

async function requireAdmin(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) };

  const { data: admin } = await supabaseAdmin
    .from('admins')
    .select('user_id')
    .eq('user_id', auth.userId)
    .maybeSingle();
  if (!admin) return { error: NextResponse.json({ error: 'Not authorized.' }, { status: 403 }) };
  return { userId: auth.userId };
}

export async function GET(req: NextRequest) {
  const access = await requireAdmin(req);
  if ('error' in access) return access.error;

  const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (authError) return NextResponse.json({ error: 'Could not load users.' }, { status: 500 });

  const { data: statuses, error: statusError } = await supabaseAdmin
    .from('account_status')
    .select('user_id, status');
  if (statusError) return NextResponse.json({ error: 'Could not load account status.' }, { status: 500 });

  const statusByUser = new Map((statuses || []).map((status) => [status.user_id, status]));
  return NextResponse.json({
    users: (authUsers?.users || []).map((user) => ({
      id: user.id,
      email: user.email || null,
      createdAt: user.created_at,
      status: statusByUser.get(user.id)?.status || 'active',
    })),
  });
}

export async function POST(req: NextRequest) {
  const access = await requireAdmin(req);
  if ('error' in access) return access.error;

  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === 'string' ? body.userId : null;
  const status = body?.status === 'active' || body?.status === 'terminated' ? body.status : null;
  if (!userId || !status) return NextResponse.json({ error: 'A user and valid status are required.' }, { status: 400 });
  if (userId === access.userId && status === 'terminated') {
    return NextResponse.json({ error: 'An administrator cannot terminate their own account here.' }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from('account_status')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) return NextResponse.json({ error: 'Could not update account status.' }, { status: 500 });

  if (status === 'terminated') await supabaseAdmin.auth.admin.signOut(userId, 'global');
  return NextResponse.json({ ok: true, status });
}
