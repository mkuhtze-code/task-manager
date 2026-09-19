import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { logError } from '@/lib/logError';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { writeAdminAudit } from '@/lib/admin/audit';
import {
  accountEvents,
  accountStatusEvents,
  errorEvents,
  feedbackEvents,
  isFilterKey,
  isWindowKey,
  jobCreatedEvents,
  meetingCreatedEvents,
  mergeEvents,
  replyEvents,
  taskCompletedEvents,
  taskCreatedEvents,
  tripCreatedEvents,
  windowCutoff,
  type AccountStatusRow,
  type ActivityFilterKey,
  type ActivityWindowKey,
  type AuthUserRow,
  type TaskCompletedRow,
  type TaskCreatedRow,
} from '@/lib/admin/activity';
import type { ActivityEvent } from '@/lib/admin/types';

const PAGE_LIMIT_MAX = 200;

function parsePageParam(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export type ActivityPayload = {
  events: ActivityEvent[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  window: ActivityWindowKey;
  filter: ActivityFilterKey;
  generatedAt: string;
};

export async function GET(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  const params = req.nextUrl.searchParams;
  const windowParam = params.get('window') ?? '7d';
  const filterParam = params.get('filter') ?? 'all';
  const window: ActivityWindowKey = isWindowKey(windowParam) ? windowParam : '7d';
  const filter: ActivityFilterKey = isFilterKey(filterParam) ? filterParam : 'all';
  const offset = parsePageParam(params.get('offset'), 0, 0, 1_000_000);
  const pageSize = parsePageParam(params.get('limit'), 100, 1, PAGE_LIMIT_MAX);

  try {
    const payload = await buildActivity({ window, filter, offset, pageSize });
    await writeAdminAudit({
      actorId: access.userId,
      action: 'activity.list',
      metadata: { window, filter, offset, limit: pageSize, returned: payload.events.length },
    });
    return NextResponse.json(payload);
  } catch (error) {
    await logError('server', 'admin:activity', error, { window, filter }, access.userId);
    return NextResponse.json({ error: 'Could not load activity.' }, { status: 500 });
  }
}

const FILTER_NEEDS: Record<ActivityFilterKey, string[]> = {
  all: ['users', 'status', 'tasks', 'jobs', 'meetings', 'trips', 'feedback', 'replies', 'errors'],
  users: ['users', 'status'],
  product: ['tasks', 'jobs', 'meetings', 'trips'],
  feedback: ['feedback', 'replies'],
  errors: ['errors'],
};

async function buildActivity({
  window,
  filter,
  offset,
  pageSize,
}: {
  window: ActivityWindowKey;
  filter: ActivityFilterKey;
  offset: number;
  pageSize: number;
}): Promise<ActivityPayload> {
  const generatedAt = new Date().toISOString();
  const cutoff = windowCutoff(window);
  const needs = new Set(FILTER_NEEDS[filter]);

  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (authError) throw new Error('Could not load users.');
  const users = (authData?.users ?? []) as AuthUserRow[];
  const emails = new Map(users.map((u) => [u.id, u.email ?? null]));

  const loaders: Record<string, () => Promise<ActivityEvent[]>> = {};

  if (needs.has('users')) {
    loaders.users = async () => accountEvents(users, cutoff);
  }

  if (needs.has('status')) {
    loaders.status = async () => {
      const { data, error } = await supabaseAdmin
        .from('account_status')
        .select('user_id,status,created_at,updated_at')
        .gte('updated_at', cutoff)
        .limit(500);
      if (error) throw new Error('Could not load account status.');
      return accountStatusEvents((data ?? []) as AccountStatusRow[], emails, cutoff);
    };
  }

  // Product events: ids + timestamps only — no task/meeting/job/trip text.
  if (needs.has('tasks')) {
    loaders.tasks = async () => {
      const createdQuery = supabaseAdmin
        .from('tasks')
        .select('id,created_at')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(200);
      const completedQuery = supabaseAdmin
        .from('tasks')
        .select('id,completed_at')
        .gte('completed_at', cutoff)
        .order('completed_at', { ascending: false })
        .limit(200);
      const [created, completed] = await Promise.all([createdQuery, completedQuery]);
      if (created.error) throw new Error('Could not load task creation activity.');
      if (completed.error) throw new Error('Could not load task completion activity.');
      return [
        ...taskCreatedEvents((created.data ?? []) as TaskCreatedRow[]),
        ...taskCompletedEvents((completed.data ?? []) as TaskCompletedRow[]),
      ];
    };
  }

  if (needs.has('jobs')) {
    loaders.jobs = async () => {
      const { data, error } = await supabaseAdmin
        .from('jobs')
        .select('id,created_at')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new Error('Could not load job activity.');
      return jobCreatedEvents(data ?? []);
    };
  }

  if (needs.has('meetings')) {
    loaders.meetings = async () => {
      const { data, error } = await supabaseAdmin
        .from('meetings')
        .select('id,source,created_at')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new Error('Could not load meeting activity.');
      return meetingCreatedEvents(data ?? []);
    };
  }

  if (needs.has('trips')) {
    loaders.trips = async () => {
      const { data, error } = await supabaseAdmin
        .from('trips')
        .select('id,created_at')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error('Could not load trip activity.');
      return tripCreatedEvents(data ?? []);
    };
  }

  if (needs.has('feedback')) {
    loaders.feedback = async () => {
      const { data, error } = await supabaseAdmin
        .from('feedback')
        .select('id,message,is_anonymous,submitter_email,created_at')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new Error('Could not load feedback activity.');
      return feedbackEvents(data ?? []);
    };
  }

  if (needs.has('replies')) {
    loaders.replies = async () => {
      const { data, error } = await supabaseAdmin
        .from('feedback_replies')
        .select('id,created_at')
        .eq('author_type', 'admin')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error('Could not load feedback reply activity.');
      return replyEvents(data ?? []);
    };
  }

  if (needs.has('errors')) {
    loaders.errors = async () => {
      const { data, error } = await supabaseAdmin
        .from('error_logs')
        .select('id,source,route,message,created_at')
        .gte('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new Error('Could not load error activity.');
      return errorEvents(data ?? []);
    };
  }

  const batches = await Promise.all(Object.values(loaders).map((run) => run()));
  const merged = mergeEvents(batches);
  const events = merged.slice(offset, offset + pageSize);

  return {
    events,
    total: merged.length,
    offset,
    limit: pageSize,
    hasMore: offset + events.length < merged.length,
    window,
    filter,
    generatedAt,
  };
}
