import { describe, it, expect } from 'vitest';
import {
  dayWindowFromTripDay,
  remainingMinsOnTripDay,
  buildTravelEngineContext,
} from '../travelContext';
import { processInteraction } from '@/lib/engine';

describe('travelContext capacity', () => {
  it('computes day window from arrival/departure', () => {
    const w = dayWindowFromTripDay({
      date: '2026-10-08',
      arrival_time: '09:00',
      departure_time: '17:00',
      base_location_text: 'Hotel Grand',
    });
    expect(w.dayStartMins).toBe(9 * 60);
    expect(w.dayEndMins).toBe(17 * 60);
    expect(w.baseLocationText).toBe('Hotel Grand');
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
