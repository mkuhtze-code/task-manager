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

  // --- Tier breakdown ---
  const { data: tierRows } = await supabaseAdmin
    .from('user_settings')
    .select('account_tier');

  const tierCounts = { trusted_tester: 0, free: 0, premium: 0 };
  (tierRows || []).forEach((r) => {
    if (r.account_tier in tierCounts) {
      tierCounts[r.account_tier as keyof typeof tierCounts]++;
    }
  });
  const totalUsers = tierRows?.length || 0;

  // --- Signups over last 30 days (bucketed by day) ---
  // auth.users isn't exposed via the normal client API, but the admin SDK's
  // listUsers works off the service role. For a 1,000-user baseline this is
  // a single paginated call, not per-row work at request time.
  const { data: authUsersData } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  const signupsByDay: Record<string, number> = {};
  (authUsersData?.users || []).forEach((u) => {
    if (!u.created_at) return;
    if (new Date(u.created_at) < new Date(thirtyDaysAgo)) return;
    const day = u.created_at.slice(0, 10); // YYYY-MM-DD
    signupsByDay[day] = (signupsByDay[day] || 0) + 1;
  });

  // --- Active users last 7 days (distinct user_id with recent task activity) ---
  const { data: recentTaskUsers } = await supabaseAdmin
    .from('tasks')
    .select('user_id')
    .or(`created_at.gte.${sevenDaysAgo},completed_at.gte.${sevenDaysAgo}`);

  const activeUserSet = new Set((recentTaskUsers || []).map((r) => r.user_id));
  const activeUsersLast7Days = activeUserSet.size;

  // --- Feedback: open vs replied ---
  const { data: feedbackRows } = await supabaseAdmin
    .from('feedback')
    .select('id, is_anonymous');

  const { data: repliedIdsRows } = await supabaseAdmin
    .from('feedback_replies')
    .select('feedback_id')
    .eq('author_type', 'admin');

  const repliedIds = new Set((repliedIdsRows || []).map((r) => r.feedback_id));
  const totalFeedback = feedbackRows?.length || 0;
  const repliedFeedback = (feedbackRows || []).filter((f) => repliedIds.has(f.id)).length;
  const openFeedback = totalFeedback - repliedFeedback;

  // --- Waitlist: pending vs approved ---
  const { data: waitlistRows } = await supabaseAdmin
    .from('waitlist_signups')
    .select('approved_at');

  const totalWaitlist = waitlistRows?.length || 0;
  const approvedWaitlist = (waitlistRows || []).filter((w) => w.approved_at).length;
  const pendingWaitlist = totalWaitlist - approvedWaitlist;

  // --- Errors: last 24h / 7d, unresolved count ---
  const { data: errorRows } = await supabaseAdmin
    .from('error_logs')
    .select('created_at, resolved')
    .gte('created_at', thirtyDaysAgo);

  const errorsLast24h = (errorRows || []).filter((e) => e.created_at >= twentyFourHoursAgo).length;
  const errorsLast7d = (errorRows || []).filter((e) => e.created_at >= sevenDaysAgo).length;
  const unresolvedErrors = (errorRows || []).filter((e) => !e.resolved).length;

  return NextResponse.json({
    users: {
      total: totalUsers,
      byTier: tierCounts,
      signupsByDay,
      activeUsersLast7Days,
    },
    feedback: {
      total: totalFeedback,
      open: openFeedback,
      replied: repliedFeedback,
    },
    waitlist: {
      total: totalWaitlist,
      pending: pendingWaitlist,
      approved: approvedWaitlist,
    },
    errors: {
      last24h: errorsLast24h,
      last7d: errorsLast7d,
      unresolved: unresolvedErrors,
    },
  });
}
