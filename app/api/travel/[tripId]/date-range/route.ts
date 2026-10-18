import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUser } from '@/lib/verifyUser';
import { planTripDateRangeChange } from '@/lib/travel/planMutations';

export const runtime = 'nodejs';

type Params = { params: { tripId: string } };

export async function POST(req: NextRequest, { params }: Params) {
  const auth = await verifyUser(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { startDate?: string; endDate?: string; confirmOrphans?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const startDate = body.startDate || '';
  const endDate = body.endDate || '';
  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'Both start and end dates are required.' }, { status: 400 });
  }

  const { data: trip, error: tripError } = await supabaseAdmin
    .from('trips').select('id, user_id, start_date, end_date').eq('id', params.tripId).maybeSingle();
  if (tripError || !trip || trip.user_id !== auth.userId) {
    return NextResponse.json({ error: 'Trip not found.' }, { status: 404 });
  }

  const { data: days, error: daysError } = await supabaseAdmin
    .from('trip_days').select('id, date').eq('trip_id', trip.id).order('date', { ascending: true });
  if (daysError) return NextResponse.json({ error: 'Could not load trip days.' }, { status: 500 });

  const dayIds = (days || []).map((day) => day.id);
  const { data: activities, error: activitiesError } = dayIds.length
    ? await supabaseAdmin.from('activities').select('id, trip_day_id, order_index').eq('user_id', auth.userId).in('trip_day_id', dayIds)
    : { data: [], error: null };
  if (activitiesError) return NextResponse.json({ error: 'Could not inspect trip activities.' }, { status: 500 });

  const plan = planTripDateRangeChange({
    currentStartDate: trip.start_date,
    currentEndDate: trip.end_date,
    nextStartDate: startDate,
    nextEndDate: endDate,
    days: days || [],
    activities: activities || [],
  });
  if (!plan.valid) return NextResponse.json({ error: plan.error }, { status: 400 });
  if (plan.orphanedActivities.length > 0 && body.confirmOrphans !== true) {
    return NextResponse.json({
      error: 'Confirmation required before shrinking this trip.',
      requiresConfirmation: true,
      orphanedCount: plan.orphanedActivities.length,
      removedDayCount: plan.removedDays.length,
      plan,
    }, { status: 409 });
  }

  // Create all destination days first. A retry reuses days that already exist,
  // so an interrupted request can be safely repeated without duplicate days.
  const existingDates = new Set((days || []).map((day) => day.date));
  const addedRows = plan.addedDates.filter((date) => !existingDates.has(date)).map((date) => ({
    trip_id: trip.id, date, day_start: '08:00', day_end: '20:00',
  }));
  if (addedRows.length) {
    const { error } = await supabaseAdmin.from('trip_days').insert(addedRows);
    if (error) return NextResponse.json({ error: 'Could not create the added trip days. No activities were deleted.' }, { status: 500 });
  }

  const { data: refreshedDays, error: refreshedError } = await supabaseAdmin
    .from('trip_days').select('id, date').eq('trip_id', trip.id).order('date', { ascending: true });
  if (refreshedError || !refreshedDays) {
    return NextResponse.json({ error: 'Could not verify trip days. Retry this change safely.' }, { status: 500 });
  }
  const dayIdByDate = new Map(refreshedDays.map((day) => [day.date, day.id]));
  const activityById = new Map((activities || []).map((activity) => [activity.id, activity]));
  const movesByDate = new Map<string, string[]>();
  for (const move of plan.activityMoves) {
    const targetDayId = dayIdByDate.get(move.toDate);
    if (!targetDayId) return NextResponse.json({ error: 'A destination day is missing; retry the change.' }, { status: 500 });
    const group = movesByDate.get(targetDayId) || [];
    group.push(move.activityId);
    movesByDate.set(targetDayId, group);
  }

  for (const [targetDayId, ids] of movesByDate) {
    const existingOnTarget = (activities || []).filter((a) => a.trip_day_id === targetDayId && !ids.includes(a.id));
    let nextOrder = existingOnTarget.reduce((max, activity) => Math.max(max, activity.order_index ?? -1), -1) + 1;
    // Stable source-day order keeps a shrink deterministic across retries.
    ids.sort((a, b) => {
      const aa = activityById.get(a)!;
      const bb = activityById.get(b)!;
      const ad = (days || []).find((day) => day.id === aa.trip_day_id)?.date || '';
      const bd = (days || []).find((day) => day.id === bb.trip_day_id)?.date || '';
      return ad.localeCompare(bd) || (aa.order_index ?? 0) - (bb.order_index ?? 0) || a.localeCompare(b);
    });
    for (const id of ids) {
      const { error } = await supabaseAdmin.from('activities').update({
        trip_day_id: targetDayId, order_index: nextOrder++, drive_mins_to_next: 0, route_polyline: null,
      }).eq('id', id).eq('user_id', auth.userId);
      if (error) return NextResponse.json({ error: 'Could not move all stops safely. No stop was intentionally deleted; retry to finish.' }, { status: 500 });
    }
    // Stale drive estimates belong to the previous order and must not survive a move.
    const { error: clearError } = await supabaseAdmin.from('activities')
      .update({ drive_mins_to_next: 0, route_polyline: null })
      .eq('trip_day_id', targetDayId).eq('user_id', auth.userId);
    if (clearError) return NextResponse.json({ error: 'Stops were preserved, but drive estimates need refresh.' }, { status: 500 });
  }

  // Only delete removed days after verifying they contain no activities.
  for (const day of plan.removedDays) {
    const { data: remaining, error } = await supabaseAdmin.from('activities')
      .select('id').eq('trip_day_id', day.id).eq('user_id', auth.userId).limit(1);
    if (error) return NextResponse.json({ error: 'Could not verify removed days. No remaining activities were deleted.' }, { status: 500 });
    if ((remaining || []).length) {
      return NextResponse.json({ error: 'A removed day still contains activities; they have been preserved. Retry after reviewing the plan.' }, { status: 409 });
    }
    const { error: deleteError } = await supabaseAdmin.from('trip_days').delete().eq('id', day.id).eq('trip_id', trip.id);
    if (deleteError) return NextResponse.json({ error: 'Could not remove an empty trip day. Retry this change safely.' }, { status: 500 });
  }

  const { error: tripUpdateError } = await supabaseAdmin.from('trips')
    .update({ start_date: startDate, end_date: endDate }).eq('id', trip.id).eq('user_id', auth.userId);
  if (tripUpdateError) {
    return NextResponse.json({ error: 'Trip dates could not be updated. Existing stops remain preserved; retry the date change.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    addedDates: plan.addedDates,
    removedDates: plan.removedDays.map((day) => day.date),
    movedActivityCount: plan.activityMoves.length,
    recalculateDayIds: [...movesByDate.keys()],
  });
}
