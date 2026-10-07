import { describe, expect, it } from 'vitest';
import { emptyBeliefGraph } from '../beliefs';
import {
  activeBehaviorBelief,
  observeBehavior,
  updateBehaviorBeliefs,
} from '../behavior';
import { rankOpportunities } from '../reconcile/opportunityRanker';

const requestFor = (id: string) => ({
  id,
  action: 'create_task',
  objectText: 'x',
  locationText: null,
  relatedJobText: null,
  relatedMeetingText: null,
  dateHint: null,
  timeHint: null,
  urgency: null,
  flexibility: null,
  commitment: null,
  constraints: [],
  rawUtterances: [],
}) as never;

const temporalOpportunity = {
  kind: 'temporal' as const,
  message: 'Useful timing connection',
  confidence: 'medium' as const,
  entityIds: [],
  reason: 'timing',
};

const rankingBase = (beliefs: ReturnType<typeof emptyBeliefGraph>) => ({
  context: {
    beliefs,
    constraints: { remainingMinsToday: 120 },
    movement: { travel: null },
  } as never,
  interaction: {
    request: { action: 'create_task', objectText: 'x', locationText: null },
  } as never,
});

describe('CPU Phase 4 — behavioural learning', () => {
  it('records an explicit acceptance without treating engine execution as acceptance', () => {
    const evidence = observeBehavior({
      event: 'accepted',
      requestId: 'r1',
      value: true,
      timestamp: '2026-10-08T08:00:00.000Z',
    });

    expect(evidence.kind).toBe('acceptance');
    expect(evidence.payload.source).toBe('behavior_observation');
    expect(evidence.payload.explicitUserSignal).toBe(true);
  });

  it('creates a stable user-scoped belief from repeated behaviour', () => {
    const first = observeBehavior({
      event: 'rescheduled',
      requestId: 'r1',
      value: 'tomorrow',
      timestamp: '2026-10-08T08:00:00.000Z',
    });
    const second = observeBehavior({
      event: 'rescheduled',
      requestId: 'r2',
      value: 'tomorrow',
      timestamp: '2026-10-09T08:00:00.000Z',
    });

    const graph = updateBehaviorBeliefs(
      emptyBeliefGraph(),
      'user-1',
      [first, second]
    );
    const belief = activeBehaviorBelief(graph, 'timing.unknown');

    expect(belief?.value).toBe('tomorrow');
    expect(belief?.supportingEvidence).toHaveLength(2);
  });

  it('preserves a previous value as contradicting evidence when behaviour changes', () => {
    const morning = observeBehavior({
      event: 'rescheduled',
      requestId: 'r1',
      value: 'tomorrow',
      timestamp: '2026-10-08T08:00:00.000Z',
    });
    const later = observeBehavior({
      event: 'rescheduled',
      requestId: 'r2',
      value: 'today',
      timestamp: '2026-10-09T08:00:00.000Z',
    });

    const graph = updateBehaviorBeliefs(
      emptyBeliefGraph(),
      'user-1',
      [morning, later]
    );
    const belief = activeBehaviorBelief(graph, 'timing.unknown');

    expect(belief?.value).toBe('today');
    expect(belief?.contradictingEvidence).toHaveLength(1);
    expect(belief?.supersedes).toContain('tomorrow');
  });

  it('does not learn from unrelated evidence', () => {
    const graph = updateBehaviorBeliefs(
      emptyBeliefGraph(),
      'user-1',
      [{
        id: 'e1',
        kind: 'interpretation',
        timestamp: '2026-10-08T08:00:00.000Z',
        requestId: 'r1',
        payload: { source: 'request' },
      }]
    );

    expect(graph.beliefs).toHaveLength(0);
  });

  it('raises fit when repeated work outcomes show that the user usually completes it', () => {
    const graph = updateBehaviorBeliefs(
      emptyBeliefGraph(),
      'user-1',
      [
        observeBehavior({
          event: 'completed',
          request: requestFor('r1'),
          taskId: 't1',
          timestamp: '2026-10-08T08:00:00.000Z',
        }),
        observeBehavior({
          event: 'completed',
          request: requestFor('r2'),
          taskId: 't2',
          timestamp: '2026-10-09T08:00:00.000Z',
        }),
      ]
    );

    const belief = activeBehaviorBelief(graph, 'outcome.create_task');
    expect(belief?.value).toBe('completed');
    expect(belief?.supportingEvidence).toHaveLength(2);

    const ranked = rankOpportunities([temporalOpportunity], rankingBase(graph));
    expect(ranked[0]?.score).toBe(81);
    expect(ranked[0]?.reasons).toContain(
      'this kind of work usually fits when suggested'
    );
  });

  it('does not let one carry override an established outcome pattern', () => {
    const graph = updateBehaviorBeliefs(
      emptyBeliefGraph(),
      'user-1',
      [
        observeBehavior({
          event: 'completed',
          request: requestFor('r1'),
          taskId: 't1',
          timestamp: '2026-10-08T08:00:00.000Z',
        }),
        observeBehavior({
          event: 'completed',
          request: requestFor('r2'),
          taskId: 't2',
          timestamp: '2026-10-09T08:00:00.000Z',
        }),
        observeBehavior({
          event: 'carried',
          request: requestFor('r3'),
          taskId: 't3',
          timestamp: '2026-10-10T08:00:00.000Z',
        }),
      ]
    );

    const belief = activeBehaviorBelief(graph, 'outcome.create_task');
    expect(belief?.value).toBe('carried');
    expect(belief?.supportingEvidence).toHaveLength(1);
    expect(belief?.contradictingEvidence.length).toBeGreaterThan(0);

    const ranked = rankOpportunities([temporalOpportunity], rankingBase(graph));
    expect(ranked[0]?.score).toBe(71);
  });

  it('learns repeated carry-forward as a negative fit signal', () => {
    const graph = updateBehaviorBeliefs(
      emptyBeliefGraph(),
      'user-1',
      [
        observeBehavior({
          event: 'carried',
          request: requestFor('r1'),
          taskId: 't1',
          timestamp: '2026-10-08T08:00:00.000Z',
        }),
        observeBehavior({
          event: 'carried',
          request: requestFor('r2'),
          taskId: 't2',
          timestamp: '2026-10-09T08:00:00.000Z',
        }),
      ]
    );

    const ranked = rankOpportunities([temporalOpportunity], rankingBase(graph));
    expect(ranked[0]?.score).toBe(63);
    expect(ranked[0]?.reasons).toContain(
      'this kind of work is often carried forward'
    );
  });
});
