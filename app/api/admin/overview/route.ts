import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUser } from '@/lib/verifyUser';
import { logError } from '@/lib/logError';
import { normalizeAdminAggregates } from '@/lib/admin/overviewAggregate';
import type {
  ActivityEvent,
  AttentionItem,
  ChartSeries,
  InfrastructureItem,
  OverviewMetric,
  OverviewPayload,
  ProductAreaSummary,
} from '@/lib/admin/types';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

// Server-side Admin authorization boundary. Every Admin API that serves
// sensitive data must independently verify the caller is an admin before
// reading anything with the service-role client.
async function requireAdmin(req: Request) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  }
  const { data: adminRow } = await supabaseAdmin
    .from('admins')
    .select('user_id')
    .eq('user_id', auth.userId)
    .maybeSingle();
  if (!adminRow) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true as const, userId: auth.userId };
}

function metricDelta(current: number, previous: number, goodWhen: 'up' | 'down') {
  return {
    deltaLabel: `${current - previous >= 0 ? '+' : ''}${current - previous} vs prior period`,
    deltaDirection: current === previous ? ('flat' as const) : current > previous ? ('up' as const) : ('down' as const),
    deltaGoodWhen: goodWhen,
  };
}

export async function GET(req: NextRequest) {
  const access = await requireAdmin(req);
  if ('error' in access) return access.error;

  try {
    return NextResponse.json(await buildOverview());
  } catch (error) {
    await logError('server', 'admin:overview', error, {}, access.userId);
    return NextResponse.json({ error: 'Could not assemble the overview.' }, { status: 500 });
  }
}

