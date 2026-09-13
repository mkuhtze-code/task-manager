// Pure builders for the Admin Activity feed. The /api/admin/activity route
// fetches small, bounded slices of the real tables (each source limited to a
// window + row cap) and hands the rows to the functions below, which convert
// them into chronological ActivityEvent rows. Keeping them here, free of any
// Supabase/Next imports, makes the mapping unit-testable and mirrors the
// overview's data-shape approach.
//
// Only events Dokkit genuinely records are produced. Nothing is invented:
// each builder maps one real column timestamp to one event.

import type { ActivityEvent } from '@/lib/admin/types';

export const ACTIVITY_WINDOW_KEYS = ['24h', '7d', '30d', '90d'] as const;
export type ActivityWindowKey = (typeof ACTIVITY_WINDOW_KEYS)[number];

export const ACTIVITY_FILTER_KEYS = ['all', 'users', 'product', 'feedback', 'errors'] as const;
export type ActivityFilterKey = (typeof ACTIVITY_FILTER_KEYS)[number];

export const WINDOW_HOURS: Record<ActivityWindowKey, number> = {
  '24h': 24,
  '7d': 24 * 7,
  '30d': 24 * 30,
  '90d': 24 * 90,
};

export function isWindowKey(value: unknown): value is ActivityWindowKey {
  return typeof value === 'string' && (ACTIVITY_WINDOW_KEYS as readonly string[]).includes(value);
}

export function isFilterKey(value: unknown): value is ActivityFilterKey {
  return typeof value === 'string' && (ACTIVITY_FILTER_KEYS as readonly string[]).includes(value);
}

export function windowCutoff(window: ActivityWindowKey, now = new Date()): string {
  return new Date(now.getTime() - WINDOW_HOURS[window] * 3_600_000).toISOString();
}

// ── Row shapes (thin subsets of the real tables) ──────────────────
export type AuthUserRow = { id: string; email: string | null; created_at: string };
export type AccountStatusRow = {
  user_id: string;
  status: 'active' | 'terminated';
  created_at: string;
  updated_at: string;
};
export type TaskCreatedRow = { id: string; text: string; created_at: string };
export type TaskCompletedRow = { id: string; text: string; completed_at: string };
export type JobRow = { id: string; name: string; created_at: string };
export type MeetingRow = {
  id: string;
  text: string;
  source: 'manual' | 'outlook';
  start_time: string | null;
  created_at: string;
};
export type TripRow = { id: string; name: string; start_date: string; end_date: string; created_at: string };
export type FeedbackRow = {
  id: string;
  message: string;
  is_anonymous: boolean;
  submitter_email: string | null;
  created_at: string;
};
export type ReplyRow = { id: string; message: string; created_at: string };
export type ErrorRow = { id: string; source: 'server' | 'client'; route: string | null; message: string; created_at: string };

// account_status.updated_at equals created_at on the row's lazy creation
// (signup), so a real status flip is only ever a later update. The same
// threshold the Overview RPC uses distinguishes the two.
export const STATUS_CHANGE_THRESHOLD_MS = 1500;

const SLICE = 120;

export function accountEvents(users: AuthUserRow[], cutoff: string, limit = 100): ActivityEvent[] {
  return users
    .filter((u) => u.created_at >= cutoff)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limit)
    .map((u) => ({
      id: `account-${u.id}`,
      type: 'account' as const,
      title: `${u.email || 'A new user'} joined Dokkit`,
      timestamp: u.created_at,
      href: '/admin/users',
    }));
}

export function accountStatusEvents(
  rows: AccountStatusRow[],
  emails: Map<string, string | null>,
  cutoff: string,
  limit = 100
): ActivityEvent[] {
  return rows
    .filter((r) => r.updated_at >= cutoff)
    .filter((r) => new Date(r.updated_at).getTime() - new Date(r.created_at).getTime() > STATUS_CHANGE_THRESHOLD_MS)
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .slice(0, limit)
    .map((r) => ({
      id: `status-${r.user_id}-${r.updated_at}`,
      type: 'account_status' as const,
      title: `${emails.get(r.user_id) || 'An account'} set to ${r.status}`,
      timestamp: r.updated_at,
      href: '/admin/users',
    }));
}

