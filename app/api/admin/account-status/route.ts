import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { writeAdminAudit } from '@/lib/admin/audit';

export async function GET(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (authError) return NextResponse.json({ error: 'Could not load users.' }, { status: 500 });

  const { data: statuses, error: statusError } = await supabaseAdmin
    .from('account_status')
    .select('user_id, status');
  if (statusError) return NextResponse.json({ error: 'Could not load account status.' }, { status: 500 });

  const statusByUser = new Map((statuses || []).map((status) => [status.user_id, status]));
  const users = (authUsers?.users || []).map((user) => ({
    id: user.id,
    email: user.email || null,
    createdAt: user.created_at,
    status: (statusByUser.get(user.id)?.status as 'active' | 'terminated') || 'active',
  }));

  // Users page is the intentional place full emails are shown — audit the list.
  await writeAdminAudit({
    actorId: access.userId,
    action: 'users.list',
    metadata: { count: users.length },
  });

  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null);
  const userId = typeof body?.userId === 'string' ? body.userId : null;
  const status = body?.status === 'active' || body?.status === 'terminated' ? body.status : null;
  if (!userId || !status) {
    return NextResponse.json({ error: 'A user and valid status are required.' }, { status: 400 });
  }
  if (userId === access.userId && status === 'terminated') {
    return NextResponse.json(
      { error: 'An administrator cannot terminate their own account here.' },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin
    .from('account_status')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) return NextResponse.json({ error: 'Could not update account status.' }, { status: 500 });

  if (status === 'terminated') await supabaseAdmin.auth.admin.signOut(userId, 'global');

  await writeAdminAudit({
    actorId: access.userId,
    action: 'users.status_change',
    targetType: 'user',
    targetId: userId,
    metadata: { status },
  });

  return NextResponse.json({ ok: true, status });
}
