import { describe, expect, it } from 'vitest';
import { processCpuInteraction } from '@/lib/cpu';
import { emptyWorkingMemory, makeMemoryItem, remember } from '@/lib/engine/workingMemory';

const base = {
  userId: 'phase8-test',
  context: {
    interface: 'capture',
    surface: 'today',
    todayDate: '2026-10-07',
    remainingMinsToday: 120,
    openTaskCount: 2,
    jobs: [],
    meetings: [],
  },
  dryRun: true,
};

describe('Dokkit CPU Phase 8 — cross-world reasoning', () => {
  it('connects a task to a job through location without changing the action', () => {
    const result = processCpuInteraction({
      ...base,
      input: {
        type: 'text',
        text: 'I need to drop off clips to 64 Grace James Road today',
      },
      context: {
        ...base.context,
        jobs: [
          {
            id: 'job-grace',
            name: 'Grace James',
            locationText: '64 Grace James Road, Pukekohe',
          },
        ],
      },
    });

    const opportunity = result.decision.opportunities.find(
      (item) => item.reason === 'job_location_convergence',
    );

    expect(opportunity?.kind).toBe('job');
    expect(opportunity?.entityIds).toContain('job-grace');
    expect(result.decision.action?.kind).toBe('create_task');
  });

  it('connects an explicitly referenced meeting', () => {
    const result = processCpuInteraction({
      ...base,
      input: {
        type: 'text',
        text: 'Ask the Smith site meeting about the flashing',
      },
      context: {
        ...base.context,
        meetings: [
          {
            id: 'meeting-smith',
            text: 'Smith site meeting',
            startAt: '2026-10-07T15:00:00',
          },
        ],
      },
    });

    const opportunity = result.decision.opportunities.find(
      (item) => item.reason === 'meeting_reference_match',
    );

    expect(opportunity?.kind).toBe('meeting');
    expect(opportunity?.entityIds).toContain('meeting-smith');
  });

  it('detects temporal convergence with a meeting when date and time are explicit', () => {
    const result = processCpuInteraction({
      ...base,
      input: {
        type: 'text',
        text: 'I need to call the supplier at 3pm today',
      },
      context: {
        ...base.context,
        meetings: [
          {
            id: 'meeting-supplier',
            text: 'Supplier meeting',
            startAt: '2026-10-07T15:00:00',
          },
        ],
      },
    });

    const opportunity = result.decision.opportunities.find(
      (item) => item.reason === 'meeting_time_convergence',
    );

    expect(opportunity?.kind).toBe('temporal');
    expect(opportunity?.entityIds).toContain('meeting-supplier');
  });

  it('uses working memory as a bridge between worlds without inventing state', () => {
    let memory = emptyWorkingMemory('today');
    memory = remember(
      memory,
      makeMemoryItem({
        id: 'recent-job',
        type: 'job',
        label: 'Grace James',
        source: 'phase8-test',
        confidence: 'high',
        relationships: { location: '64 Grace James Road' },
      }),
    );

    const result = processCpuInteraction({
      ...base,
      input: {
        type: 'text',
        text: 'Drop off clips at 64 Grace James Road',
      },
      workingMemory: memory,
    });

    const opportunity = result.decision.opportunities.find(
      (item) => item.reason === 'working_memory_convergence',
    );

    expect(opportunity?.kind).toBe('memory');
    expect(opportunity?.entityIds).toContain('recent-job');
  });

  it('never lets cross-world opportunities veto a hard commitment', () => {
    const result = processCpuInteraction({
      ...base,
      context: {
        ...base.context,
        remainingMinsToday: 5,
        jobs: [
          {
            id: 'job-grace',
            name: 'Grace James',
            locationText: '64 Grace James Road',
          },
        ],
      },
      input: {
        type: 'text',
        text: 'I need to drop off clips to 64 Grace James Road in Pukekohe at 4pm today',
      },
    });

    expect(result.decision.authority.commitmentClass).toBe('HARD_COMMITMENT');
    expect(result.decision.authority.mayAct).toBe(true);
    expect(result.decision.outcome).toBe('ACT');
    expect(result.decision.action?.kind).toBe('create_task');
  });
});