export function taskCreatedEvents(rows: TaskCreatedRow[], limit = 200): ActivityEvent[] {
  return rows.slice(0, limit).map((t) => ({
    id: `task_created-${t.id}`,
    type: 'task_created' as const,
    title: 'Task created',
    detail: t.text.slice(0, SLICE),
    timestamp: t.created_at,
  }));
}

export function taskCompletedEvents(rows: TaskCompletedRow[], limit = 200): ActivityEvent[] {
  return rows.slice(0, limit).map((t) => ({
    id: `task_completed-${t.id}`,
    type: 'task_completed' as const,
    title: 'Task completed',
    detail: t.text.slice(0, SLICE),
    timestamp: t.completed_at,
  }));
}

export function jobCreatedEvents(rows: JobRow[], limit = 100): ActivityEvent[] {
  return rows.slice(0, limit).map((j) => ({
    id: `job_created-${j.id}`,
    type: 'job_created' as const,
    title: 'Job created',
    detail: j.name.slice(0, SLICE),
    timestamp: j.created_at,
  }));
}

export function meetingCreatedEvents(rows: MeetingRow[], limit = 100): ActivityEvent[] {
  return rows.slice(0, limit).map((m) => ({
    id: `meeting_created-${m.id}`,
    type: 'meeting_created' as const,
    title: 'Meeting recorded',
    detail: `${m.text.slice(0, SLICE)}${m.source === 'outlook' ? ' · from Outlook' : ''}`,
    timestamp: m.created_at,
  }));
}

function shortDate(date: string): string {
  const [y, m, day] = date.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function tripCreatedEvents(rows: TripRow[], limit = 50): ActivityEvent[] {
  return rows.slice(0, limit).map((t) => ({
    id: `trip_created-${t.id}`,
    type: 'trip_created' as const,
    title: 'Trip created',
    detail: `${t.name.slice(0, SLICE)} · ${shortDate(t.start_date)} → ${shortDate(t.end_date)}`,
    timestamp: t.created_at,
  }));
}

export function feedbackEvents(rows: FeedbackRow[], limit = 100): ActivityEvent[] {
  return rows.slice(0, limit).map((f) => ({
    id: `feedback-${f.id}`,
    type: 'feedback' as const,
    title: `Feedback received${f.is_anonymous ? ' (anonymous)' : ` from ${f.submitter_email || 'a signed-in user'}`}`,
    detail: f.message.slice(0, SLICE),
    timestamp: f.created_at,
    href: '/admin/feedback',
  }));
}

export function replyEvents(rows: ReplyRow[], limit = 50): ActivityEvent[] {
  return rows.slice(0, limit).map((r) => ({
    id: `reply-${r.id}-${r.created_at}`,
    type: 'feedback_reply' as const,
    title: 'Admin replied to a feedback thread',
    detail: r.message.slice(0, SLICE),
    timestamp: r.created_at,
    href: '/admin/feedback',
  }));
}

export function errorEvents(rows: ErrorRow[], limit = 100): ActivityEvent[] {
  return rows.slice(0, limit).map((e) => ({
    id: `error-${e.id}`,
    type: 'error' as const,
    title: `Error recorded [${e.source}]${e.route ? ` · ${e.route}` : ''}`,
    detail: e.message.slice(0, SLICE),
    timestamp: e.created_at,
    href: '/admin/errors',
  }));
}

// Join every source group into one newest-first feed. Ties fall back to the
// stable sort order so the feed stays deterministic for identical timestamps.
export function mergeEvents(groups: ActivityEvent[][]): ActivityEvent[] {
  return groups
    .flat()
    .sort((a, b) => (a.timestamp === b.timestamp ? 0 : a.timestamp > b.timestamp ? -1 : 1));
}