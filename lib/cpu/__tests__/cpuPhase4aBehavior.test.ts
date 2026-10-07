import { describe, expect, it } from 'vitest';
import { emptyBeliefGraph } from '../beliefs';
import {
  activeBehaviorBelief,
  observeBehavior,
  updateBehaviorBeliefs,
} from '../behavior';

describe('CPU Phase 4A — behavioural learning', () => {
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
});


  it('raises fit for a suggestion the user repeatedly accepts', async () => {
    const { rankOpportunities } = await import('../reconcile/opportunityRanker');
    const belief = updateBehaviorBeliefs(
      emptyBeliefGraph(),
      'user-1',
      [
        observeBehavior({
          event: 'accepted',
          request: { id: 'r1', action: 'create_task', objectText: 'x', locationText: null, relatedJobText: null, relatedMeetingText: null, dateHint: null, timeHint: null, urgency: null, flexibility: null, commitment: null, constraints: [], rawUtterances: [] } as never,
          value: 'accepted',
          timestamp: '2026-10-08T08:00:00.000Z',
        }),
        observeBehavior({
          event: 'accepted',
          request: { id: 'r2', action: 'create_task', objectText: 'x', locationText: null, relatedJobText: null, relatedMeetingText: null, dateHint: null, timeHint: null, urgency: null, flexibility: null, commitment: null, constraints: [], rawUtterances: [] } as never,
          value: 'accepted',
          timestamp: '2026-10-09T08:00:00.000Z',
        }),
      ]
    );

    const opportunity = {
      kind: 'temporal',
      message: 'Useful timing connection',
      confidence: 'medium',
      entityIds: [],
      reason: 'timing',
    } as const;

    const base = {
      context: {
        beliefs: belief,
        constraints: { remainingMinsToday: 120 },
        movement: { travel: null },
      } as never,
      interaction: {
        request: { action: 'create_task', objectText: 'x', locationText: null },
      } as never,
    };

    const ranked = rankOpportunities([opportunity], base);
    expect(ranked[0]?.score).toBe(71);
    expect(ranked[0]?.reasons).toContain('you usually accept this kind of suggestion');
  });
