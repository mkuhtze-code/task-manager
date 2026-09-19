import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { writeAdminAudit } from '@/lib/admin/audit';
import { logError } from '@/lib/logError';
import { normalizeAdminAggregates } from '@/lib/admin/overviewAggregate';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

/**
 * Aggregate product metrics only — no task text, meeting titles, trip names,
 * or user identifiers. Powers Product admin pages safely.
 */
export async function GET(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  try {
    const generatedAt = new Date().toISOString();
    const d7 = daysAgoIso(7);
    const d14 = daysAgoIso(14);
    const d30 = daysAgoIso(30);
    const h24 = new Date(Date.now() - DAY_MS).toISOString();
    const todayStr = generatedAt.slice(0, 10);

    const { data, error } = await supabaseAdmin.rpc('admin_overview_aggregates', {
      p_d7: d7,
      p_d14: d14,
      p_d30: d30,
      p_h24: h24,
      p_today: todayStr,
    });
    if (error) throw error;

    const agg = normalizeAdminAggregates(data);
    const pred = agg.predictions;
    const accuracyClass =
      pred.outcomes === 0
        ? 'unknown'
        : pred.averageRatio > 1.15
          ? 'over'
          : pred.averageRatio < 0.85
            ? 'under'
            : 'accurate';

    const payload = {
      generatedAt,
      privacyNote:
        'Counts and rates only. No task text, meeting titles, trip names, or user content is included.',
      activeUsers7d: agg.activeUsers7d,
      surfaces: agg.surfaces,
      today: {
        open: agg.tasks.open,
        dueToday: agg.tasks.dueToday,
        completed24h: agg.tasks.completed24h,
        completed7d: agg.tasks.completed7d,
        created30d: agg.tasks.created30d,
        total: agg.tasks.total,
        doneTotal: agg.tasks.doneTotal,
      },
      jobs: {
        total: agg.jobs.total,
        created30d: agg.jobs.created30d,
        active30d: agg.jobs.active30d,
      },
      meetings: {
        total: agg.meetings.total,
        thisWeek: agg.meetings.w7d,
        created30d: agg.meetings.m30d,
        manual: agg.meetings.manual,
        outlook: agg.meetings.outlook,
        observations: agg.meetingEvidence.observations,
        decisions: agg.meetingEvidence.decisions,
        actions: agg.meetingEvidence.actions,
        media: agg.meetingEvidence.media,
        participants: agg.meetingEvidence.participants,
      },
      travel: {
        tripsTotal: agg.travel.tripsTotal,
        trips30d: agg.travel.trips30d,
        tripsActive: agg.travel.tripsActive,
        tripDays: agg.travel.tripDays,
        activitiesTotal: agg.travel.activitiesTotal,
        activitiesDone: agg.travel.activitiesDone,
        accommodationsTotal: agg.travel.accommodationsTotal,
      },
      thinking: {
        predictions: pred.total,
        outcomes: pred.outcomes,
        accuracyPercent: pred.outcomes === 0 ? null : pred.accuracyPercent,
        averageRatio: pred.outcomes === 0 ? null : pred.averageRatio,
        medianRatio: pred.outcomes === 0 ? null : pred.medianRatio,
        accuracyClass,
      },
      patterns: {
        completedTasks: agg.tasks.doneTotal,
        predictionsWithOutcomes: pred.outcomes,
        accuracyPercent: pred.outcomes === 0 ? null : pred.accuracyPercent,
        note: 'Patterns are learned per-user client-side. Only aggregate completion and estimate accuracy are measurable system-wide.',
      },
    };

    await writeAdminAudit({
      actorId: access.userId,
      action: 'product_snapshot.view',
      metadata: { areas: ['today', 'jobs', 'meetings', 'travel', 'thinking', 'patterns'] },
    });

    return NextResponse.json(payload);
  } catch (error) {
    await logError('server', 'admin:product-snapshot', error, {}, access.userId);
    return NextResponse.json({ error: 'Could not load product metrics.' }, { status: 500 });
  }
}
