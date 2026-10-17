import { describe, it, expect } from 'vitest';
import {
  applyArrivalBuffer,
  resolveDayAnchor,
  resolveScheduledDayAnchor,
  dayWindowFromTripDay,
  remainingMinsOnTripDay,
  buildTravelEngineContext,
  selectInitialTripDay,
} from '../travelContext';
import { processInteraction } from '@/lib/engine';
import { findFixedTimeConflicts } from '@/lib/travelSort';

describe('travel day anchors', () => {
  it('starts usable time 45 minutes after landing, not at the old day start', () => {
    const anchor = resolveDayAnchor({ arrival_time: '13:00', day_start: '07:30', day_end: '20:00' });
    expect(anchor.arrivalMins).toBe(13 * 60);
    expect(anchor.windowStartMins).toBe(13 * 60 + 45);
    expect(anchor.source).toBe('arrival');
    expect(anchor.usableMins).toBe(20 * 60 - (13 * 60 + 45));
  });

  it('flags a 10:00 fixed stop before landing but allows a 15:00 stop after landing', () => {
    const activity = (id: string, fixed_time: string) => ({
      id, text: id, time_type: 'fixed' as const, fixed_time,
      estimate_mins: 30, drive_mins_to_next: 0, order_index: 0,
      lat: null, lng: null,
    });
    const start = resolveDayAnchor({ arrival_time: '13:00', day_start: '07:30' }).windowStartMins;
    expect(findFixedTimeConflicts([activity('before', '10:00')], start).before).toBe(true);
    expect(findFixedTimeConflicts([activity('after', '15:00')], start).after).toBeUndefined();
  });

  it('clamps the arrival buffer to 0–180 minutes', () => {
    expect(applyArrivalBuffer(13 * 60, -10)).toBe(13 * 60);
    expect(applyArrivalBuffer(13 * 60, 999)).toBe(16 * 60);
  });

  it('uses an early departure as the day end', () => {
    const anchor = resolveDayAnchor({ day_start: '07:30', day_end: '20:00', departure_time: '09:00' });
    expect(anchor.windowEndMins).toBe(9 * 60);
    expect(anchor.usableMins).toBe(90);
  });

  it('falls back to day_start then the default when no arrival exists', () => {
    expect(resolveDayAnchor({ day_start: '07:30' }).windowStartMins).toBe(7 * 60 + 30);
    expect(resolveDayAnchor({}).windowStartMins).toBe(8 * 60);
    expect(resolveDayAnchor({}).source).toBe('default');
  });
});

describe('travelContext capacity', () => {
  it('computes day window from arrival/departure', () => {
    const w = dayWindowFromTripDay({
      date: '2026-10-08',
      arrival_time: '09:00',
      departure_time: '17:00',
      base_location_text: 'Hotel Grand',
    });
    expect(w.dayStartMins).toBe(9 * 60 + 45);
    expect(w.dayEndMins).toBe(17 * 60);
    expect(w.baseLocationText).toBe('Hotel Grand');
  });

  it('remaining capacity after arrival subtracts stops and drives from the same anchor', () => {
    const window = dayWindowFromTripDay({ date: '2026-10-08', arrival_time: '13:00', day_start: '07:30', day_end: '20:00' });
    const remaining = remainingMinsOnTripDay(window, [
      { estimateMins: 60, driveMinsToNext: 20 },
      { estimateMins: 30, driveMinsToNext: 10 },
    ], 15);
    expect(remaining).toBe((20 * 60 - (13 * 60 + 45)) - 60 - 20 - 30 - 10 - 15);
  });

  it('remaining mins subtracts stops and drives', () => {
    const w = dayWindowFromTripDay({
      date: '2026-10-08',
      day_start: '08:00',
      day_end: '18:00',
    });
    // 10h window = 600m; two stops 60+90 + drives 20+15 + base 30 = 215 → 385 left
    const rem = remainingMinsOnTripDay(
      w,
      [
        { estimateMins: 60, driveMinsToNext: 20 },
        { estimateMins: 90, driveMinsToNext: 15 },
      ],
      30
    );
    expect(rem).toBe(600 - 60 - 20 - 90 - 15 - 30);
  });

  it('buildTravelEngineContext wires remaining for engine', () => {
    const ctx = buildTravelEngineContext({
      tripId: 't1',
      tripName: 'Auckland week',
      intent: 'work',
      day: {
        id: 'd1',
        date: '2026-10-08',
        day_start: '08:00',
        day_end: '16:00',
        drive_from_base_mins: 25,
      },
      activities: [{ estimateMins: 45, driveMinsToNext: 10, status: 'pending' }],
    });
    expect(ctx.remainingMins).toBe(8 * 60 - 45 - 10 - 25);
    expect(ctx.tripName).toBe('Auckland week');
    expect(ctx.dayDate).toBe('2026-10-08');
  });
});

