/**
 * Semantic interpretation boundary.
 *
 * This is the layer between raw language and the operating engine.
 * It does not execute actions and does not invent facts. It combines the
 * existing deterministic request interpreter with contextual reference
 * resolution and exposes one structured semantic object for reasoning.
 *
 * No LLM. No external model. No second memory system.
 */

import type {
  Confidence,
  EngineRequest,
  MemoryItem,
  WorkingMemorySnapshot,
} from './types';
import { interpretRequestUtterance } from './request';
import { resolveReference, containsReference } from './references';

export type SemanticSpeechAct =
  | 'request'
  | 'correction'
  | 'question'
  | 'observation'
  | 'unknown';

export type SemanticReference = {
  phrase: string;
  status: 'resolved' | 'ambiguous' | 'unknown';
  targetId: string | null;
  targetKind: string | null;
  targetLabel: string | null;
  candidates: Array<{ id: string; kind: string; label: string }>;
  reason: string;
};

export type SemanticInterpretation = {
  version: 1;
  rawText: string;
  normalizedText: string;
  speechAct: SemanticSpeechAct;
  intent: EngineRequest['action'];
  objectText: string | null;
  locationText: string | null;
  dateHint: string | null;
  timeHint: string | null;
  relatedJobText: string | null;
  relatedMeetingText: string | null;
  isRefinement: boolean;
  isCorrection: boolean;
  confidence: Confidence;
  reference: SemanticReference | null;
  evidence: string[];
};

export type SemanticInterpretationContext = {
  workingMemory: WorkingMemorySnapshot;
  currentFocus?: {
    kind: string;
    id: string | null;
    label: string | null;
  } | null;
  jobs?: Array<{ id: string; name: string }>;
  meetings?: Array<{ id: string; text: string }>;
};

function speechActFor(
  text: string,
  parsed: ReturnType<typeof interpretRequestUtterance>
): SemanticSpeechAct {
  const lower = text.toLowerCase();

  if (parsed.isCorrection) return 'correction';

  if (
    /\?\s*$/.test(text) ||
    /^(?:can|could|do|does|should|is|are|will|what|when|where|why|how)\b/i.test(lower)
  ) {
    return 'question';
  }

  if (parsed.action && parsed.action !== 'unknown') return 'request';

  return 'observation';
}

function confidenceFor(
  parsed: ReturnType<typeof interpretRequestUtterance>,
  reference: SemanticReference | null
): Confidence {
  if (reference?.status === 'ambiguous') return 'low';
  if (parsed.confidence === 'high') return 'high';
  if (reference?.status === 'resolved') {
    return parsed.confidence === 'low' || !parsed.confidence ? 'medium' : parsed.confidence;
  }
  if (parsed.action && parsed.action !== 'unknown' && parsed.objectText) return 'medium';
  return parsed.confidence ?? 'low';
}

/**
 * Interpret one utterance into semantic slots.
 *
 * This deliberately stops before authority and execution. The result is safe
 * to inspect, test, log, learn from, or pass to the thinking engine.
 */
export function interpretSemanticInput(
  rawText: string,
  context: SemanticInterpretationContext
): SemanticInterpretation {
  const normalizedText = rawText.replace(/\s+/g, ' ').trim();
  const parsed = interpretRequestUtterance(normalizedText);

  let reference: SemanticReference | null = null;

  if (containsReference(normalizedText)) {
    const contextReferents: MemoryItem[] = [
      ...(context.jobs ?? []).map((job) => ({
        id: job.id,
        type: 'job' as const,
        label: job.name,
        source: 'current_context',
        timestamp: new Date().toISOString(),
        salience: 0.55,
        confidence: 'medium' as const,
        relationships: {},
      })),
      ...(context.meetings ?? []).map((meeting) => ({
        id: meeting.id,
        type: 'meeting' as const,
        label: meeting.text,
        source: 'current_context',
        timestamp: new Date().toISOString(),
        salience: 0.55,
        confidence: 'medium' as const,
        relationships: {},
      })),
    ];

    const resolved = resolveReference(normalizedText, context.workingMemory, {
      extraReferents: contextReferents,
    });

    reference = {
      phrase: normalizedText.match(/\b(this|that|it|these|those|the\s+last\s+one|the\s+other\s+one|the\s+previous\s+(?:one|task|job)|the\s+job|that\s+job|the\s+meeting|there|here)\b/i)?.[1]?.toLowerCase() ?? normalizedText,
      status: resolved.status,
      targetId: resolved.item?.id ?? null,
      targetKind: resolved.item?.type ?? null,
      targetLabel: resolved.item?.label ?? null,
      candidates: resolved.candidates.map((candidate) => ({
        id: candidate.id,
        kind: candidate.type,
        label: candidate.label,
      })),
      reason: resolved.reason,
    };
  }

  const evidence: string[] = [];

  if (parsed.action && parsed.action !== 'unknown') {
    evidence.push(`intent:${parsed.action}`);
  }
  if (parsed.objectText) evidence.push('object:explicit');
  if (parsed.locationText) evidence.push('location:explicit');
  if (parsed.dateHint) evidence.push(`date:${parsed.dateHint}`);
  if (parsed.timeHint) evidence.push(`time:${parsed.timeHint}`);
  if (parsed.isCorrection) evidence.push('speech_act:correction');
  if (parsed.isRefinement) evidence.push('speech_act:refinement');
  if (reference?.status === 'resolved') {
    evidence.push(`reference:${reference.targetLabel ?? reference.phrase}`);
  }
  if (reference?.status === 'ambiguous') evidence.push('reference:ambiguous');

  return {
    version: 1,
    rawText,
    normalizedText,
    speechAct: speechActFor(normalizedText, parsed),
    intent: parsed.action ?? 'unknown',
    objectText: parsed.objectText ?? null,
    locationText: parsed.locationText ?? null,
    dateHint: parsed.dateHint ?? null,
    timeHint: parsed.timeHint ?? null,
    relatedJobText: parsed.relatedJobText ?? null,
    relatedMeetingText: parsed.relatedMeetingText ?? null,
    isRefinement: parsed.isRefinement,
    isCorrection: parsed.isCorrection,
    confidence: confidenceFor(parsed, reference),
    reference,
    evidence,
  };
}
