import { describe, it, expect } from 'vitest';
import { normalizeAdminAggregates } from '../admin/overviewAggregate';
import { summarizeAccuracy } from '../thinking/observations/estimateAccuracy';

// ── normalizeAdminAggregates ──────────────────────────────────────
// The RPC jsonb payload is untyped; normalization must map it to the
// typed shape with safe defaults and drop malformed rows.

const fullPayload = {
  tasks: {
    total: 100,
    open: 60,
    dueToday: 10,
    created30d: 40,
    completed7d: 30,
    completed24h: 5,
    completed30d: 50,
    doneTotal: 40,
  },
  activeUsers7d: 12,
  jobs: { total: 20, created30d: 8, active30d: 5 },
  meetings: { total: 90, m30d: 30, w7d: 20, manual: 70, outlook: 20 },
  meetingEvidence: { observations: 4, decisions: 3, actions: 2, media: 9, participants: 7 },
  travel: {
    tripsTotal: 11,
    trips30d: 4,
    tripsActive: 2,
    tripDays: 33,
    activitiesTotal: 99,
    activitiesDone: 44,
    accommodationsTotal: 6,
  },
  predictions: { total: 77, outcomes: 50, averageRatio: 1.1, accuracyPercent: 91, medianRatio: 1.05 },
  accounts: { active: 88, terminated: 1, recentChanges: [{ user_id: 'u1', status: 'terminated', updated_at: '2024-02-01T00:00:00.000Z' }] },
  userSettings: { tiers: { trusted_tester: 3, free: 10, premium: 2 }, notOnboarded: 4 },
  surfaces: { today: 21, jobs: 8, travel: 1 },
  errors: {
    h24: 2,
    d7: 5,
    unresolved: 3,
    dayBuckets: [{ day: '2026-09-10', value: 2 }],
    recent: [{ id: 'e1', source: 'server', route: '/api/x', message: 'boom', created_at: '2026-09-11T00:00:00.000Z' }],
  },
  feedback: {
    total: 30,
    replied: 11,
    recent: [
      {
        id: 'f1',
        submitter_email: 'a@b.c',
        is_anonymous: false,
        message: 'hello',
        page_context: '/today',
        created_at: '2026-09-11T00:00:00.000Z',
        replies: 2,
      },
    ],
    adminRepliesRecent: [{ feedback_id: 'f1', created_at: '2026-09-11T01:00:00.000Z' }],
  },
  integrations: { adminSubscriptions: 1 },
};

it('maps a fully populated payload through unchanged', () => {
  const out = normalizeAdminAggregates(fullPayload);
  expect(out.tasks.total).toBe(100);
  expect(out.tasks.dueToday).toBe(10);
  expect(out.activeUsers7d).toBe(12);
  expect(out.jobs.active30d).toBe(5);
  expect(out.meetings.outlook).toBe(20);
  expect(out.meetingEvidence.participants).toBe(7);
  expect(out.travel.accommodationsTotal).toBe(6);
  expect(out.predictions.medianRatio).toBe(1.05);
  expect(out.accounts.recentChanges).toEqual([{ user_id: 'u1', status: 'terminated', updated_at: '2024-02-01T00:00:00.000Z' }]);
  expect(out.userSettings.tiers).toEqual({ trusted_tester: 3, free: 10, premium: 2 });
  expect(out.userSettings.notOnboarded).toBe(4);
  expect(out.surfaces).toEqual({ today: 21, jobs: 8, travel: 1 });
  expect(out.errors.dayBuckets).toEqual([{ day: '2026-09-10', value: 2 }]);
  expect(out.errors.recent[0]).toMatchObject({ id: 'e1', route: '/api/x' });
  expect(out.feedback.recent[0]).toMatchObject({ id: 'f1', is_anonymous: false, replies: 2, page_context: '/today' });
  expect(out.feedback.replied).toBe(11);
  expect(out.integrations.adminSubscriptions).toBe(1);
});

it('defaults an empty payload to zeros, empty arrays and neutral accuracy', () => {
  const out = normalizeAdminAggregates({});
  expect(out.tasks).toEqual({
    total: 0,
    open: 0,
    dueToday: 0,
    created30d: 0,
    completed7d: 0,
    completed24h: 0,
    completed30d: 0,
    doneTotal: 0,
  });
  expect(out.predictions).toEqual({ total: 0, outcomes: 0, averageRatio: 1, accuracyPercent: 100, medianRatio: 1 });
  expect(out.accounts.recentChanges).toEqual([]);
  expect(out.errors.dayBuckets).toEqual([]);
  expect(out.errors.recent).toEqual([]);
  expect(out.feedback.recent).toEqual([]);
  expect(out.feedback.adminRepliesRecent).toEqual([]);
  expect(out.userSettings.tiers).toEqual({ trusted_tester: 0, free: 0, premium: 0 });
  expect(out.surfaces).toEqual({ today: 0, jobs: 0, travel: 0 });
});

it('handles null input without throwing', () => {
  const out = normalizeAdminAggregates(null);
  expect(out.tasks.total).toBe(0);
  expect(out.predictions.averageRatio).toBe(1);
});

