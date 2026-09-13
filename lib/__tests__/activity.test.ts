import { describe, it, expect } from 'vitest';
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
  STATUS_CHANGE_THRESHOLD_MS,
} from '../admin/activity';

const T0 = '2026-09-10T12:00:00.000Z';

const users = [
  { id: 'old', email: 'old@example.com', created_at: '2026-08-01T00:00:00.000Z' },
  { id: 'late', email: 'late@example.com', created_at: '2026-09-11T03:00:00.000Z' },
  { id: 'newest', email: 'new@example.com', created_at: '2026-09-12T00:00:00.000Z' },
];

describe('activity filters + windows', () => {
  it('accepts only real window and filter keys', () => {
    expect(isWindowKey('7d')).toBe(true);
    expect(isWindowKey('24h')).toBe(true);
    expect(isWindowKey('month')).toBe(false);
    expect(isFilterKey('all')).toBe(true);
    expect(isFilterKey('product')).toBe(true);
    expect(isFilterKey('system')).toBe(false);
  });

  it('computes cutoffs from window hours', () => {
    const now = new Date('2026-09-13T00:00:00.000Z');
    expect(windowCutoff('24h', now)).toBe('2026-09-12T00:00:00.000Z');
    expect(windowCutoff('7d', now)).toBe('2026-09-06T00:00:00.000Z');
    expect(windowCutoff('30d', now)).toBe('2026-08-14T00:00:00.000Z');
    expect(windowCutoff('90d', now)).toBe('2026-06-15T00:00:00.000Z');
  });
});

describe('accountEvents (signups)', () => {
  it('keeps only signups inside the window, newest first, capped', () => {
    const events = accountEvents(users, T0);
    expect(events.map((e) => e.type)).toEqual(['account', 'account']);
    expect(events[0].timestamp).toBe('2026-09-12T00:00:00.000Z');
    expect(events[0].title).toBe('new@example.com joined Dokkit');
    expect(events[0].href).toBe('/admin/users');
  });

  it('drops users outside the window', () => {
    const events = accountEvents(users, '2026-09-10T12:00:00.000Z');
    expect(events).toHaveLength(2);
  });

  it('applies the cap', () => {
    expect(accountEvents(users, '2000-01-01T00:00:00.000Z', 1)).toHaveLength(1);
  });

  it('falls back to a generic title without an email', () => {
    const events = accountEvents([{ id: 'x', email: null, created_at: '2026-09-12T00:00:00.000Z' }], T0);
    expect(events[0].title).toBe('A new user joined Dokkit');
  });
});

describe('accountStatusEvents (real flips only)', () => {
  const emails = new Map([['u1', 'a@example.com']]);

  it('ignores the lazy creation row (created == updated)', () => {
    const rows = [
      { user_id: 'u1', status: 'active' as const, created_at: T0, updated_at: T0 },
    ];
    expect(accountStatusEvents(rows, emails, T0)).toHaveLength(0);
  });

  it('emits a change when updated_at is meaningfully later than created_at', () => {
    const later = new Date(new Date(T0).getTime() + STATUS_CHANGE_THRESHOLD_MS + 1).toISOString();
    const rows = [{ user_id: 'u1', status: 'terminated' as const, created_at: T0, updated_at: later }];
    const events = accountStatusEvents(rows, emails, T0);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('account_status');
    expect(events[0].title).toBe('a@example.com set to terminated');
    expect(events[0].timestamp).toBe(later);
  });

  it('drops flips outside the window', () => {
    const rows = [
      { user_id: 'u1', status: 'active' as const, created_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-02T00:00:00.000Z' },
    ];
    expect(accountStatusEvents(rows, emails, T0)).toHaveLength(0);
  });
});

describe('product events', () => {
  it('builds task created and completed events', () => {
    const created = taskCreatedEvents([{ id: 't1', text: '  Write up   the quote  ', created_at: T0 }]);
    expect(created[0]).toMatchObject({ type: 'task_created', title: 'Task created', timestamp: T0 });
    const completed = taskCompletedEvents([{ id: 't1', text: 'Write up the quote', completed_at: T0 }]);
    expect(completed[0]).toMatchObject({ type: 'task_completed', title: 'Task completed', timestamp: T0 });
  });

  it('builds job, meeting and trip events with their details', () => {
    const job = jobCreatedEvents([{ id: 'j1', name: 'Morpeth street', created_at: T0 }]);
    expect(job[0].type).toBe('job_created');
    expect(job[0].detail).toBe('Morpeth street');

    const ms = meetingCreatedEvents([
      { id: 'm1', text: 'Zelo', source: 'manual' as const, start_time: null, created_at: T0 },
      { id: 'm2', text: 'Sync', source: 'outlook' as const, start_time: null, created_at: T0 },
    ]);
    expect(ms.map((e) => e.detail)).toEqual(['Zelo', 'Sync · from Outlook']);

    const trip = tripCreatedEvents([{ id: 't1', name: 'Gold Coast', start_date: '2026-10-16', end_date: '2026-10-26', created_at: T0 }]);
    expect(trip[0].type).toBe('trip_created');
    expect(trip[0].detail).toMatch(/^Gold Coast .* → .*$/);
  });
});

describe('feedback, replies and errors', () => {
  it('labels anonymous vs signed-in feedback', () => {
    const anon = feedbackEvents([{ id: 'f1', message: 'hi', is_anonymous: true, submitter_email: null, created_at: T0 }]);
    expect(anon[0].title).toBe('Feedback received (anonymous)');
    const signed = feedbackEvents([{ id: 'f2', message: 'hi', is_anonymous: false, submitter_email: 'a@b.c', created_at: T0 }]);
    expect(signed[0].title).toBe('Feedback received from a@b.c');
    expect(signed[0].href).toBe('/admin/feedback');
  });

  it('builds admin reply events', () => {
    const replies = replyEvents([{ id: 'r1', message: 'Yes, very nice indeed', created_at: T0 }]);
    expect(replies[0]).toMatchObject({ type: 'feedback_reply', title: 'Admin replied to a feedback thread', href: '/admin/feedback' });
    expect(replies[0].detail).toBe('Yes, very nice indeed');
  });

  it('builds error events with route in the title', () => {
    const errs = errorEvents([
      { id: 'e1', source: 'server' as const, route: '/api/x', message: 'boom', created_at: T0 },
      { id: 'e2', source: 'client' as const, route: null, message: 'boom', created_at: T0 },
    ]);
    expect(errs[0].title).toBe('Error recorded [server] · /api/x');
    expect(errs[1].title).toBe('Error recorded [client]');
    expect(errs[0].href).toBe('/admin/errors');
  });

  it('truncates long details to 120 characters', () => {
    const long = 'x'.repeat(1000);
    const events = taskCreatedEvents([{ id: 't1', text: long, created_at: T0 }]);
    expect(events[0].detail).toHaveLength(120);
  });
});

describe('mergeEvents', () => {
  it('sorts newest-first across groups', () => {
    const a = [{ id: 'a1', type: 'job_created' as const, title: 'Job created', timestamp: '2026-09-10T00:00:00.000Z' }];
    const b = [{ id: 'b1', type: 'task_created' as const, title: 'Task created', timestamp: '2026-09-12T00:00:00.000Z' }];
    const c = [{ id: 'c1', type: 'error' as const, title: 'Error recorded', timestamp: '2026-09-11T00:00:00.000Z' }];
    const merged = mergeEvents([a, b, c]);
    expect(merged.map((e) => e.id)).toEqual(['b1', 'c1', 'a1']);
  });

  it('returns an empty array for no groups', () => {
    expect(mergeEvents([])).toEqual([]);
  });
});