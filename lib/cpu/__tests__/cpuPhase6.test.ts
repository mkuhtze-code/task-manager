import { describe, expect, it } from 'vitest';
import { DEFAULT_BRAINS, processCpuInteraction } from '../index';
import { emptyWorkingMemory, makeMemoryItem, remember, setFocus } from '@/lib/engine/workingMemory';

const base = {
  userId: 'cpu-phase6-test',
  input: {
    type: 'text' as const,
    text: 'I need to drop off clips to 64 Grace James Road in Pukekohe at 4pm today',
  },
  context: {
    interface: 'capture',
    surface: 'today',
    todayDate: '2026-10-07',
    remainingMinsToday: 10,
    openTaskCount: 3,
    jobs: [{ id: 'job-1', name: 'Grace James', locationText: 'Grace James Road' }],
    meetings: [],
  },
  dryRun: true,
};

describe('Dokkit CPU Phase 6 brain activation', () => {
  it('activates every specialist brain without changing the authoritative action', () => {
    const result = processCpuInteraction(base);
    const ids = result.contributions.map(c => c.brain);

    expect(ids).toEqual([
      'thinking',
      'speech',
      'tasks',
      'jobs',
      'meetings',
      'travel',
      'calendar',
      'location',
      'memory',
      'learning',
      'authority',
    ]);

    expect(result.decision.outcome).toBe('ACT');
    expect(result.decision.action?.kind).toBe('create_task');
    expect(result.decision.authority.mayAct).toBe(true);
  });

  it('lets specialist brains contribute observations rather than competing decisions', () => {
    const result = processCpuInteraction(base);
    const byBrain = new Map(result.contributions.map(c => [c.brain, c]));

    expect(byBrain.get('speech')?.observations.some(o => o.value.includes('date='))).toBe(true);
    expect(byBrain.get('tasks')?.observations.some(o => o.value.includes('task_intent='))).toBe(true);
    expect(byBrain.get('jobs')?.observations.some(o => o.value.includes('matched_job=job-1'))).toBe(true);
    expect(byBrain.get('location')?.observations.some(o => o.value.includes('requested_location='))).toBe(true);
    expect(byBrain.get('authority')?.observations.some(o => o.value.includes('mayAct=true'))).toBe(true);
  });

  it('promotes working memory into universal context without inventing lists or calendar state', () => {
    let memory = emptyWorkingMemory('today');
    memory = remember(memory, makeMemoryItem({
      id: 'loc-1',
      type: 'location',
      label: '64 Grace James Road',
      source: 'test',
      confidence: 'high',
    }));
    memory = remember(memory, makeMemoryItem({
      id: 'job-1',
      type: 'job',
      label: 'Grace James',
      source: 'test',
      confidence: 'high',
    }));
    memory = setFocus(memory, { kind: 'job', id: 'job-1', label: 'Grace James' });

    const result = processCpuInteraction({ ...base, workingMemory: memory });

    expect(result.context.memory.learned.map(x => x.label)).toEqual([
      'Grace James',
      '64 Grace James Road',
    ]);
    expect(result.context.current.focus?.id).toBe('job-1');
    expect(result.context.collections.lists).toEqual([]);
    expect(result.context.commitments.calendar.available).toBe(false);
  });

  it('does not create a fake calendar signal when only meetings are present', () => {
    const result = processCpuInteraction({
      ...base,
      context: {
        ...base.context,
        meetings: [{ id: 'm1', text: 'Site meeting', startAt: '2026-10-07T15:00:00Z', durationMins: 60 }],
      },
    });

    expect(result.context.commitments.calendar.available).toBe(false);
    expect(result.context.commitments.calendar.commitments).toEqual([]);
    expect(result.context.commitments.meetings.items).toHaveLength(1);
  });

  it('keeps the Phase 5 Grace James commitment regression permanently protected', () => {
    const result = processCpuInteraction({
      ...base,
      context: { ...base.context, jobs: [] },
    });

    expect(result.decision.outcome).toBe('ACT');
    expect(result.decision.authority.commitmentClass).toBe('HARD_COMMITMENT');
    expect(result.decision.authority.mayAct).toBe(true);
  });
});

describe('Dokkit CPU Phase 6 brain registry', () => {
  it('contains unique brain ids', () => {
    const ids = DEFAULT_BRAINS.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
