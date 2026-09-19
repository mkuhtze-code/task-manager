import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { writeAdminAudit } from '@/lib/admin/audit';
import { logError } from '@/lib/logError';

/**
 * Read-only list of administrator membership.
 * Grant/revoke stays out of the product UI — insert/delete on public.admins
 * is done in Supabase (or a future highly-gated flow) so accidental
 * privilege changes cannot come from a compromised admin session alone.
 */
export async function GET(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  try {
    const { data: rows, error } = await supabaseAdmin
      .from('admins')
      .select('user_id,created_at')
      .order('created_at', { ascending: true });

    if (error) throw error;

    const adminIds = (rows || []).map((r) => r.user_id);
    const emailById = new Map<string, string | null>();
    const createdById = new Map<string, string | null>();

    if (adminIds.length > 0) {
      const { data: authData } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      for (const u of authData?.users || []) {
        if (adminIds.includes(u.id)) {
          emailById.set(u.id, u.email ?? null);
          createdById.set(u.id, u.created_at ?? null);
        }
      }
    }

    const admins = (rows || []).map((r) => ({
      userId: r.user_id,
      // Full email on this security surface only (same rationale as Users):
      // operators must be able to identify who holds admin. Listing is audited.
      email: emailById.get(r.user_id) ?? null,
      adminSince: r.created_at,
      accountCreatedAt: createdById.get(r.user_id) ?? null,
      isYou: r.user_id === access.userId,
    }));

    await writeAdminAudit({
      actorId: access.userId,
      action: 'admin_access.list',
      metadata: { count: admins.length },
    });

    return NextResponse.json({
      admins,
      generatedAt: new Date().toISOString(),
      note: 'Membership is read-only here. To grant or revoke admin, insert or delete a row in public.admins via Supabase (service role / SQL editor).',
    });
  } catch (error) {
    await logError('server', 'admin:admin-access:list', error, {}, access.userId);
    return NextResponse.json({ error: 'Could not load administrators.' }, { status: 500 });
  }
}
