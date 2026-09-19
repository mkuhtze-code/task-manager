import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { writeAdminAudit } from '@/lib/admin/audit';
import { logError } from '@/lib/logError';
import { sanitizeErrorContext } from '@/lib/admin/privacy';

const LIST_LIMIT = 100;

/** List recent error_logs for the admin Errors page. */
export async function GET(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  try {
    const { data, error } = await supabaseAdmin
      .from('error_logs')
      .select('id,source,route,message,stack,context,resolved,created_at')
      .order('created_at', { ascending: false })
      .limit(LIST_LIMIT);

    if (error) throw error;

    const items = (data || []).map((row) => ({
      id: row.id,
      source: row.source as 'server' | 'client',
      route: row.route || '',
      message: row.message,
      stack: row.stack,
      // Re-sanitize on read so older rows written before sanitization
      // do not leak tokens into the admin UI.
      context: sanitizeErrorContext(
        (row.context as Record<string, unknown> | null) ?? null
      ),
      resolved: Boolean(row.resolved),
      createdAt: row.created_at,
    }));

    await writeAdminAudit({
      actorId: access.userId,
      action: 'errors.list',
      metadata: { count: items.length },
    });

    return NextResponse.json({ items, generatedAt: new Date().toISOString() });
  } catch (error) {
    await logError('server', 'admin:errors:list', error, {}, access.userId);
    return NextResponse.json({ error: 'Could not load error log.' }, { status: 500 });
  }
}

/** Toggle resolved on a single error row. */
export async function PATCH(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  const body = await req.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : null;
  const resolved = typeof body?.resolved === 'boolean' ? body.resolved : null;

  if (!id || resolved === null) {
    return NextResponse.json(
      { error: 'id and resolved (boolean) are required.' },
      { status: 400 }
    );
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('error_logs')
      .update({ resolved })
      .eq('id', id)
      .select('id,resolved')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: 'Error entry not found.' }, { status: 404 });
    }

    await writeAdminAudit({
      actorId: access.userId,
      action: 'errors.resolve',
      targetType: 'error_log',
      targetId: id,
      metadata: { resolved },
    });

    return NextResponse.json({ id: data.id, resolved: data.resolved });
  } catch (error) {
    await logError('server', 'admin:errors:resolve', error, { id }, access.userId);
    return NextResponse.json({ error: 'Could not update error entry.' }, { status: 500 });
  }
}
