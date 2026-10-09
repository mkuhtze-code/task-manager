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
import { resolveReference, containsReference, extractReferencePhrase } from './references';
import { parseSemanticGrammar } from './semanticGrammar';

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
  /** Explicit semantic frame preserved before task-title rendering. */
  primaryVerb: string | null;
  personText: string | null;
  purposeText: string | null;
  subjectText: string | null;
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
  /** Phase 12 explicit role graph extracted by deterministic grammar. */
  grammar: ReturnType<typeof parseSemanticGrammar>;
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
  const grammar = parseSemanticGrammar(normalizedText);

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

    const phrase = extractReferencePhrase(normalizedText) ?? normalizedText;
    if (resolved.status === 'resolved') {
      reference = {
        phrase,
        status: 'resolved',
        targetId: resolved.item.id,
        targetKind: resolved.item.type,
        targetLabel: resolved.item.label,
        candidates: [],
        reason: resolved.reason,
      };
    } else if (resolved.status === 'ambiguous') {
      reference = {
        phrase,
        status: 'ambiguous',
        targetId: null,
        targetKind: null,
        targetLabel: null,
        candidates: resolved.candidates.map((candidate) => ({
          id: candidate.id,
          kind: candidate.type,
          label: candidate.label,
        })),
        reason: resolved.reason,
      };
    } else {
      reference = {
        phrase,
        status: 'unknown',
        targetId: null,
        targetKind: null,
        targetLabel: null,
        candidates: [],
        reason: resolved.reason,
      };
    }
  }

  const hasGrammarRelations = grammar.relations.length > 0;
  const grammarOwnsCommunicationSlots =
    grammar.primaryVerb != null &&
    /^(?:call|ring|phone|email|text|message|contact|ask|tell|chase|follow\\s*up|check)$/i.test(
      grammar.primaryVerb
    );

  // Keep the semantic interpretation contract aligned with the structured
  // grammar consumed by orchestration. For supported role frames, grammar
  // slots are authoritative; legacy parsing remains the fallback elsewhere.
  const primaryVerb = grammar.primaryVerb ?? parsed.primaryVerb ?? null;
  const personText = hasGrammarRelations
    ? grammar.personText ?? null
    : grammarOwnsCommunicationSlots
      ? null
      : parsed.personText ?? null;
  const purposeText = hasGrammarRelations
    ? grammar.purposeText ?? null
    : grammarOwnsCommunicationSlots
      ? null
      : parsed.purposeText ?? null;
  const subjectText = hasGrammarRelations
    ? grammar.subjectText ?? null
    : parsed.subjectText ?? null;
  const objectText = hasGrammarRelations
    ? grammar.objectText ?? null
    : parsed.objectText ?? null;
  const locationText = hasGrammarRelations
    ? grammar.locationText ?? null
    : parsed.locationText ?? null;

  const evidence: string[] = [];

  if (parsed.action && parsed.action !== 'unknown') {
    evidence.push(`intent:${parsed.action}`);
  }
  if (primaryVerb) evidence.push(`primary_verb:${primaryVerb}`);
  if (personText) evidence.push('person:explicit');
  if (purposeText) evidence.push('purpose:explicit');
  if (subjectText) evidence.push('subject:explicit');
  if (objectText) evidence.push('object:explicit');
  if (locationText) evidence.push('location:explicit');
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
    primaryVerb,
    personText,
    purposeText,
    subjectText,
    objectText,
    locationText,
    dateHint: parsed.dateHint ?? null,
    timeHint: parsed.timeHint ?? null,
    relatedJobText: parsed.relatedJobText ?? null,
    relatedMeetingText: parsed.relatedMeetingText ?? null,
    isRefinement: parsed.isRefinement,
    isCorrection: parsed.isCorrection,
    confidence: confidenceFor(parsed, reference),
    reference,
    evidence,
    grammar,
  };
}
