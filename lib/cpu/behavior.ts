/**
 * Phase 4A — deterministic behavioural learning.
 *
 * Converts explicit user behaviour into LearningEvidence and stable behavioural
 * beliefs. It never treats an engine decision or automatic execution as proof
 * that the user preferred that outcome.
 */

import type { EngineAction, EngineRequest, LearningEvidence } from '@/lib/engine';
import { type BeliefGraph, type EvidenceStrength, activeBelief } from './beliefs';

export type BehaviorEvent =
  | 'accepted' | 'rejected' | 'rescheduled' | 'completed'
  | 'partial' | 'carried' | 'skipped' | 'edited';

export type BehaviorObservation = {
  event: BehaviorEvent;
  requestId?: string | null;
  taskId?: string | null;
  action?: EngineAction | null;
  request?: EngineRequest | null;
  value?: string | number | boolean | null;
  detail?: string | null;
  timestamp?: string;
};

function hash(value: string): string {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function evidenceKind(event: BehaviorEvent): LearningEvidence['kind'] {
  if (event === 'accepted') return 'acceptance';
  if (event === 'rejected') return 'rejection';
  if (event === 'edited') return 'correction';
  return 'outcome';
}

function actionLabel(action: EngineAction | null | undefined): string | null {
  return action?.kind ?? null;
}

function featureFor(observation: BehaviorObservation): string {
  const request = observation.request;
  const action = actionLabel(observation.action);

  if (observation.event === 'rescheduled') {
    return 'timing.' + (request?.action ?? action ?? 'unknown');
  }

  if (
    observation.event === 'completed' ||
    observation.event === 'partial' ||
    observation.event === 'carried' ||
    observation.event === 'skipped'
  ) {
    return 'outcome.' + (request?.action ?? action ?? 'unknown');
  }

  if (observation.event === 'edited') {
    return 'editing.' + (request?.action ?? action ?? 'unknown');
  }

  return 'response.' + (request?.action ?? action ?? 'unknown');
}

function semanticFeaturesFor(observation: BehaviorObservation): string[] {
  const request = observation.request;
  const primaryVerb = request?.primaryVerb?.trim().toLowerCase();
  if (!primaryVerb) return [];

  const prefix =
    observation.event === 'rescheduled'
      ? 'timing'
      : observation.event === 'edited'
        ? 'editing'
        : observation.event === 'accepted' || observation.event === 'rejected'
          ? 'response'
          : 'outcome';

  return [prefix + '.verb.' + primaryVerb];
}

function featuresFor(observation: BehaviorObservation): string[] {
  return [featureFor(observation), ...semanticFeaturesFor(observation)];
}

function valueFor(observation: BehaviorObservation): string {
  if (observation.value !== null && observation.value !== undefined) {
    return String(observation.value);
  }
  return observation.event;
}

function evidenceId(observation: BehaviorObservation, timestamp: string): string {
  return 'behavior_' + hash([
    observation.requestId ?? observation.request?.id ?? 'none',
    observation.taskId ?? 'none',
    observation.event,
    valueFor(observation),
    timestamp,
  ].join('|'));
}

/**
 * Record one observed user behaviour as evidence.
 *
 * Call this only when the application has a real behavioural signal. An
 * automatically executed action is not an acceptance signal.
 */
export function observeBehavior(
  observation: BehaviorObservation
): LearningEvidence {
  const timestamp = observation.timestamp ?? new Date().toISOString();
  const requestId = observation.requestId ?? observation.request?.id ?? null;

  return {
    id: evidenceId(observation, timestamp),
    kind: evidenceKind(observation.event),
    timestamp,
    requestId,
    payload: {
      source: 'behavior_observation',
      event: observation.event,
      feature: featureFor(observation),
      semanticFeatures: semanticFeaturesFor(observation),
      value: valueFor(observation),
      action: actionLabel(observation.action),
      taskId: observation.taskId ?? null,
      detail: observation.detail ?? null,
      explicitUserSignal: true,
    },
  };
}

function behaviorBeliefId(userId: string | null, feature: string): string {
  return 'behavior_' + hash((userId ?? 'anonymous') + '|' + feature);
}

function confidenceForStrength(strength: EvidenceStrength): 'low' | 'medium' | 'high' {
  if (strength >= 4) return 'high';
  if (strength >= 3) return 'medium';
  return 'low';
}

function strengthForBehavior(evidence: LearningEvidence): EvidenceStrength {
  if (evidence.kind === 'correction') return 5;
  return 3;
}

/**
 * Fold behavioural evidence into stable user-scoped beliefs.
 *
 * Beliefs are feature-scoped rather than request-scoped, so repeated behaviour
 * can accumulate across tasks. Contradictions remain visible and a newer
 * observation of equal strength becomes the active value.
 */
export function updateBehaviorBeliefs(
  previous: BeliefGraph,
  userId: string | null,
  evidence: LearningEvidence[]
): BeliefGraph {
  let graph = previous;

  for (const event of evidence) {
    if (event.payload.source !== 'behavior_observation') continue;

    const primaryFeatures = Array.isArray(event.payload.semanticFeatures)
      ? event.payload.semanticFeatures.filter((item): item is string => typeof item === 'string')
      : [];
    const features = [
      typeof event.payload.feature === 'string' ? event.payload.feature : null,
      ...primaryFeatures,
    ].filter((item): item is string => Boolean(item));
    const value =
      typeof event.payload.value === 'string' ? event.payload.value : null;
    if (!features.length || !value) continue;

    for (const feature of features) {
    const id = behaviorBeliefId(userId, feature);
    const strength = strengthForBehavior(event);
    const ref = {
      id: event.id,
      kind: event.kind,
      strength,
      timestamp: event.timestamp,
      requestId: event.requestId,
      source: 'behavior_observation',
    };

    const current = graph.beliefs.find((belief) => belief.id === id);

    if (!current) {
      graph = {
        ...graph,
        beliefs: [{
          id,
          key: 'behavior.' + feature,
          value,
          confidence: confidenceForStrength(strength),
          strength,
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
          scope: { userId, requestId: event.requestId },
          supportingEvidence: [ref],
          contradictingEvidence: [],
          supersedes: [],
        }, ...graph.beliefs].slice(0, 200),
        updatedAt: event.timestamp,
      };
      continue;
    }

    const supports = current.value === value;
    const shouldReplace =
      !supports &&
      (strength > current.strength ||
        (strength === current.strength && event.timestamp >= current.updatedAt));

    const supportingEvidence = supports
      ? [ref, ...current.supportingEvidence.filter((item) => item.id !== ref.id)].slice(0, 8)
      : shouldReplace
        ? [ref]
        : current.supportingEvidence;
    const contradictingEvidence = supports
      ? current.contradictingEvidence
      : shouldReplace
        ? [...current.contradictingEvidence, ...current.supportingEvidence]
            .filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index)
            .slice(0, 8)
        : [ref, ...current.contradictingEvidence.filter((item) => item.id !== ref.id)].slice(0, 8);

    graph = {
      ...graph,
      beliefs: graph.beliefs.map((belief) =>
        belief.id !== id ? belief : {
          ...belief,
          value: shouldReplace ? value : belief.value,
          confidence: shouldReplace ? confidenceForStrength(strength) : belief.confidence,
          strength: shouldReplace ? strength : belief.strength,
          updatedAt: event.timestamp,
          scope: {
            ...belief.scope,
            requestId: event.requestId ?? belief.scope.requestId,
          },
          supportingEvidence,
          contradictingEvidence,
          supersedes:
            shouldReplace && value !== belief.value
              ? [...belief.supersedes, belief.value].slice(-8)
              : belief.supersedes,
        }
      ),
      updatedAt: event.timestamp,
    };
  }

  return graph;
}

export function activeBehaviorBelief(
  graph: BeliefGraph,
  feature: string
) {
  return activeBelief(graph, 'behavior.' + feature);
}
