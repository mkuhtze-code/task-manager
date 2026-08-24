import { NextResponse } from 'next/server';
import { verifyUser } from '@/lib/verifyUser';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: Request) {
  const verify = await verifyUser(req);
  if (!verify.ok) {
    return NextResponse.json({ error: verify.error }, { status: verify.status });
  }

  const { data: adminRow } = await supabaseAdmin
    .from('admins')
    .select('user_id')
    .eq('user_id', verify.userId)
    .maybeSingle();

  if (!adminRow) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { data: tierRows } = await supabaseAdmin
    .from('user_settings')
    .select('account_tier, onboarded');

  const tierCounts = { trusted_tester: 0, free: 0, premium: 0 };
  let notOnboarded = 0;
  (tierRows || []).forEach((r) => {
    if (r.account_tier in tierCounts) {
      tierCounts[r.account_tier as keyof typeof tierCounts]++;
    }
    if (!r.onboarded) notOnboarded++;
  });
  const totalUsers = tierRows?.length || 0;

  const { data: authUsersData } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  const signupsByDay: Record<string, number> = {};
  (authUsersData?.users || []).forEach((u) => {
    if (!u.created_at) return;
    if (new Date(u.created_at) < new Date(thirtyDaysAgo)) return;
    const day = u.created_at.slice(0, 10);
    signupsByDay[day] = (signupsByDay[day] || 0) + 1;
  });

  const { data: recentTaskUsers } = await supabaseAdmin
    .from('tasks')
    .select('user_id')
    .or(`created_at.gte.${sevenDaysAgo},completed_at.gte.${sevenDaysAgo}`);

  const activeUserSet = new Set((recentTaskUsers || []).map((r) => r.user_id));
  const activeUsersLast7Days = activeUserSet.size;

  const { data: feedbackRows } = await supabaseAdmin
    .from('feedback')
    .select('id');

  const { data: repliedIdsRows } = await supabaseAdmin
    .from('feedback_replies')
    .select('feedback_id')
    .eq('author_type', 'admin');

  const repliedIds = new Set((repliedIdsRows || []).map((r) => r.feedback_id));
  const totalFeedback = feedbackRows?.length || 0;
  const repliedFeedback = (feedbackRows || []).filter((f) => repliedIds.has(f.id)).length;
  const openFeedback = totalFeedback - repliedFeedback;

  const { data: errorRows } = await supabaseAdmin
    .from('error_logs')
    .select('id, source, route, message, created_at, resolved')
    .gte('created_at', thirtyDaysAgo)
    .order('created_at', { ascending: false })
    .limit(100);

  const errorsLast24h = (errorRows || []).filter((e) => e.created_at >= twentyFourHoursAgo).length;
  const errorsLast7d = (errorRows || []).filter((e) => e.created_at >= sevenDaysAgo).length;
  const unresolvedErrors = (errorRows || []).filter((e) => !e.resolved).length;
  const recentUnresolvedErrors = (errorRows || [])
    .filter((e) => !e.resolved)
    .slice(0, 5)
    .map((e) => ({ id: e.id, source: e.source, route: e.route, message: e.message, createdAt: e.created_at }));

  const attention: { level: 'warning' | 'critical'; label: string; detail: string }[] = [];
  if (errorsLast24h > 0) {
    attention.push({
      level: errorsLast24h >= 5 ? 'critical' : 'warning',
      label: `${errorsLast24h} error${errorsLast24h === 1 ? '' : 's'} in the last 24 hours`,
      detail: unresolvedErrors > 0 ? `${unresolvedErrors} remain unresolved.` : 'All recorded errors are resolved.',
    });
  }
  if (openFeedback > 0) {
    attention.push({
      level: 'warning',
      label: `${openFeedback} feedback item${openFeedback === 1 ? '' : 's'} waiting`,
      detail: 'There is feedback that has not received an admin reply.',
    });
  }
  if (notOnboarded > 0) {
    attention.push({
      level: 'warning',
      label: `${notOnboarded} account${notOnboarded === 1 ? '' : 's'} not onboarded`,
      detail: 'These accounts have not completed onboarding yet.',
    });
  }

  return NextResponse.json({
    status: attention.some((item) => item.level === 'critical') ? 'attention' : attention.length ? 'watch' : 'healthy',
    attention,
    recentUnresolvedErrors,
    users: {
      total: totalUsers,
      byTier: tierCounts,
      signupsByDay,
      activeUsersLast7Days,
      notOnboarded,
    },
    feedback: {
      total: totalFeedback,
      open: openFeedback,
      replied: repliedFeedback,
    },
    errors: {
      last24h: errorsLast24h,
      last7d: errorsLast7d,
      unresolved: unresolvedErrors,
    },
  });
}