describe('processInteraction with travel context', () => {
  it('ANSWER uses trip day remaining capacity', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: {
        type: 'text',
        text: 'Have I got time to drop by the supplier this afternoon?',
      },
      context: {
        interface: 'travel',
        surface: '2026-10-08',
        todayDate: '2026-10-08',
        remainingMinsToday: null,
        openTaskCount: 2,
        jobs: [{ id: 'j1', name: 'Henderson', locationText: '14 Belgium' }],
        meetings: [],
        travelMins: 20,
        visitDurationMins: 40,
        travel: {
          tripId: 't1',
          tripName: 'Auckland week',
          intent: 'work',
          dayId: 'd1',
          dayDate: '2026-10-08',
          plannedMins: 200,
          remainingMins: 180,
          baseLocationText: 'CBD hotel',
        },
      },
    });

    expect(r.outcome).toBe('ANSWER');
    expect(r.answer).not.toBeNull();
    expect(r.answer!.fits).toBe(true);
    expect(r.answer!.evidence.some((e) => e.includes('travel_trip='))).toBe(true);
    expect(r.answer!.evidence.some((e) => e.includes('travel_day='))).toBe(true);
    expect(r.answer!.text.toLowerCase()).toMatch(/yes|fit|remain/);
  });

  it('ANSWER says no when trip day is overloaded', () => {
    const r = processInteraction({
      userId: 'u1',
      dryRun: true,
      input: {
        type: 'text',
        text: 'Have I got time to go see the client this afternoon?',
      },
      context: {
        interface: 'travel',
        surface: '2026-10-08',
        todayDate: '2026-10-08',
        jobs: [],
        meetings: [],
        travelMins: 40,
        visitDurationMins: 60,
        travel: {
          tripId: 't1',
          tripName: 'Auckland week',
          intent: 'work',
          dayId: 'd1',
          dayDate: '2026-10-08',
          plannedMins: 500,
          remainingMins: 25,
        },
      },
    });

    expect(r.outcome).toBe('ANSWER');
    expect(r.answer!.fits).toBe(false);
    expect(r.answer!.text.toLowerCase()).toMatch(/not|tight|push/);
  });
});

describe('initial trip day selection', () => {
  const days = [
    { id: 'first', date: '2026-10-14' },
    { id: 'middle', date: '2026-10-15' },
    { id: 'last', date: '2026-10-16' },
  ];

  it('opens on today when today is inside the trip', () => {
    expect(selectInitialTripDay(days, '2026-10-15')?.id).toBe('middle');
  });

  it('opens on the first day for a trip that has not started', () => {
    expect(selectInitialTripDay(days, '2026-10-10')?.id).toBe('first');
  });

  it('opens on the last day for a trip that has ended', () => {
    expect(selectInitialTripDay(days, '2026-10-20')?.id).toBe('last');
  });

  it('handles no trip days', () => {
    expect(selectInitialTripDay([], '2026-10-15')).toBeNull();
  });
});


describe('flight-only day anchors', () => {
  it('ignores stored flight anchors when no flight is scheduled', () => {
    const anchor = resolveScheduledDayAnchor({
      day_start: '08:00',
      day_end: '20:00',
      arrival_time: '13:00',
      departure_time: '16:00',
    }, false);
    expect(anchor.arrivalMins).toBeNull();
    expect(anchor.departureMins).toBeNull();
    expect(anchor.windowStartMins).toBe(8 * 60);
    expect(anchor.windowEndMins).toBe(20 * 60);
  });

  it('uses flight anchors when a flight is scheduled on the itinerary', () => {
    const anchor = resolveScheduledDayAnchor({
      day_start: '08:00',
      day_end: '20:00',
      arrival_time: '13:00',
      departure_time: '16:00',
    }, true);
    expect(anchor.arrivalMins).toBe(13 * 60);
    expect(anchor.departureMins).toBe(16 * 60);
    expect(anchor.windowStartMins).toBe(13 * 60 + 45);
    expect(anchor.windowEndMins).toBe(16 * 60);
  });
});


describe('travel engine respects flight-only anchors', () => {
  it('uses ordinary day boundaries unless a flight is connected to the itinerary', () => {
    const args = {
      tripId: 't1',
      tripName: 'Trip',
      day: {
        id: 'd1',
        date: '2026-10-08',
        day_start: '08:00',
        day_end: '20:00',
        arrival_time: '13:00',
        departure_time: '16:00',
      },
      activities: [],
    };
    expect(buildTravelEngineContext({ ...args, flightScheduled: false }).dayStartMins).toBe(8 * 60);
    expect(buildTravelEngineContext({ ...args, flightScheduled: false }).dayEndMins).toBe(20 * 60);
    expect(buildTravelEngineContext({ ...args, flightScheduled: true }).dayStartMins).toBe(13 * 60 + 45);
    expect(buildTravelEngineContext({ ...args, flightScheduled: true }).dayEndMins).toBe(16 * 60);
  });
});
