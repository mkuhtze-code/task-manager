import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { writeAdminAudit } from '@/lib/admin/audit';
import { maskEmail } from '@/lib/admin/privacy';
import { logError } from '@/lib/logError';

const PAGE_LIMIT_MAX = 100;
const DEFAULT_LIMIT = 50;

const ACTION_FILTERS = [
  'all',
  'users',
  'feedback',
  'activity',
  'overview',
  'fcm',
  'errors',
  'audit',
] as const;

type ActionFilter = (typeof ACTION_FILTERS)[number];

function isActionFilter(value: string): value is ActionFilter {
  return (ACTION_FILTERS as readonly string[]).includes(value);
}

function parsePageParam(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function actionMatchesFilter(action: string, filter: ActionFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'users') return action.startsWith('users.');
  if (filter === 'feedback') return action.startsWith('feedback.');
  if (filter === 'activity') return action.startsWith('activity.');
  if (filter === 'overview') return action.startsWith('overview.');
  if (filter === 'fcm') return action.startsWith('fcm.');
  if (filter === 'errors') return action.startsWith('errors.');
  if (filter === 'audit') return action.startsWith('audit.');
  return true;
}

export type AuditLogEvent = {
  id: string;
  action: string;
  actorId: string | null;
  actorLabel: string;
  targetType: string | null;
  targetId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export async function GET(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  const params = req.nextUrl.searchParams;
  const filterParam = params.get('filter') ?? 'all';
  const filter: ActionFilter = isActionFilter(filterParam) ? filterParam : 'all';
  const offset = parsePageParam(params.get('offset'), 0, 0, 1_000_000);
  const limit = parsePageParam(params.get('limit'), DEFAULT_LIMIT, 1, PAGE_LIMIT_MAX);

  try {
    // Fetch a bounded window then filter in memory when needed so we keep
    // a single indexed scan on created_at. For "all", offset/limit map
    // directly to the query.
    const fetchCap = filter === 'all' ? offset + limit : Math.min(1000, offset + limit + 200);

    const { data, error } = await supabaseAdmin
      .from('admin_audit_events')
      .select('id,actor_id,action,target_type,target_id,metadata,created_at')
      .order('created_at', { ascending: false })
      .limit(fetchCap);

    if (error) throw error;

    const rows = data || [];
    const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
    const emailById = new Map<string, string | null>();

    if (actorIds.length > 0) {
      const { data: authData } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      for (const u of authData?.users || []) {
        if (actorIds.includes(u.id)) {
          emailById.set(u.id, u.email ?? null);
        }
      }
    }

    const filtered = rows.filter((r) => actionMatchesFilter(r.action, filter));
    const page = filtered.slice(offset, offset + limit);

    const events: AuditLogEvent[] = page.map((r) => ({
      id: r.id,
      action: r.action,
      actorId: r.actor_id,
      actorLabel: r.actor_id ? maskEmail(emailById.get(r.actor_id) ?? null) : 'unknown',
      targetType: r.target_type,
      targetId: r.target_id,
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      createdAt: r.created_at,
    }));

    // Viewing the audit log is itself a privileged read — record it, but
    // keep metadata minimal to avoid recursive noise.
    await writeAdminAudit({
      actorId: access.userId,
      action: 'audit.list',
      metadata: { filter, offset, limit, returned: events.length },
    });

    return NextResponse.json({
      events,
      total: filtered.length,
      offset,
      limit,
      hasMore: offset + events.length < filtered.length,
      filter,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    await logError('server', 'admin:audit-log', error, { filter }, access.userId);
    return NextResponse.json({ error: 'Could not load the audit log.' }, { status: 500 });
  }
}
