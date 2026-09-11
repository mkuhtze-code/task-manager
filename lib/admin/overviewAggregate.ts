// Types and normalization for the result of the admin_overview_aggregates
// RPC. The function (supabase/schema.sql) answers every historical count
// and window the Admin Overview needs in a single jsonb round trip; this
// module converts that untyped payload into a strictly typed shape with
// safe defaults, so the API route can read it without null-checks and the
// payload assembly stays identical to the old per-query code.

export interface AccountChange {
  user_id: string;
  status: string;
  updated_at: string;
}

export interface DayCount {
  day: string;
  value: number;
}

export interface OverviewErrorRow {
  id: string;
  source: string;
  route: string | null;
  message: string;
  created_at: string;
}

export interface OverviewFeedbackRow {
  id: string;
  submitter_email: string | null;
  is_anonymous: boolean;
  message: string;
  page_context: string | null;
  created_at: string;
  replies: number;
}

export interface AdminRepliesRecent {
  feedback_id: string;
  created_at: string;
}

export interface AdminOverviewAggregates {
  tasks: {
    total: number;
    open: number;
    dueToday: number;
    created30d: number;
    completed7d: number;
    completed24h: number;
    completed30d: number;
    doneTotal: number;
  };
  activeUsers7d: number;
  jobs: { total: number; created30d: number; active30d: number };
  meetings: {
    total: number;
    m30d: number;
    w7d: number;
    manual: number;
    outlook: number;
  };
  meetingEvidence: {
    observations: number;
    decisions: number;
    actions: number;
    media: number;
    participants: number;
  };
  travel: {
    tripsTotal: number;
    trips30d: number;
    tripsActive: number;
    tripDays: number;
    activitiesTotal: number;
    activitiesDone: number;
    accommodationsTotal: number;
  };
  predictions: {
    total: number;
    outcomes: number;
    averageRatio: number;
    accuracyPercent: number;
    medianRatio: number;
  };
  accounts: {
    active: number;
    terminated: number;
    recentChanges: AccountChange[];
  };
  userSettings: {
    tiers: { trusted_tester: number; free: number; premium: number };
    notOnboarded: number;
  };
  surfaces: { today: number; jobs: number; travel: number };
  errors: {
    h24: number;
    d7: number;
    unresolved: number;
    dayBuckets: DayCount[];
    recent: OverviewErrorRow[];
  };
  feedback: {
    total: number;
    replied: number;
    recent: OverviewFeedbackRow[];
    adminRepliesRecent: AdminRepliesRecent[];
  };
  integrations: { adminSubscriptions: number };
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function numField(o: Record<string, unknown>, key: string): number {
  return num(o?.[key]);
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function normalizeAdminAggregates(raw: unknown): AdminOverviewAggregates {
  const r = (raw ?? {}) as Record<string, unknown>;
  const tasks = (r.tasks ?? {}) as Record<string, unknown>;
  const jobs = (r.jobs ?? {}) as Record<string, unknown>;
  const meetings = (r.meetings ?? {}) as Record<string, unknown>;
  const evidence = (r.meetingEvidence ?? {}) as Record<string, unknown>;
  const travel = (r.travel ?? {}) as Record<string, unknown>;
  const predictions = (r.predictions ?? {}) as Record<string, unknown>;
  const accounts = (r.accounts ?? {}) as Record<string, unknown>;
  const settings = (r.userSettings ?? {}) as Record<string, unknown>;
  const tiers = (settings.tiers ?? {}) as Record<string, unknown>;
  const surfaces = (r.surfaces ?? {}) as Record<string, unknown>;
  const errors = (r.errors ?? {}) as Record<string, unknown>;
  const feedback = (r.feedback ?? {}) as Record<string, unknown>;
  const integrations = (r.integrations ?? {}) as Record<string, unknown>;

  return {
    tasks: {
      total: numField(tasks, 'total'),
      open: numField(tasks, 'open'),
      dueToday: numField(tasks, 'dueToday'),
      created30d: numField(tasks, 'created30d'),
      completed7d: numField(tasks, 'completed7d'),
      completed24h: numField(tasks, 'completed24h'),
      completed30d: numField(tasks, 'completed30d'),
      doneTotal: numField(tasks, 'doneTotal'),
    },
    activeUsers7d: numField(r, 'activeUsers7d'),
    jobs: {
      total: numField(jobs, 'total'),
      created30d: numField(jobs, 'created30d'),
      active30d: numField(jobs, 'active30d'),
    },
    meetings: {
      total: numField(meetings, 'total'),
      m30d: numField(meetings, 'm30d'),
      w7d: numField(meetings, 'w7d'),
      manual: numField(meetings, 'manual'),
      outlook: numField(meetings, 'outlook'),
    },
    meetingEvidence: {
      observations: numField(evidence, 'observations'),
      decisions: numField(evidence, 'decisions'),
      actions: numField(evidence, 'actions'),
      media: numField(evidence, 'media'),
      participants: numField(evidence, 'participants'),
    },
    travel: {
      tripsTotal: numField(travel, 'tripsTotal'),
      trips30d: numField(travel, 'trips30d'),
      tripsActive: numField(travel, 'tripsActive'),
      tripDays: numField(travel, 'tripDays'),
      activitiesTotal: numField(travel, 'activitiesTotal'),
      activitiesDone: numField(travel, 'activitiesDone'),
      accommodationsTotal: numField(travel, 'accommodationsTotal'),
    },
    predictions: {
      total: numField(predictions, 'total'),
      outcomes: numField(predictions, 'outcomes'),
      averageRatio: num(predictions.averageRatio ?? 1),
      accuracyPercent: num(predictions.accuracyPercent ?? 100),
      medianRatio: num(predictions.medianRatio ?? 1),
    },
    accounts: {
      active: numField(accounts, 'active'),
      terminated: numField(accounts, 'terminated'),
      recentChanges: arr<AccountChange>(accounts.recentChanges)
        .map((c) => ({
          user_id: str(c.user_id),
          status: str(c.status),
          updated_at: str(c.updated_at),
        }))
        .filter((c) => c.user_id !== ''),
    },
    userSettings: {
      tiers: {
        trusted_tester: numField(tiers, 'trusted_tester'),
        free: numField(tiers, 'free'),
        premium: numField(tiers, 'premium'),
      },
      notOnboarded: numField(settings, 'notOnboarded'),
    },
    surfaces: {
      today: numField(surfaces, 'today'),
      jobs: numField(surfaces, 'jobs'),
      travel: numField(surfaces, 'travel'),
    },
    errors: {
      h24: numField(errors, 'h24'),
      d7: numField(errors, 'd7'),
      unresolved: numField(errors, 'unresolved'),
      dayBuckets: arr<DayCount>(errors.dayBuckets)
        .map((b) => ({ day: str(b.day), value: num(b.value) }))
        .filter((b) => b.day !== ''),
      recent: arr<OverviewErrorRow>(errors.recent)
        .map((e) => ({
          id: str(e.id),
          source: str(e.source),
          route: strOrNull(e.route),
          message: str(e.message),
          created_at: str(e.created_at),
        }))
        .filter((e) => e.id !== ''),
    },
    feedback: {
      total: numField(feedback, 'total'),
      replied: numField(feedback, 'replied'),
      recent: arr<OverviewFeedbackRow>(feedback.recent)
        .map((f) => ({
          id: str(f.id),
          submitter_email: strOrNull(f.submitter_email),
          is_anonymous: f.is_anonymous === true,
          message: str(f.message),
          page_context: strOrNull(f.page_context),
          created_at: str(f.created_at),
          replies: num(f.replies),
        }))
        .filter((f) => f.id !== ''),
      adminRepliesRecent: arr<AdminRepliesRecent>(feedback.adminRepliesRecent)
        .map((a) => ({ feedback_id: str(a.feedback_id), created_at: str(a.created_at) }))
        .filter((a) => a.feedback_id !== ''),
    },
    integrations: {
      adminSubscriptions: numField(integrations, 'adminSubscriptions'),
    },
  };
}