async function buildOverview(): Promise<OverviewPayload> {
  const generatedAt = new Date().toISOString();
  const d7 = daysAgoIso(7);
  const d14 = daysAgoIso(14);
  const d30 = daysAgoIso(30);
  const h24 = new Date(Date.now() - DAY_MS).toISOString();
  const todayStr = generatedAt.slice(0, 10);

  // ── Data fetch (three round trips) ──────────────────────────────
  // requireAdmin()/verifyUser() above have already gated this request.
  // Every historical count, window and bounded slice is computed inside
  // the admin_overview_aggregates RPC (service-role only, see
  // supabase/schema.sql) in ONE round trip. The GoTrue user list still
  // has to come from here because auth.users is not in the public schema
  // the RPC can read, and calendar_connections is fetched for the
  // per-connection detail strings. Total: three round trips (plus the
  // three auth round trips above), down from the ~44 serial reads.
  const [authRes, aggRes, connectionsRes] = await Promise.all([
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabaseAdmin.rpc('admin_overview_aggregates', {
      p_d7: d7,
      p_d14: d14,
      p_d30: d30,
      p_h24: h24,
      p_today: todayStr,
    }),
    supabaseAdmin.from('calendar_connections').select('provider, sync_status, sync_error'),
  ]);

  const authUsers = authRes.data?.users || [];
  const agg = normalizeAdminAggregates(aggRes.data);
  const connections = connectionsRes.data || [];

  // ── Accounts ────────────────────────────────────────────────────
  const emailById = new Map<string, string | null>(authUsers.map((u) => [u.id, u.email ?? null]));

  const now = new Date();
  let signups7d = 0;
  let signupsPrev7d = 0;
  let signups30d = 0;
  const signupBuckets = new Map<string, number>();
  const recentAccounts: { id: string; email: string | null; createdAt: string }[] = [];
  for (const u of authUsers) {
    if (!u.created_at) continue;
    const t = new Date(u.created_at).getTime();
    if (t >= now.getTime() - 7 * DAY_MS) signups7d++;
    else if (t >= now.getTime() - 14 * DAY_MS) signupsPrev7d++;
    if (t >= now.getTime() - 30 * DAY_MS) {
      signups30d++;
      const day = u.created_at.slice(0, 10);
      signupBuckets.set(day, (signupBuckets.get(day) || 0) + 1);
    }
  }
  const sortedSignups = [...authUsers].filter((u) => u.created_at).sort((a, b) => (b.created_at! < a.created_at! ? -1 : 1));
  for (const u of sortedSignups.slice(0, 6)) {
    if (!u.created_at) continue;
    recentAccounts.push({ id: u.id, email: u.email ?? null, createdAt: u.created_at });
  }

  const tierCounts = agg.userSettings.tiers;
  const notOnboarded = agg.userSettings.notOnboarded;

  const activeAccounts = agg.accounts.active;
  const terminatedAccounts = agg.accounts.terminated;
  const recentChanges: { id: string; email: string | null; status: string; updatedAt: string }[] = agg.accounts.recentChanges.map(
    (c) => ({ id: c.user_id, email: emailById.get(c.user_id) ?? null, status: c.status, updatedAt: c.updated_at })
  );

  // Active users: same task-activity definition as the previous Analytics
  // surface (task created or completed within the window).
  const activeUsers7d = agg.activeUsers7d;

  // ── Tasks + jobs ────────────────────────────────────────────────
  const {
    total: taskTotal,
    open: taskOpen,
    dueToday: taskDueToday,
    created30d: taskCreated30d,
    completed7d: taskCompleted7d,
    completed24h: taskCompleted24h,
    completed30d: taskCompleted30d,
    doneTotal: taskDoneTotal,
  } = agg.tasks;
  const { total: jobTotal, created30d: jobCreated30d, active30d: jobActive30d } = agg.jobs;

  // ── Meetings + evidence ─────────────────────────────────────────
  const {
    total: meetingTotal,
    m30d: meeting30d,
    w7d: meetingW7d,
    manual: meetingManual,
    outlook: meetingOutlook,
  } = agg.meetings;
  const {
    observations: meetingObservations,
    decisions: meetingDecisions,
    actions: meetingActions,
    media: meetingMedia,
    participants: meetingParticipants,
  } = agg.meetingEvidence;

  // ── Travel ──────────────────────────────────────────────────────
  const {
    tripsTotal,
    trips30d,
    tripsActive,
    tripDays,
    activitiesTotal,
    activitiesDone,
    accommodationsTotal,
  } = agg.travel;

  // ── Thinking engine (prediction evidence) ───────────────────────
  // The accuracy summary (average ratio, accuracy percent, median) is
  // computed inside the RPC from the completed-outcome rows, using the
  // same formulas as the previous lib summarizeAccuracy() call.
  const predictionsTotal = agg.predictions.total;
  const predictionsWithOutcome = agg.predictions.outcomes;
  const accuracyAverageRatio = agg.predictions.averageRatio;
  const accuracyPercent = agg.predictions.accuracyPercent;
  const accuracyClass = accuracyAverageRatio > 1.15 ? 'over' : accuracyAverageRatio < 0.85 ? 'under' : 'accurate';

  // ── Feedback ────────────────────────────────────────────────────
  const totalFeedback = agg.feedback.total;
  const repliedFeedback = agg.feedback.replied;
  const openFeedback = totalFeedback - repliedFeedback;
  const feedbackRecent: OverviewPayload['feedback']['recent'] = agg.feedback.recent.map((f) => ({
    id: f.id,
    label: f.is_anonymous ? 'Anonymous' : f.submitter_email ?? 'Unknown',
    message: f.message,
    pageContext: f.page_context,
    numberOfReplies: f.replies,
    createdAt: f.created_at,
  }));

  // ── Errors ──────────────────────────────────────────────────────
  const { h24: errors24h, d7: errors7d, unresolved: errorsUnresolved } = agg.errors;
  const errorBuckets = new Map<string, number>();
  for (let i = 13; i >= 0; i--) errorBuckets.set(daysAgoIso(i).slice(0, 10), 0);
  // SQL groups errors per UTC day across the full 14-day window; the
  // has() check keeps only the days this dashboard shows, exactly as the
  // previous per-row bucketing did.
  agg.errors.dayBuckets.forEach((b) => {
    if (errorBuckets.has(b.day)) errorBuckets.set(b.day, (errorBuckets.get(b.day) || 0) + b.value);
  });

  // ── Integrations / calendar ─────────────────────────────────────
  const connectionsWithError = (connections || []).filter((c: any) => c.sync_status === 'error');
  const microsoftConnections = (connections || []).filter((c: any) => c.provider === 'microsoft');
  const adminSubs = agg.integrations.adminSubscriptions;

  const vapidConfigured = Boolean(process.env.VAPID_SUBJECT && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
  const upstashConfigured = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  const mapsConfigured = Boolean(process.env.GOOGLE_MAPS_API_KEY);

  // ── Attention ───────────────────────────────────────────────────
  const attention: AttentionItem[] = [];
  if (errors7d > 0 || errorsUnresolved > 0) {
    attention.push({
      severity: errors24h >= 5 ? 'critical' : 'warning',
      title: `${errors24h} error${errors24h === 1 ? '' : 's'} in the last 24 hours`,
      detail: `${errorsUnresolved} recorded error${errorsUnresolved === 1 ? '' : 's'} are unresolved.`,
      href: '/admin/errors',
    });
  }
  if (openFeedback > 0) {
    attention.push({
      severity: 'warning',
      title: `${openFeedback} feedback item${openFeedback === 1 ? '' : 's'} awaiting a reply`,
      detail: 'Feedback that has not received an admin response.',
      href: '/admin/feedback',
    });
  }
  if (notOnboarded > 0) {
    attention.push({
      severity: 'warning',
      title: `${notOnboarded} account${notOnboarded === 1 ? '' : 's'} not onboarded`,
      detail: 'Accounts that have not completed onboarding.',
      href: '/admin/users',
    });
  }
  if (connectionsWithError.length > 0) {
    attention.push({
      severity: 'warning',
      title: `${connectionsWithError.length} calendar connection${connectionsWithError.length === 1 ? '' : 's'} in error state`,
      detail: connectionsWithError[0].sync_error || 'Last sync did not complete.',
      href: '/admin/integrations',
    });
  }
  if (terminatedAccounts > 0) {
    attention.push({
      severity: 'info',
      title: `${terminatedAccounts} account${terminatedAccounts === 1 ? '' : 's'} terminated`,
      detail: 'Terminated users are signed out and blocked server-side.',
      href: '/admin/users',
    });
  }

  const overall: 'operational' | 'attention' | 'critical' = attention.some((a) => a.severity === 'critical')
    ? 'critical'
    : attention.length
      ? 'attention'
      : 'operational';
  const overallLabel = overall === 'critical' ? 'Needs attention' : overall === 'attention' ? 'Worth a look' : 'Operational';
  const overallDetail =
    overall === 'critical'
      ? 'Something is failing and should be checked now.'
      : overall === 'attention'
        ? 'Dokkit is running, but a few things are waiting for you.'
        : 'All monitored systems are responding normally.';

  // ── Activity feed (chronological, real events only) ─────────────
  const activity: ActivityEvent[] = [];
  const accountEvents = recentAccounts.slice(0, 3).map((u) => ({
    id: `account-${u.id}`,
    type: 'account' as const,
    title: `${u.email || 'A new user'} joined Dokkit`,
    timestamp: u.createdAt,
    href: '/admin/users',
  }));
  const statusEvents = recentChanges.slice(0, 3).map((c) => ({
    id: `status-${c.id}-${c.updatedAt}`,
    type: 'account_status' as const,
    title: `${c.email || 'An account'} set to ${c.status}`,
    timestamp: c.updatedAt,
    href: '/admin/users',
  }));
  const feedbackEvents = agg.feedback.recent.slice(0, 3).map((f) => ({
    id: `feedback-${f.id}`,
    type: 'feedback' as const,
    title: `Feedback received${f.is_anonymous ? ' (anonymous)' : ` from ${f.submitter_email || 'a signed-in user'}`}`,
    detail: f.message.slice(0, 120),
    timestamp: f.created_at,
    href: '/admin/feedback',
  }));
  const replyEvents = agg.feedback.adminRepliesRecent.map((r) => ({
    id: `reply-${r.feedback_id}-${r.created_at}`,
    type: 'feedback_reply' as const,
    title: 'Admin replied to a feedback thread',
    timestamp: r.created_at,
    href: '/admin/feedback',
  }));
  const errorEvents = agg.errors.recent.slice(0, 3).map((e) => ({
    id: `error-${e.id}`,
    type: 'error' as const,
    title: `Error recorded [${e.source}] ${e.route ? `· ${e.route}` : ''}`,
    detail: e.message.slice(0, 120),
    timestamp: e.created_at,
    href: '/admin/errors',
  }));
  activity.push(...(accountEvents as ActivityEvent[]), ...(statusEvents as ActivityEvent[]));
  activity.push(...(feedbackEvents as ActivityEvent[]), ...(replyEvents as ActivityEvent[]));
  activity.push(...(errorEvents as ActivityEvent[]));
  activity.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));

  // ── System health components ────────────────────────────────────
  const systemComponents: InfrastructureItem[] = [
    { key: 'app', label: 'Dokkit application', state: 'operational', detail: 'Responding — the overview was generated from live data.' },
    { key: 'admin-api', label: 'Admin API', state: 'operational', detail: 'Authorized admin request succeeded.' },
    { key: 'database', label: 'Database', state: 'operational', detail: 'Supabase queries completed successfully.' },
    { key: 'auth', label: 'Authentication', state: 'operational', detail: 'Admin session verified against Supabase Auth.' },
    { key: 'errors', label: 'Error logging', state: 'operational', detail: 'error_logs is readable; recent errors are shown below.' },
    {
      key: 'calendar',
      label: 'Calendar (Microsoft)',
      state: microsoftConnections.length === 0 ? 'not_configured' : connectionsWithError.length > 0 ? 'warning' : 'operational',
      detail:
        microsoftConnections.length === 0
          ? 'No Microsoft calendar connections yet.'
          : `${microsoftConnections.length} connection${microsoftConnections.length === 1 ? '' : 's'}${connectionsWithError.length ? `, ${connectionsWithError.length} in error state` : ', all syncing normally'}.`,
    },
    {
      key: 'push',
      label: 'Push notifications',
      state: !vapidConfigured ? 'not_configured' : 'operational',
      detail: vapidConfigured
        ? `Web Push is configured and used for admin alerts (${adminSubs} admin device${adminSubs === 1 ? '' : 's'} subscribed).`
        : 'VAPID credentials are not configured.',
    },
    {
      key: 'rate-limit',
      label: 'Rate limiting',
      state: !upstashConfigured ? 'not_configured' : 'not_monitored',
      detail: upstashConfigured
        ? 'Upstash Redis is configured. No live health check is performed against it.'
        : 'Upstash Redis is not configured; rate limiting currently fails open.',
    },
  ];
  const system = { components: systemComponents };

  // ── Infrastructure footprint ────────────────────────────────────
  const infrastructure: InfrastructureItem[] = [
    { key: 'vercel', label: 'Vercel', state: 'not_monitored', detail: 'Deployment platform. Status is not polled from the app.', href: '/admin/infrastructure' },
    { key: 'supabase', label: 'Supabase', state: 'operational', detail: 'Platform responding to queries.', href: '/admin/infrastructure' },
    { key: 'database', label: 'Database', state: 'operational', detail: 'Postgres queries succeeded.', href: '/admin/database' },
    { key: 'storage', label: 'Storage', state: 'not_configured', detail: 'No storage buckets in use — meeting media stays device-local.', href: '/admin/infrastructure' },
    { key: 'auth', label: 'Authentication', state: 'operational', detail: 'Supabase Auth responding.', href: '/admin/infrastructure' },
    {
      key: 'microsoft',
      label: 'Microsoft integrations',
      state: microsoftConnections.length === 0 ? 'not_configured' : connectionsWithError.length > 0 ? 'warning' : 'operational',
      detail: microsoftConnections.length === 0 ? 'No connections.' : `${microsoftConnections.length} connection${microsoftConnections.length === 1 ? '' : 's'}.`,
      href: '/admin/integrations',
    },
    { key: 'google', label: 'Google integrations', state: 'not_configured', detail: 'No Google OAuth connection.', href: '/admin/integrations' },
    {
      key: 'maps',
      label: 'Maps',
      state: mapsConfigured ? 'not_monitored' : 'not_configured',
      detail: mapsConfigured ? 'Google Maps Platform key configured. No live check performed.' : 'Google Maps Platform key not configured.',
      href: '/admin/integrations',
    },
    { key: 'email', label: 'Email', state: 'not_configured', detail: 'No outbound email service beyond Supabase Auth\'s built-in messages.', href: '/admin/integrations' },
    {
      key: 'notifications',
      label: 'Notifications',
      state: !vapidConfigured ? 'not_configured' : 'operational',
      detail: vapidConfigured ? `Web Push configured (${adminSubs} admin subscription${adminSubs === 1 ? '' : 's'}).` : 'Web Push not configured.',
      href: '/admin/notifications',
    },
  ];

  // ── Top-level metrics ───────────────────────────────────────────
  const newUsersDelta = metricDelta(signups7d, signupsPrev7d, 'up');
  const topMetrics: OverviewMetric[] = [
    { key: 'total-users', label: 'Total users', value: authUsers.length, display: fmtInt(authUsers.length), href: '/admin/users' },
    { key: 'active-users', label: 'Active users (7d)', value: activeUsers7d, display: fmtInt(activeUsers7d), href: '/admin/users', note: 'Task created or completed in the last 7 days.' },
    { key: 'new-users', label: 'New users (7d)', value: signups7d, display: fmtInt(signups7d), href: '/admin/users', ...newUsersDelta },
    { key: 'task-completions', label: 'Task completions (24h)', value: taskCompleted24h, display: fmtInt(taskCompleted24h), href: '/admin/today' },
    { key: 'open-feedback', label: 'Feedback awaiting reply', value: openFeedback, display: fmtInt(openFeedback), href: '/admin/feedback', state: openFeedback > 0 ? 'attention' : 'normal' },
    { key: 'unresolved-errors', label: 'Unresolved errors', value: errorsUnresolved, display: fmtInt(errorsUnresolved), href: '/admin/errors', state: errorsUnresolved > 0 ? 'attention' : 'normal' },
  ];

  // ── Product area summaries ──────────────────────────────────────
  const productAreas: ProductAreaSummary[] = [
    {
      key: 'today',
      name: 'Today',
      href: '/admin/today',
      headline: fmtInt(taskDueToday),
      headlineLabel: 'due today',
      metrics: [
        { key: 'open', label: 'Open tasks', value: taskOpen, display: fmtInt(taskOpen) },
        { key: 'done-24h', label: 'Completed 24h', value: taskCompleted24h, display: fmtInt(taskCompleted24h) },
        { key: 'done-7d', label: 'Completed 7d', value: taskCompleted7d, display: fmtInt(taskCompleted7d) },
        { key: 'created-30d', label: 'Created 30d', value: taskCreated30d, display: fmtInt(taskCreated30d) },
      ],
    },
    {
      key: 'jobs',
      name: 'Jobs',
      href: '/admin/jobs',
      headline: fmtInt(jobTotal),
      headlineLabel: 'total jobs',
      metrics: [
        { key: 'total', label: 'Total jobs', value: jobTotal, display: fmtInt(jobTotal) },
        { key: 'created-30d', label: 'Created 30d', value: jobCreated30d, display: fmtInt(jobCreated30d) },
        { key: 'active-30d', label: 'With task activity 30d', value: jobActive30d, display: fmtInt(jobActive30d), note: 'Jobs with a task created in the last 30 days.' },
      ],
    },
    {
      key: 'meetings',
      name: 'Meetings',
      href: '/admin/meetings',
      headline: fmtInt(meetingW7d),
      headlineLabel: 'this week',
      metrics: [
        { key: 'total', label: 'Total recorded', value: meetingTotal, display: fmtInt(meetingTotal) },
        { key: 'this-week', label: 'This week', value: meetingW7d, display: fmtInt(meetingW7d) },
        { key: 'observed-30d', label: 'Created 30d', value: meeting30d, display: fmtInt(meeting30d) },
        { key: 'manual', label: 'Manual', value: meetingManual, display: fmtInt(meetingManual) },
        { key: 'outlook', label: 'Outlook-synced', value: meetingOutlook, display: fmtInt(meetingOutlook) },
        { key: 'observations', label: 'Observations captured', value: meetingObservations, display: fmtInt(meetingObservations) },
        { key: 'decisions', label: 'Decisions recorded', value: meetingDecisions, display: fmtInt(meetingDecisions) },
        { key: 'actions', label: 'Actions recorded', value: meetingActions, display: fmtInt(meetingActions) },
        { key: 'media', label: 'Media items', value: meetingMedia, display: fmtInt(meetingMedia) },
        { key: 'participants', label: 'Participants', value: meetingParticipants, display: fmtInt(meetingParticipants) },
      ],
    },
    {
      key: 'travel',
      name: 'Travel',
      href: '/admin/travel',
      headline: fmtInt(tripsActive),
      headlineLabel: 'active trips today',
      metrics: [
        { key: 'trips-total', label: 'Trips', value: tripsTotal, display: fmtInt(tripsTotal) },
        { key: 'trips-active', label: 'Active right now', value: tripsActive, display: fmtInt(tripsActive) },
        { key: 'trips-30d', label: 'Created 30d', value: trips30d, display: fmtInt(trips30d) },
        { key: 'trip-days', label: 'Trip days', value: tripDays, display: fmtInt(tripDays) },
        { key: 'activities', label: 'Activities scheduled', value: activitiesTotal, display: fmtInt(activitiesTotal) },
        { key: 'activities-done', label: 'Activities done', value: activitiesDone, display: fmtInt(activitiesDone) },
        { key: 'accommodations', label: 'Accommodations', value: accommodationsTotal, display: fmtInt(accommodationsTotal) },
      ],
    },
    {
      key: 'thinking',
      name: 'Thinking',
      href: '/admin/thinking',
      headline: fmtInt(predictionsWithOutcome),
      headlineLabel: 'predictions with outcomes',
      metrics: [
        { key: 'predictions', label: 'Predictions logged', value: predictionsTotal, display: fmtInt(predictionsTotal) },
        { key: 'outcomes', label: 'With outcomes', value: predictionsWithOutcome, display: fmtInt(predictionsWithOutcome) },
        {
          key: 'accuracy',
          label: 'Estimate accuracy',
          value: predictionsWithOutcome === 0 ? 0 : accuracyPercent,
          display: predictionsWithOutcome === 0 ? '—' : `${accuracyPercent}%`,
          note: predictionsWithOutcome === 0
            ? 'No completed predictions to measure yet.'
            : `${predictionsWithOutcome} completed prediction${predictionsWithOutcome === 1 ? '' : 's'}; ${accuracyClass} on average.`,
        },
      ],
    },
    {
      key: 'patterns',
      name: 'Patterns',
      href: '/admin/patterns',
      headline: fmtInt(taskDoneTotal),
      headlineLabel: 'completed tasks in history',
      metrics: [
        { key: 'done-total', label: 'Completed tasks', value: taskDoneTotal, display: fmtInt(taskDoneTotal) },
        { key: 'accuracy', label: 'Estimate accuracy', value: predictionsWithOutcome === 0 ? 0 : accuracyPercent, display: predictionsWithOutcome === 0 ? '—' : `${accuracyPercent}%`, note: predictionsWithOutcome === 0 ? 'No completed predictions to measure yet.' : 'Shared with the Thinking engine evidence.' },
      ],
      note: 'Patterns are derived client-side from a user\'s task history. Only aggregate evidence is measurable at system level.',
    },
  ];

  // ── Business / Stripe (not implemented — never invented) ────────
  const business = {
    stripe: {
      state: 'not_configured' as const,
      detail: 'Stripe is not connected. No revenue, subscription or customer data exists yet.',
      href: '/admin/stripe',
    },
    planned: ['MRR', 'Revenue', 'Subscriptions', 'Trials', 'Churn', 'Failed payments', 'Customer lookup', 'Plan management'],
  };

  const signupSeries: ChartSeries[] = [...signupBuckets.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const errorSeries: ChartSeries[] = [...errorBuckets.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const limitations = [
    'No continuous health probes exist. Component states reflect the current request or last-known configuration.',
    'Storage, email and deployment-platform status is not measured.',
    'Active-user count uses task activity (created or completed) — other surfaces are not folded in.',
  ];

  return {
    generatedAt,
    overall,
    overallLabel,
    overallDetail,
    topMetrics,
    signups: { series: signupSeries, seriesLabel: 'New users — last 30 days' },
    errorsByDay: { series: errorSeries, seriesLabel: 'Recorded errors — last 14 days' },
    accounts: {
      total: authUsers.length,
      active: activeAccounts,
      terminated: terminatedAccounts,
      notOnboarded,
      byTier: tierCounts,
      newUsers7d: signups7d,
      newUsersPrev7d: signupsPrev7d,
      newUsers30d: signups30d,
      activeUsers7d,
      recent: recentAccounts,
      recentChanges: recentChanges.slice(0, 6),
    },
    productAreas,
    surfaces: agg.surfaces,
    system: { components: systemComponents },
    attention,
    activity: activity.slice(0, 12),
    feedback: {
      total: totalFeedback,
      open: openFeedback,
      replied: repliedFeedback,
      recent: feedbackRecent,
    },
    business,
    infrastructure,
    limitations,
  };
}

function fmtInt(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}