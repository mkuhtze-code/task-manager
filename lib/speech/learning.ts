/**
 * Speech-side learning events → personal language model.
 * Evidence accumulation only; never learn from a single weak guess.
 * Integrates with lib/communication/learning for phrase meanings.
 */

import {
  applyEvidence,
  MIN_EVIDENCE_EXPLICIT,
  MIN_EVIDENCE_OBSERVATION,
  normalisePhrase,
} from '@/lib/communication/learning';
import type { LearningEvidence, PersonalCommunicationProfile } from '@/lib/communication/types';
import type {
  PersonalLanguageModel,
  PersonalSpeechVocabularyEntry,
  SpeechInterpretation,
  SpeechLearningEvent,
  SpeechCertainty,
  CommitmentStrength,
  Confidence,
} from './types';
import { emptyPersonalLanguageModel } from './types';

export { MIN_EVIDENCE_EXPLICIT, MIN_EVIDENCE_OBSERVATION };

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `sle-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createSpeechLearningEvent(
  partial: Omit<SpeechLearningEvent, 'id' | 'evidenceCount' | 'createdAt' | 'updatedAt'> & {
    evidenceCount?: number;
  }
): SpeechLearningEvent {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    evidenceCount: partial.evidenceCount ?? 1,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/**
 * Explicit user correction of interpretation or transcription — high weight.
 */
export function recordSpeechCorrection(
  model: PersonalLanguageModel,
  profile: PersonalCommunicationProfile,
  args: {
    inputText: string;
    originalInterpretation: string;
    correctedInterpretation: string;
    kind?: 'speech_correction' | 'transcription_correction' | 'interpretation_corrected';
  }
): {
  model: PersonalLanguageModel;
  profile: PersonalCommunicationProfile;
  event: SpeechLearningEvent;
} {
  const now = new Date().toISOString();
  const event = createSpeechLearningEvent({
    userId: model.userId,
    kind: args.kind ?? 'speech_correction',
    inputText: args.inputText,
    originalInterpretation: args.originalInterpretation,
    correctedInterpretation: args.correctedInterpretation,
    evidenceCount: 3,
    confidence: 'high',
  });

  const vocab = upsertVocabulary(model.vocabulary, {
    spoken: args.originalInterpretation,
    preferred: args.correctedInterpretation,
    source: 'explicit_correction',
    evidenceCount: 3,
    lastEvidenceAt: now,
  });

  const nextModel: PersonalLanguageModel = {
    ...model,
    vocabulary: vocab,
    updatedAt: now,
  };

  const evidence: LearningEvidence = {
    userId: profile.userId,
    kind: 'explicit_correction',
    phrase: args.originalInterpretation,
    meaning: args.correctedInterpretation,
    weight: 3,
    observedAt: now,
    detail: {
      originalInterpretation: args.originalInterpretation,
      correctedValue: args.correctedInterpretation,
      reason: 'speech_correction',
    },
  };

  return {
    model: nextModel,
    profile: applyEvidence(profile, evidence),
    event,
  };
}

function upsertVocabulary(
  list: PersonalSpeechVocabularyEntry[],
  entry: PersonalSpeechVocabularyEntry
): PersonalSpeechVocabularyEntry[] {
  const key = normalisePhrase(entry.spoken);
  const existing = list.find((v) => normalisePhrase(v.spoken) === key);
  if (!existing) return [...list, entry];
  return list.map((v) =>
    normalisePhrase(v.spoken) === key
      ? {
          ...v,
          preferred: entry.preferred,
          evidenceCount: v.evidenceCount + entry.evidenceCount,
          source: entry.source === 'explicit_correction' ? 'explicit_correction' : v.source,
          lastEvidenceAt: entry.lastEvidenceAt,
        }
      : v
  );
}

/**
 * Soft observation from a confirmed interpretation (user accepted surface summary).
 */
export function observeConfirmedInterpretation(
  model: PersonalLanguageModel,
  interpretation: SpeechInterpretation
): PersonalLanguageModel {
  const now = new Date().toISOString();
  let certaintyPhrases = [...model.certaintyPhrases];
  let commitmentPhrases = [...model.commitmentPhrases];

  const certCue = matchCertaintyCue(interpretation.originalTranscript, interpretation.certainty);
  if (certCue) {
    certaintyPhrases = bumpPhrase(certaintyPhrases, certCue, interpretation.certainty);
  }
  const commitCue = matchCommitmentCue(
    interpretation.originalTranscript,
    interpretation.commitmentStrength
  );
  if (commitCue) {
    commitmentPhrases = bumpCommitment(
      commitmentPhrases,
      commitCue,
      interpretation.commitmentStrength
    );
  }

  return {
    ...model,
    certaintyPhrases,
    commitmentPhrases,
    updatedAt: now,
  };
}

function matchCertaintyCue(text: string, certainty: SpeechCertainty): string | null {
  const lower = text.toLowerCase();
  const map: Record<SpeechCertainty, string[]> = {
    definite: ['absolutely', 'definitely', 'must'],
    likely: ['certainly', 'for sure'],
    probable: ['probably', 'likely'],
    tentative: ["i'll try", 'try and', 'hopefully'],
    uncertain: ['maybe', 'perhaps', 'not sure'],
    speculative: ['sometime', 'whenever'],
    unknown: [],
  };
  for (const p of map[certainty] ?? []) {
    if (lower.includes(p)) return p;
  }
  return null;
}

function matchCommitmentCue(text: string, strength: CommitmentStrength): string | null {
  const lower = text.toLowerCase();
  if (strength === 'strong' && /\babsolutely need\b/.test(lower)) return 'absolutely need';
  if (strength === 'weak' && /\bi'?ll try\b/.test(lower)) return "i'll try";
  if (strength === 'moderate' && /\bi'?ll\b/.test(lower)) return "i'll";
  return null;
}

function bumpPhrase(
  list: { phrase: string; mapsTo: SpeechCertainty; evidenceCount: number }[],
  phrase: string,
  mapsTo: SpeechCertainty
) {
  const key = normalisePhrase(phrase);
  const existing = list.find((p) => p.phrase === key);
  if (existing) {
    return list.map((p) =>
      p.phrase === key ? { ...p, evidenceCount: p.evidenceCount + 1, mapsTo } : p
    );
  }
  return [...list, { phrase: key, mapsTo, evidenceCount: 1 }];
}

function bumpCommitment(
  list: { phrase: string; mapsTo: CommitmentStrength; evidenceCount: number }[],
  phrase: string,
  mapsTo: CommitmentStrength
) {
  const key = normalisePhrase(phrase);
  const existing = list.find((p) => p.phrase === key);
  if (existing) {
    return list.map((p) =>
      p.phrase === key ? { ...p, evidenceCount: p.evidenceCount + 1, mapsTo } : p
    );
  }
  return [...list, { phrase: key, mapsTo, evidenceCount: 1 }];
}

/** Apply learned vocabulary when evidence threshold is met. */
export function applyVocabulary(
  text: string,
  model: PersonalLanguageModel
): { text: string; applied: string[] } {
  let result = text;
  const applied: string[] = [];
  const sorted = [...model.vocabulary].sort((a, b) => b.spoken.length - a.spoken.length);
  for (const v of sorted) {
    const min = v.source === 'explicit_correction' ? MIN_EVIDENCE_EXPLICIT : MIN_EVIDENCE_OBSERVATION;
    if (v.evidenceCount < min) continue;
    const re = new RegExp(`\\b${escapeRegExp(v.spoken)}\\b`, 'gi');
    if (re.test(result)) {
      result = result.replace(re, v.preferred);
      applied.push(`${v.spoken}→${v.preferred}`);
    }
  }
  return { text: result, applied };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function emptyModel(userId: string): PersonalLanguageModel {
  return emptyPersonalLanguageModel(userId);
}

export function confidenceForEvidence(count: number, explicit: boolean): Confidence {
  if (explicit && count >= MIN_EVIDENCE_EXPLICIT) return 'high';
  if (count >= MIN_EVIDENCE_OBSERVATION + 2) return 'high';
  if (count >= MIN_EVIDENCE_OBSERVATION) return 'medium';
  return 'low';
}
