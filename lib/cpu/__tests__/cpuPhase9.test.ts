import { describe, expect, it } from 'vitest';
import { processCpuInteraction } from '@/lib/cpu';
import { rankOpportunities, selectSurfaceOpportunity } from '../reconcile/opportunityRanker';

const base = {
  userId: 'phase9-test',
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

const makeOpportunity = (overrides = {}) => ({
  kind: 'job' as const,
  message: 'The location matches the job.',
  confidence: 'high' as const,
  entityIds: ['job-1'],
  reason: 'job_location_convergence',
  ...overrides,
});

describe('Dokkit CPU Phase 9 — opportunity engine', () => {
  it('surfaces a high-confidence, high-value connection without changing authority', () => {
    const cpu = processCpuInteraction({
      ...base,
      input: {
        type: 'text',
        text: 'Go to the post office sometime today',
      },
      context: {
        ...base.context,
        jobs: [
          {
            id: 'job-post',
            name: 'Friday collection',
            locationText: 'Post Office',
          },
        ],
      },
    });

    const ranked = cpu.decision.rankedOpportunities;
    expect(ranked[0]?.disposition).toBe('surface');
    expect(cpu.decision.surfaceOpportunity?.entityIds).toContain('job-post');
    expect(cpu.decision.recommendedAction).toBe(cpu.decision.action);
  });

  it('turns a useful medium-confidence spatial connection into a suggestion, not an interruption', () => {
    const cpu = processCpuInteraction({
      ...base,
      input: {
        type: 'text',
        text: 'Go to the post office sometime today',
      },
    });

    const ranked = rankOpportunities(
      [makeOpportunity({ kind: 'spatial', confidence: 'medium', entityIds: [] })],
      { context: cpu.context, interaction: cpu.decision.interaction },
    );

    expect(ranked[0]?.score).toBe(68);
    expect(ranked[0]?.disposition).toBe('suggest');
    expect(selectSurfaceOpportunity(ranked, cpu.decision.interaction)).toBeNull();
  });

  it('keeps weaker memory connections internal', () => {
    const cpu = processCpuInteraction({
      ...base,
      input: {
        type: 'text',
        text: 'Check something related to the recent job',
      },
    });

    const ranked = rankOpportunities(
      [makeOpportunity({ kind: 'memory', confidence: 'medium', entityIds: ['memory-1'] })],
      { context: cpu.context, interaction: cpu.decision.interaction },
    );

    expect(ranked[0]?.disposition).toBe('retain');
  });

  it('never surfaces an opportunity over an explicit hard commitment', () => {
    const cpu = processCpuInteraction({
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

    expect(cpu.decision.authority.commitmentClass).toBe('HARD_COMMITMENT');
    expect(cpu.decision.authority.mayAct).toBe(true);
    expect(cpu.decision.outcome).toBe('ACT');
    expect(cpu.decision.action?.kind).toBe('create_task');
    expect(cpu.decision.surfaceOpportunity).toBeNull();
  });

  it('does not mutate its input opportunities', () => {
    const input = makeOpportunity();
    const copy = JSON.parse(JSON.stringify(input));
    const cpu = processCpuInteraction(base);

    rankOpportunities(
      [input],
      { context: cpu.context, interaction: cpu.decision.interaction },
    );

    expect(input).toEqual(copy);
  });
});
