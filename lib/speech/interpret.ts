/**
 * Speech → structured communication signals.
 * Deterministic. Reuses communication.understand where helpful.
 * Never invents high confidence.
 */

import { understand } from '@/lib/communication/understand';
import type { PersonalCommunicationProfile, StatementType } from '@/lib/communication/types';
import { normaliseSpeech } from './normalise';
import type {
  AmbiguityLevel,
  CommitmentStrength,
  ConstraintSignal,
  EntityMention,
  SpeechCertainty,
  SpeechIntent,
  SpeechInterpretation,
  TemporalReference,
  UrgencySignal,
  Confidence,
} from './types';

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `si-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const INTENT_PATTERNS: { re: RegExp; intent: SpeechIntent }[] = [
  { re: /\b(?:remind\s+me|remember\s+to|don'?t\s+forget|i\s+need\s+to\s+remember)\b/i, intent: 'remember' },
  { re: /\b(?:schedule|book|put\s+(?:it\s+)?on\s+(?:my\s+)?calendar)\b/i, intent: 'schedule' },
  { re: /\b(?:postpone|defer|push\s+(?:it\s+)?(?:out|back)|move\s+(?:it\s+)?to)\b/i, intent: 'postpone' },
  { re: /\b(?:cancel|scrub|drop\s+that)\b/i, intent: 'cancel' },
  { re: /\b(?:done|finished|complete(?:d)?|mark\s+(?:it\s+)?done)\b/i, intent: 'complete' },
  { re: /\b(?:create\s+(?:a\s+)?(?:job|task)|new\s+job|add\s+(?:a\s+)?task)\b/i, intent: 'create' },
  { re: /\b(?:call|email|text|message|meet|send)\b/i, intent: 'create' },
  { re: /\b(?:i\s+need\s+to|need\s+to|have\s+to|got\s+to|gotta)\b/i, intent: 'plan' },
  { re: /\b(?:can\s+you|could\s+you|what(?:'s|\s+is)|how\s+(?:do|does))\b/i, intent: 'ask' },
  { re: /\b(?:note|observe|noticed|saw\s+that)\b/i, intent: 'observe' },
];

const CERTAINTY_PATTERNS: { re: RegExp; certainty: SpeechCertainty; weight: number }[] = [
  { re: /\b(?:absolutely|definitely|must|have\s+to|no\s+matter\s+what|i\s+will)\b/i, certainty: 'definite', weight: 3 },
  { re: /\b(?:certainly|sure(?:ly)?|for\s+sure)\b/i, certainty: 'likely', weight: 2 },
  { re: /\b(?:probably|likely|should)\b/i, certainty: 'probable', weight: 2 },
  { re: /\b(?:i(?:'ll| will)\s+try|try\s+(?:and|to)|hopefully|might)\b/i, certainty: 'tentative', weight: 2 },
  { re: /\b(?:maybe|perhaps|possibly|not\s+sure|unsure)\b/i, certainty: 'uncertain', weight: 2 },
  { re: /\b(?:sometime|whenever|one\s+day|eventually)\b/i, certainty: 'speculative', weight: 2 },
];

const COMMITMENT_PATTERNS: { re: RegExp; strength: CommitmentStrength }[] = [
  { re: /\b(?:absolutely\s+need|must\s+get|no\s+matter\s+what|critical)\b/i, strength: 'strong' },
  { re: /\b(?:i(?:'ll| will)\s+(?:do|get|sort|finish)|we(?:'ll| will))\b/i, strength: 'moderate' },
  { re: /\b(?:i(?:'ll| will)\s+try|try\s+and|hope\s+to|aim\s+to)\b/i, strength: 'weak' },
  { re: /\b(?:maybe|might|possibly)\b/i, strength: 'weak' },
];

const URGENCY_PATTERNS: { re: RegExp; urgency: UrgencySignal }[] = [
  { re: /\b(?:urgent|asap|right\s+away|immediately|today\s+without\s+fail)\b/i, urgency: 'explicit' },
  { re: /\b(?:need(?:s)?\s+to\s+(?:be\s+)?(?:done|finished)|before\s+monday|deadline)\b/i, urgency: 'implied' },
];

const CONSTRAINT_PATTERNS: { re: RegExp; constraint: ConstraintSignal }[] = [
  { re: /\b(?:after\s+(?:the\s+)?meeting|once\s+i\s+(?:finish|get)|first\s+i\s+need)\b/i, constraint: 'dependency' },
  {
    re: /\b(?:couple\s+of\s+other\s+things|other\s+things\s+i\s+need|busy\s+with|competing)\b/i,
    constraint: 'competing_work',
  },
  { re: /\b(?:waiting\s+(?:on|for)|need\s+(?:him|her|them)\s+to|from\s+(?:him|her))\b/i, constraint: 'person_dependency' },
  { re: /\b(?:at\s+the\s+site|on\s+site|when\s+i(?:'m|\s+am)\s+there)\b/i, constraint: 'location' },
  { re: /\b(?:if\s+i\s+have\s+time|depending\s+on|not\s+sure\s+if)\b/i, constraint: 'uncertainty' },
];

function detectIntent(text: string): { intent: SpeechIntent; reasons: string[] } {
  const reasons: string[] = [];
  for (const { re, intent } of INTENT_PATTERNS) {
    if (re.test(text)) {
      reasons.push(`intent:${intent}`);
      return { intent, reasons };
    }
  }
  if (
    /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday)/i.test(
      text
    )
  ) {
    reasons.push('intent:remember(short_fragment)');
    return { intent: 'remember', reasons };
  }
  return { intent: 'unknown', reasons: ['intent:unknown'] };
}

function detectCertainty(text: string): { certainty: SpeechCertainty; reasons: string[] } {
  const reasons: string[] = [];
  let best: SpeechCertainty = 'unknown';
  let bestW = 0;
  for (const { re, certainty, weight } of CERTAINTY_PATTERNS) {
    if (re.test(text) && weight > bestW) {
      best = certainty;
      bestW = weight;
      reasons.push(`certainty:${certainty}`);
    }
  }
  if (best === 'unknown' && /\bi(?:'ll| will)\b/i.test(text) && !/\btry\b/i.test(text)) {
    best = 'likely';
    reasons.push('certainty:likely(will)');
  }
  return { certainty: best, reasons };
}

function detectCommitment(text: string): { strength: CommitmentStrength; reasons: string[] } {
  const reasons: string[] = [];
  for (const { re, strength } of COMMITMENT_PATTERNS) {
    if (re.test(text)) {
      reasons.push(`commitment:${strength}`);
      return { strength, reasons };
    }
  }
  if (/\bneed\s+to\b/i.test(text)) {
    reasons.push('commitment:moderate(need_to)');
    return { strength: 'moderate', reasons };
  }
  return { strength: 'none', reasons: ['commitment:none'] };
}

function detectUrgency(text: string): { urgency: UrgencySignal; reasons: string[] } {
  const reasons: string[] = [];
  for (const { re, urgency } of URGENCY_PATTERNS) {
    if (re.test(text)) {
      reasons.push(`urgency:${urgency}`);
      return { urgency, reasons };
    }
  }
  return { urgency: 'unknown', reasons: ['urgency:unknown'] };
}

function detectConstraints(text: string): { constraints: ConstraintSignal[]; reasons: string[] } {
  const constraints: ConstraintSignal[] = [];
  const reasons: string[] = [];
  for (const { re, constraint } of CONSTRAINT_PATTERNS) {
    if (re.test(text)) {
      constraints.push(constraint);
      reasons.push(`constraint:${constraint}`);
    }
  }
  if (constraints.length === 0) constraints.push('none');
  return { constraints, reasons };
}

function extractEntities(
  text: string,
  corrections: { originalRaw: string; correctedRaw: string; facet: string }[]
): EntityMention[] {
  const entities: EntityMention[] = [];
  const nameRe = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();
  while ((m = nameRe.exec(text)) !== null) {
    const raw = m[1];
    if (
      /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Today|Tomorrow|I|I'll)$/i.test(raw)
    ) {
      continue;
    }
    if (seen.has(raw)) continue;
    seen.add(raw);
    const wasCorrected = corrections.some(
      (c) => c.facet === 'entity' && (c.correctedRaw.includes(raw) || c.originalRaw.includes(raw))
    );
    entities.push({
      raw,
      kind: 'person',
      resolvedId: null,
      confidence: wasCorrected ? 'medium' : 'low',
      wasCorrected,
    });
  }
  const jobRe =
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(roof|extension|job|site|build|kitchen|bathroom)\b/gi;
  while ((m = jobRe.exec(text)) !== null) {
    const raw = `${m[1]} ${m[2]}`;
    if (seen.has(raw)) continue;
    seen.add(raw);
    entities.push({
      raw,
      kind: 'job',
      resolvedId: null,
      confidence: 'medium',
      wasCorrected: corrections.some(
        (c) => c.facet === 'entity' && c.correctedRaw.toLowerCase().includes(m![2].toLowerCase())
      ),
    });
  }
  return entities;
}

function ambiguityFrom(
  certainty: SpeechCertainty,
  temporals: TemporalReference[],
  intent: SpeechIntent,
  confidence: Confidence
): AmbiguityLevel {
  if (certainty === 'speculative' || certainty === 'uncertain') return 'high';
  if (temporals.some((t) => t.kind === 'vague' || t.confidence === 'low')) return 'high';
  if (intent === 'unknown' || confidence === 'low') return 'partial';
  if (temporals.length === 0 && intent === 'plan') return 'partial';
  return 'none';
}

function buildSurfaceSummary(
  text: string,
  intent: SpeechIntent,
  temporals: TemporalReference[],
  entities: EntityMention[]
): string {
  const parts: string[] = [];
  const person = entities.find((e) => e.kind === 'person');
  const job = entities.find((e) => e.kind === 'job');
  const temporal =
    temporals.find((t) => t.isCorrection) ||
    temporals.find((t) => t.confidence === 'high') ||
    temporals[0];

  if (/\bcall\b/i.test(text) && person) {
    parts.push(`Call ${person.raw}`);
  } else if (/\bmeet\b/i.test(text) && person) {
    parts.push(`Meet ${person.raw}`);
  } else if (intent === 'create' && job) {
    parts.push(`Job: ${job.raw}`);
  } else if (intent === 'remember' || intent === 'plan' || intent === 'create') {
    let core = text
      .replace(/^(?:um|uh|so|okay|ok|right)[,.\s]+/i, '')
      .replace(
        /^(?:i\s+(?:really\s+)?(?:need|want)\s+to\s+(?:remember\s+to\s+)?|remember\s+to\s+|can\s+you\s+remind\s+me\s+to\s+|need\s+to\s+)/i,
        ''
      )
      .trim();
    if (core.length > 80) core = core.slice(0, 77) + '…';
    parts.push(core.charAt(0).toUpperCase() + core.slice(1));
  } else {
    parts.push(text.length > 80 ? text.slice(0, 77) + '…' : text);
  }

  if (temporal?.resolvedDate) {
    parts.push(temporal.raw);
  } else if (temporal?.resolvedTime) {
    parts.push(temporal.resolvedTime);
  }

  return parts.join(' — ').replace(/\s+—\s+$/, '').trim() || text;
}

export type InterpretSpeechOptions = {
  todayIso?: string;
  profile?: PersonalCommunicationProfile | null;
  sessionId?: string;
  transcriptId?: string;
  normalisation?: ReturnType<typeof normaliseSpeech>;
};

export function interpretSpeech(
  rawOrNormalised: string,
  options: InterpretSpeechOptions = {}
): SpeechInterpretation {
  const normalisation =
    options.normalisation ?? normaliseSpeech(rawOrNormalised, { todayIso: options.todayIso });
  const text = normalisation.normalisedText || rawOrNormalised.trim();
  const reasons: string[] = [];

  const intentHit = detectIntent(text);
  reasons.push(...intentHit.reasons);

  const certaintyHit = detectCertainty(text);
  reasons.push(...certaintyHit.reasons);

  const commitmentHit = detectCommitment(text);
  reasons.push(...commitmentHit.reasons);

  const urgencyHit = detectUrgency(text);
  reasons.push(...urgencyHit.reasons);

  const constraintHit = detectConstraints(text);
  reasons.push(...constraintHit.reasons);

  const derived = understand(text, {
    today: options.todayIso,
    profile: options.profile ?? null,
  });
  if (derived.statementType !== 'UNKNOWN') {
    reasons.push(`statementType:${derived.statementType}`);
  }
  if (derived.action) reasons.push(`action:${derived.action}`);

  const temporals = normalisation.temporals;
  const entities = extractEntities(text, normalisation.corrections);

  let confidence: Confidence = normalisation.confidence;
  if (intentHit.intent === 'unknown') {
    confidence = confidence === 'high' ? 'medium' : 'low';
  }
  if (certaintyHit.certainty === 'definite' && commitmentHit.strength === 'strong') {
    confidence = confidence === 'low' ? 'medium' : confidence;
  }
  if (normalisation.corrections.length > 0) {
    reasons.push(`corrections:${normalisation.corrections.length}`);
  }

  const ambiguity = ambiguityFrom(
    certaintyHit.certainty,
    temporals,
    intentHit.intent,
    confidence
  );
  if (ambiguity !== 'none') reasons.push(`ambiguity:${ambiguity}`);

  const statementType: StatementType =
    derived.statementType !== 'UNKNOWN'
      ? derived.statementType
      : intentHit.intent === 'ask'
        ? 'QUESTION'
        : intentHit.intent === 'complete'
          ? 'STATUS_CHANGE'
          : intentHit.intent === 'observe'
            ? 'OBSERVATION'
            : intentHit.intent === 'create' ||
                intentHit.intent === 'remember' ||
                intentHit.intent === 'plan'
              ? 'TASK'
              : 'UNKNOWN';

  const surfaceSummary = buildSurfaceSummary(text, intentHit.intent, temporals, entities);

  const requiresConfirmation =
    ambiguity === 'high' ||
    confidence === 'low' ||
    intentHit.intent === 'unknown' ||
    certaintyHit.certainty === 'uncertain' ||
    certaintyHit.certainty === 'speculative' ||
    derived.requiresConfirmation;

  return {
    id: makeId(),
    transcriptId: options.transcriptId,
    sessionId: options.sessionId,
    originalTranscript: normalisation.originalText || rawOrNormalised,
    normalisedText: text,
    intent: intentHit.intent,
    statementType,
    certainty: certaintyHit.certainty,
    commitmentStrength: commitmentHit.strength,
    urgency: urgencyHit.urgency,
    constraints: constraintHit.constraints,
    temporalReferences: temporals,
    entities,
    corrections: normalisation.corrections,
    ambiguity,
    surfaceSummary,
    confidence,
    reasons,
    requiresConfirmation,
    createdAt: new Date().toISOString(),
  };
}
