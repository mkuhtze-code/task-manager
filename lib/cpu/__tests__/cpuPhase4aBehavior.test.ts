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