it('coerces malformed values to safe defaults', () => {
  const out = normalizeAdminAggregates({
    tasks: { total: 'many', open: null, completed7d: Infinity },
    predictions: { outcomes: 'x', averageRatio: null, accuracyPercent: undefined },
    errors: { dayBuckets: [{ day: null, value: '3' }, { day: '2026-09-01', value: 2 }], recent: [{ id: null, message: 'x' }, { id: 'e9', source: 'client', route: null, message: '', created_at: '2026-09-02T00:00:00Z' }] },
    feedback: { recent: [{ id: 'f9', is_anonymous: 'yes' }], adminRepliesRecent: [{ feedback_id: null }, { feedback_id: 'fa', created_at: '2026-09-03T00:00:00Z' }] },
    accounts: { recentChanges: [{ user_id: 'u9', status: 'active', updated_at: '2026-09-04T00:00:00Z' }, { status: 'terminated' }] },
  });
  expect(out.tasks.total).toBe(0);
  expect(out.tasks.completed7d).toBe(0);
  expect(out.predictions).toEqual({ total: 0, outcomes: 0, averageRatio: 1, accuracyPercent: 100, medianRatio: 1 });
  expect(out.errors.dayBuckets).toEqual([{ day: '2026-09-01', value: 2 }]);
  expect(out.errors.recent).toEqual([{ id: 'e9', source: 'client', route: null, message: '', created_at: '2026-09-02T00:00:00Z' }]);
  expect(out.feedback.recent).toEqual([{ id: 'f9', submitter_email: null, is_anonymous: false, message: '', page_context: null, created_at: '', replies: 0 }]);
  expect(out.feedback.adminRepliesRecent).toEqual([{ feedback_id: 'fa', created_at: '2026-09-03T00:00:00Z' }]);
  expect(out.accounts.recentChanges).toEqual([{ user_id: 'u9', status: 'active', updated_at: '2026-09-04T00:00:00Z' }]);
});

// ── Accuracy math equivalence ─────────────────────────────────────
// The RPC computes the estimate-accuracy summary in SQL
// (schema.sql → admin_overview_aggregates). This port mirrors those SQL
// formulas (ratio = actual / GREATEST(estimate,1), percentile_cont(0.5)
// for the median, floor(LEAST(100, (1/GREATEST(avg,0.01))*100) + 0.5) for
// accuracy) and asserts it produces the same numbers as the existing
// lib summarizeAccuracy(), which the previous route used directly.

function sqlAccuracy(rows: { estimated_mins: number; actual_mins: number | null }[]) {
  const ratios = rows
    .filter((p) => p.actual_mins !== null && p.actual_mins !== undefined)
    .map((p) => (p.actual_mins as number) / Math.max(p.estimated_mins, 1));
  const outcomes = ratios.length;
  const averageRatio = outcomes === 0 ? 1 : ratios.reduce((a, b) => a + b, 0) / outcomes;

  const sorted = [...ratios].sort((a, b) => a - b);
  let medianRatio = 1;
  if (sorted.length === 1) medianRatio = sorted[0];
  else if (sorted.length > 1) {
    const rank = (sorted.length - 1) * 0.5;
    const lo = Math.floor(rank);
    medianRatio = rank % 1 === 0 ? sorted[rank] : (sorted[lo] + sorted[lo + 1]) / 2;
  }

  const accuracyPercent =
    outcomes === 0
      ? 100
      : Math.floor(Math.min(100, (1 / Math.max(averageRatio, 0.01)) * 100) + 0.5);

  return { total: outcomes, averageRatio, accuracyPercent, medianRatio };
}

function toObservations(rows: { estimated_mins: number; actual_mins: number | null }[]) {
  return rows
    .filter((p) => p.actual_mins !== null && p.actual_mins !== undefined)
    .map((p) => ({
      kind: 'estimate_accuracy' as const,
      taskText: '',
      clusterLabel: null,
      clusterCount: 0,
      estimatedMins: Math.max(p.estimated_mins, 1),
      actualMins: p.actual_mins as number,
      ratio: (p.actual_mins as number) / Math.max(p.estimated_mins, 1),
      confidence: 'low' as const,
      observedAt: new Date().toISOString(),
    }));
}

const yieldsEqualAccuracy = (rows: { estimated_mins: number; actual_mins: number | null }[]) => {
  const sql = sqlAccuracy(rows);
  const summary = summarizeAccuracy(toObservations(rows));
  expect(sql.total).toBe(summary.total);
  expect(sql.averageRatio).toBeCloseTo(summary.averageRatio, 9);
  expect(sql.medianRatio).toBeCloseTo(summary.medianRatio, 9);
  expect(sql.accuracyPercent).toBe(summary.accuracyPercent);
};

it('matches summarizeAccuracy with no outcomes', () => {
  yieldsEqualAccuracy([]);
  yieldsEqualAccuracy([{ estimated_mins: 30, actual_mins: null }]);
});

it('matches summarizeAccuracy with a single outcome', () => {
  yieldsEqualAccuracy([{ estimated_mins: 30, actual_mins: 45 }]);
  yieldsEqualAccuracy([{ estimated_mins: 0, actual_mins: 10 }]);
});

it('matches summarizeAccuracy for even and odd outcome counts', () => {
  yieldsEqualAccuracy([
    { estimated_mins: 30, actual_mins: 15 },
    { estimated_mins: 60, actual_mins: 90 },
    { estimated_mins: 20, actual_mins: 21 },
    { estimated_mins: 45, actual_mins: 30 },
  ]);
  yieldsEqualAccuracy([
    { estimated_mins: 30, actual_mins: 15 },
    { estimated_mins: 60, actual_mins: 90 },
    { estimated_mins: 20, actual_mins: 21 },
  ]);
});

it('matches summarizeAccuracy when every outcome is zero', () => {
  yieldsEqualAccuracy([
    { estimated_mins: 30, actual_mins: 0 },
    { estimated_mins: 45, actual_mins: 0 },
  ]);
});

it('matches summarizeAccuracy on large random datasets', () => {
  const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  for (let trial = 0; trial < 25; trial++) {
    const rows = Array.from({ length: rand(0, 40) }, () => ({
      estimated_mins: rand(0, 240),
      actual_mins: Math.random() < 0.25 ? null : rand(-20, 400),
    }));
    yieldsEqualAccuracy(rows);
  }
});