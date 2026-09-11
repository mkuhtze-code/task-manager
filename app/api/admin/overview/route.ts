import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUser } from '@/lib/verifyUser';
import { logError } from '@/lib/logError';
import { summarizeAccuracy } from '@/lib/thinking/observations/estimateAccuracy';
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

  // ── Accounts ────────────────────────────────────────────────────
  const { data: authUsersData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const authUsers = authUsersData?.users || [];
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

  const { data: settingsRows } = await supabaseAdmin.from('user_settings').select('account_tier, onboarded');
  const tierCounts = { trusted_tester: 0, free: 0, premium: 0 };
  let notOnboarded = 0;
  (settingsRows || []).forEach((r) => {
    if (r.account_tier in tierCounts) tierCounts[r.account_tier as keyof typeof tierCounts]++;
    if (!r.onboarded) notOnboarded++;
  });

  const { data: accountStatusRows } = await supabaseAdmin.from('account_status').select('user_id, status, updated_at, created_at');
  let activeAccounts = 0;
  let terminatedAccounts = 0;
  const recentChanges: { id: string; email: string | null; status: string; updatedAt: string }[] = [];
  (accountStatusRows || []).forEach((r) => {
    if (r.status === 'terminated') terminatedAccounts++;
    else activeAccounts++;
    // A status row whose updated_at is later than its own creation means an
    // administrator later changed the account state (created_at is the signup)
    if (r.updated_at && r.created_at && new Date(r.updated_at).getTime() > new Date(r.created_at).getTime() + 1000) {
      recentChanges.push({ id: r.user_id, email: emailById.get(r.user_id) ?? null, status: r.status, updatedAt: r.updated_at });
    }
  });
  recentChanges.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));

  // Active users: same task-activity definition as the previous Analytics
  // surface (task created or completed within the window).
  const { data: activeTaskUsers } = await supabaseAdmin
    .from('tasks' as any)
    .select('user_id')
    .or(`created_at.gte.${d7},completed_at.gte.${d7}`);
  const activeUsers7d = new Set((activeTaskUsers || []).map((r: any) => r.user_id)).size;

  // ── Tasks ───────────────────────────────────────────────────────
  const taskTotal = (await supabaseAdmin.from('tasks').select('id', { count: 'exact', head: true })).count ?? 0;
  const taskOpen = (await supabaseAdmin.from('tasks').select('id', { count: 'exact', head: true }).neq('status', 'done')).count ?? 0;
  const taskDueToday = (await supabaseAdmin.from('tasks').select('id', { count: 'exact', head: true }).eq('due_today', true).neq('status', 'done')).count ?? 0;
  const taskCreated30d = (await supabaseAdmin.from('tasks').select('id', { count: 'exact', head: true }).gte('created_at', d30)).count ?? 0;
  const taskCompleted7d = (await supabaseAdmin.from('tasks').select('id', { count: 'exact', head: true }).gte('completed_at', d7)).count ?? 0;
  const taskCompleted24h = (await supabaseAdmin.from('tasks').select('id', { count: 'exact', head: true }).gte('completed_at', h24)).count ?? 0;
  const taskCompleted30d = (await supabaseAdmin.from('tasks').select('id', { count: 'exact', head: true }).gte('completed_at', d30)).count ?? 0;
  const taskDoneTotal = (await supabaseAdmin.from('tasks').select('id', { count: 'exact', head: true }).eq('status', 'done')).count ?? 0;

  const jobTotal = (await supabaseAdmin.from('jobs').select('id', { count: 'exact', head: true })).count ?? 0;
  const jobCreated30d = (await supabaseAdmin.from('jobs').select('id', { count: 'exact', head: true }).gte('created_at', d30)).count ?? 0;
  const { data: activeJobs } = await supabaseAdmin
    .from('tasks' as any)
    .select('job_id')
    .not('job_id', 'is', null)
    .gte('created_at', d30);
  const jobActive30d = new Set((activeJobs || []).map((r: any) => r.job_id)).size;

  // ── Meetings + evidence ─────────────────────────────────────────
  const meetingTotal = (await supabaseAdmin.from('meetings').select('id', { count: 'exact', head: true })).count ?? 0;
  const meeting30d = (await supabaseAdmin.from('meetings').select('id', { count: 'exact', head: true }).gte('created_at', d30)).count ?? 0;
  const meetingW7d = (await supabaseAdmin.from('meetings').select('id', { count: 'exact', head: true }).gte('start_time', d7)).count ?? 0;
  const meetingManual = (await supabaseAdmin.from('meetings').select('id', { count: 'exact', head: true }).eq('source', 'manual')).count ?? 0;
  const meetingOutlook = (await supabaseAdmin.from('meetings').select('id', { count: 'exact', head: true }).eq('source', 'outlook')).count ?? 0;
  const meetingObservations = (await supabaseAdmin.from('meeting_observations').select('id', { count: 'exact', head: true })).count ?? 0;
  const meetingDecisions = (await supabaseAdmin.from('meeting_decisions').select('id', { count: 'exact', head: true })).count ?? 0;
  const meetingActions = (await supabaseAdmin.from('meeting_actions').select('id', { count: 'exact', head: true })).count ?? 0;
  const meetingMedia = (await supabaseAdmin.from('meeting_media').select('id', { count: 'exact', head: true })).count ?? 0;
  const meetingParticipants = (await supabaseAdmin.from('meeting_participants').select('id', { count: 'exact', head: true })).count ?? 0;

  // ── Travel ──────────────────────────────────────────────────────
  const tripsTotal = (await supabaseAdmin.from('trips').select('id', { count: 'exact', head: true })).count ?? 0;
  const trips30d = (await supabaseAdmin.from('trips').select('id', { count: 'exact', head: true }).gte('created_at', d30)).count ?? 0;
  const tripsActive = (await supabaseAdmin.from('trips').select('id', { count: 'exact', head: true }).lte('start_date', todayStr).gte('end_date', todayStr)).count ?? 0;
  const tripDays = (await supabaseAdmin.from('trip_days').select('id', { count: 'exact', head: true })).count ?? 0;
  const activitiesTotal = (await supabaseAdmin.from('activities').select('id', { count: 'exact', head: true })).count ?? 0;
  const activitiesDone = (await supabaseAdmin.from('activities').select('id', { count: 'exact', head: true }).eq('status', 'done')).count ?? 0;
  const accommodationsTotal = (await supabaseAdmin.from('accommodations').select('id', { count: 'exact', head: true })).count ?? 0;

  // ── Thinking engine (prediction evidence) ───────────────────────
  const predictionsTotal = (await supabaseAdmin.from('prediction_log').select('id', { count: 'exact', head: true })).count ?? 0;
  const predictionsWithOutcome = (await supabaseAdmin.from('prediction_log').select('id', { count: 'exact', head: true }).not('actual_mins', 'is', null)).count ?? 0;
  const { data: predictionBoth } = await supabaseAdmin.from('prediction_log').select('estimated_mins, actual_mins').not('actual_mins', 'is', null);
  const accuracySummary = summarizeAccuracy(
    (predictionBoth || []).map((p) => {
      const est = Math.max(Number(p.estimated_mins) || 0, 1);
      const act = Number(p.actual_mins) || 0;
      return {
        kind: 'estimate_accuracy' as const,
        taskText: '',
        clusterLabel: null,
        clusterCount: 0,
        estimatedMins: est,
        actualMins: act,
        ratio: act / est,
        confidence: 'low' as const,
        observedAt: new Date().toISOString(),
      };
    })
  );
  const accuracyClass = accuracySummary.averageRatio > 1.15 ? 'over' : accuracySummary.averageRatio < 0.85 ? 'under' : 'accurate';

  // ── Surface events (current version logs today/jobs/travel) ─────
  const { data: surfaceRows } = await supabaseAdmin
    .from('surface_events' as any)
    .select('surface')
    .gte('created_at', d14);
  const surfaceCounts = { today: 0, jobs: 0, travel: 0 };
  (surfaceRows || []).forEach((r: any) => {
    if (r.surface in surfaceCounts) surfaceCounts[r.surface as keyof typeof surfaceCounts]++;
  });

  // ── Feedback ────────────────────────────────────────────────────
  const { data: feedbackRows } = await supabaseAdmin
    .from('feedback')
    .select('id, submitter_email, is_anonymous, message, page_context, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  const { data: replyRows } = await supabaseAdmin.from('feedback_replies').select('feedback_id, author_type, created_at');
  const topicWithAdminReply = new Set((replyRows || []).filter((r) => r.author_type === 'admin').map((r) => r.feedback_id));
  const totalFeedback = feedbackRows?.length ?? 0;
  const repliedFeedback = (feedbackRows || []).filter((f) => topicWithAdminReply.has(f.id)).length;
  const openFeedback = totalFeedback - repliedFeedback;
  const feedbackRecent: OverviewPayload['feedback']['recent'] = (feedbackRows || []).slice(0, 6).map((f) => ({
    id: f.id,
    label: f.is_anonymous ? 'Anonymous' : f.submitter_email ?? 'Unknown',
    message: f.message,
    pageContext: f.page_context,
    numberOfReplies: (replyRows || []).filter((r) => r.feedback_id === f.id).length,
    createdAt: f.created_at,
  }));

  // ── Errors ──────────────────────────────────────────────────────
  const errors24h = (await supabaseAdmin.from('error_logs').select('id', { count: 'exact', head: true }).gte('created_at', h24)).count ?? 0;
  const errors7d = (await supabaseAdmin.from('error_logs').select('id', { count: 'exact', head: true }).gte('created_at', d7)).count ?? 0;
  const errorsUnresolved = (await supabaseAdmin.from('error_logs').select('id', { count: 'exact', head: true }).eq('resolved', false)).count ?? 0;
  const { data: errorRows } = await supabaseAdmin
    .from('error_logs')
    .select('id, source, route, message, resolved, created_at')
    .gte('created_at', d14)
    .order('created_at', { ascending: false })
    .limit(200);
  const errorBuckets = new Map<string, number>();
  for (let i = 13; i >= 0; i--) errorBuckets.set(daysAgoIso(i).slice(0, 10), 0);
  (errorRows || []).forEach((e) => {
    const day = (e.created_at || '').slice(0, 10);
    if (errorBuckets.has(day)) errorBuckets.set(day, (errorBuckets.get(day) || 0) + 1);
  });

  // ── Integrations / calendar ─────────────────────────────────────
  const { data: connections } = await supabaseAdmin
    .from('calendar_connections')
    .select('provider, sync_status, sync_error, connected_email, last_sync_at');
  const connectionsWithError = (connections || []).filter((c) => c.sync_status === 'error');
  const microsoftConnections = (connections || []).filter((c) => c.provider === 'microsoft');
  const { data: pushSubs } = await supabaseAdmin.from('push_subscriptions').select('user_id');
  const adminIds = (await supabaseAdmin.from('admins').select('user_id')).data?.map((a) => a.user_id) || [];
  const adminSubs = (pushSubs || []).filter((s) => adminIds.includes(s.user_id));

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
  const feedbackEvents = (feedbackRows || []).slice(0, 3).map((f) => ({
    id: `feedback-${f.id}`,
    type: 'feedback' as const,
    title: `Feedback received${f.is_anonymous ? ' (anonymous)' : ` from ${f.submitter_email || 'a signed-in user'}`}`,
    detail: f.message.slice(0, 120),
    timestamp: f.created_at,
    href: '/admin/feedback',
  }));
  const replyEvents = (replyRows || [])
    .filter((r) => r.author_type === 'admin')
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, 2)
    .map((r) => ({
      id: `reply-${r.feedback_id}-${r.created_at}`,
      type: 'feedback_reply' as const,
      title: 'Admin replied to a feedback thread',
      timestamp: r.created_at,
      href: '/admin/feedback',
    }));
  const errorEvents = (errorRows || []).slice(0, 3).map((e) => ({
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
        ? `Web Push is configured and used for admin alerts (${adminSubs.length} admin device${adminSubs.length === 1 ? '' : 's'} subscribed).`
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
      detail: vapidConfigured ? `Web Push configured (${adminSubs.length} admin subscription${adminSubs.length === 1 ? '' : 's'}).` : 'Web Push not configured.',
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
          value: accuracySummary.total === 0 ? 0 : accuracySummary.accuracyPercent,
          display: accuracySummary.total === 0 ? '—' : `${accuracySummary.accuracyPercent}%`,
          note: accuracySummary.total === 0
            ? 'No completed predictions to measure yet.'
            : `${accuracySummary.total} completed prediction${accuracySummary.total === 1 ? '' : 's'}; ${accuracyClass} on average.`,
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
        { key: 'accuracy', label: 'Estimate accuracy', value: accuracySummary.total === 0 ? 0 : accuracySummary.accuracyPercent, display: accuracySummary.total === 0 ? '—' : `${accuracySummary.accuracyPercent}%`, note: accuracySummary.total === 0 ? 'No completed predictions to measure yet.' : 'Shared with the Thinking engine evidence.' },
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
    surfaces: surfaceCounts,
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