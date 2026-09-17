import { describe, it, expect } from 'vitest';
import {
  capacityMinsForTask,
  planOverflowCarry,
  urgencyForTask,
  SOFT_DEFAULT_MINS,
} from '@/lib/dayFit';
import type { HistoricalTask } from '@/lib/taskIntelligence';
import type { Task } from '@/lib/taskTypes';

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    text: 'Update website',
    status: 'pending',
    source: 'came_up',
    estimate_mins: 0,
    logged_mins: 0,
    started_at: null,
    due_today: false,
    order_index: 0,
    created_at: new Date().toISOString(),
    surface_date: null,
    intended_time: null,
    location_text: null,
    lat: null,
    lng: null,
    drive_mins_to_next: 0,
    route_polyline: null,
    info: '',
    job_id: null,
    original_input: null,
    ...overrides,
  };
}

describe('dayFit',
 () => {
  it('never treats zero-estimate open work as zero capacity',
 () => {
    const r = capacityMinsForTask(task({ estimate_mins: 0 }), []);
    expect(r.mins).toBe(SOFT_DEFAULT_MINS);
    expect(r.inferred).toBe(true);
  });

  it('uses typed estimate when present',
 () => {
    const r = capacityMinsForTask(task({ estimate_mins: 15, text: 'Call supplier' }), []);
    expect(r.mins).toBe(15);
    expect(r.inferred).toBe(false);
  });

  it('marks high same-day history as anchor',
 () => {
    const history: HistoricalTask[] = [
      {
        text: 'Send Henderson quote',
        actual_mins: 40,
        created_at: '2026-01-10T08:00:00',
        completed_at: '2026-01-10T11:00:00',
      },
      {
        text: 'Send Smith quote',
        actual_mins: 35,
        created_at: '2026-01-11T08:00:00',
        completed_at: '2026-01-11T10:00:00',
      },
    ];
    const u = urgencyForTask({ text: 'Send Jordan quote', due_today: false, intended_time: null, estimate_mins: 0 }, history);
    expect(u.urgency).toBe('anchor');
  });

  it('marks low same-day history as flexible',
 () => {
    const history: HistoricalTask[] = [
      {
        text: 'Update website homepage',
        actual_mins: 60,
        created_at: '2026-01-10T08:00:00',
        completed_at: '2026-01-14T11:00:00',
      },
      {
        text: 'Update website contact',
        actual_mins: 45,
        created_at: '2026-01-11T08:00:00',
        completed_at: '2026-01-18T10:00:00',
      },
    ];
    const u = urgencyForTask({ text: 'Update website', due_today: false, intended_time: null, estimate_mins: 0 }, history);
    expect(u.urgency).toBe('flexible');
  });

  it('carries flexible work to make room for incoming load',
 () => {
    const history: HistoricalTask[] = [
      {
        text: 'Update website homepage',
        actual_mins: 60,
        created_at: '2026-01-10T08:00:00',
        completed_at: '2026-01-14T11:00:00',
      },
      {
        text: 'Update website contact',
        actual_mins: 45,
        created_at: '2026-01-11T08:00:00',
        completed_at: '2026-01-18T10:00:00',
      },
      {
        text: 'Revise contract for Smith',
        actual_mins: 50,
        created_at: '2026-01-10T08:00:00',
        completed_at: '2026-01-10T12:00:00',
      },
      {
        text: 'Revise contract for Lee',
        actual_mins: 55,
        created_at: '2026-01-12T08:00:00',
        completed_at: '2026-01-12T15:00:00',
      },
    ];

    const open = [
      task({ id: 'web', text: 'Update website', estimate_mins: 0 }),
      task({ id: 'call', text: 'Call supplier', estimate_mins: 15 }),
    ];

    // Window only fits ~20m; incoming revision ~50m from history → must carry website
    const plan = planOverflowCarry({
      openTasks: open,
      history,
      remainingWindowMins: 20,
      incomingCostMins: 50,
      protectId: null,
    });

    expect(plan.carryIds).toContain('web');
    expect(plan.carryIds).not.toContain('call');
    expect(plan.message.length).toBeGreaterThan(0);
  });
});
