import type { LearningEvidence, PersonalCommunicationProfile, PhraseMeaning, StatementType } from './types';
import { defaultPersonalCommunicationProfile } from './types';

export const MIN_EVIDENCE_OBSERVATION = 3;
export const MIN_EVIDENCE_EXPLICIT = 1;
export const EXPLICIT_CORRECTION_WEIGHT = 3;

export function createProfile(userId: string): PersonalCommunicationProfile {
  return defaultPersonalCommunicationProfile(userId);
}

export function normalisePhrase(text: string): string {
  return text.toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim();
}

export function applyEvidence(
  profile: PersonalCommunicationProfile,
  evidence: LearningEvidence
): PersonalCommunicationProfile {
  if (evidence.userId !== profile.userId) return profile;

  const now = evidence.observedAt ?? new Date().toISOString();
  const weight =
    evidence.weight ??
    (evidence.kind === 'explicit_correction' || evidence.kind === 'meeting_correction'
      ? EXPLICIT_CORRECTION_WEIGHT
      : 1);

  let next: PersonalCommunicationProfile = {
    ...profile,
    phraseMeanings: [...profile.phraseMeanings],
    temporalPhrases: [...profile.temporalPhrases],
    entityAliases: [...profile.entityAliases],
    correctionPatterns: [...profile.correctionPatterns],
    uncertaintyPhrases: [...profile.uncertaintyPhrases],
    style: { ...profile.style },
    updatedAt: now,
  };

  switch (evidence.kind) {
    case 'phrase_observation':
    case 'explicit_correction':
    case 'accepted_interpretation':
    case 'meeting_correction': {
      if (!evidence.phrase || !evidence.meaning) break;
      const key = normalisePhrase(evidence.phrase);
      if (!key) break;
      const source: PhraseMeaning['source'] =
        evidence.kind === 'explicit_correction' || evidence.kind === 'meeting_correction'
          ? 'explicit_correction'
          : evidence.kind === 'accepted_interpretation'
            ? 'repeated_usage'
            : 'observation';
      const existing = next.phraseMeanings.find((p) => p.phrase === key);
      if (existing) {
        next.phraseMeanings = next.phraseMeanings.map((p) =>
          p.phrase === key
            ? {
                ...p,
                meaning: evidence.meaning!,
                statementTypeHint: evidence.statementTypeHint ?? p.statementTypeHint,
                evidenceCount: p.evidenceCount + weight,
                lastEvidenceAt: now,
                source: source === 'explicit_correction' ? 'explicit_correction' : p.source,
              }
            : p
        );
      } else {
        next.phraseMeanings = [
          ...next.phraseMeanings,
          {
            phrase: key,
            meaning: evidence.meaning!,
            statementTypeHint: evidence.statementTypeHint,
            evidenceCount: weight,
            lastEvidenceAt: now,
            source,
          },
        ];
      }
      if (
        (evidence.kind === 'explicit_correction' || evidence.kind === 'meeting_correction') &&
        !next.correctionPatterns.includes(key)
      ) {
        next.correctionPatterns = [...next.correctionPatterns, key];
      }
      break;
    }
    case 'rejected_interpretation': {
      if (!evidence.phrase) break;
      const key = normalisePhrase(evidence.phrase);
      next.phraseMeanings = next.phraseMeanings
        .map((p) =>
          p.phrase === key ? { ...p, evidenceCount: Math.max(0, p.evidenceCount - weight) } : p
        )
        .filter((p) => p.evidenceCount > 0);
      break;
    }
    case 'task_outcome': {
      if (!evidence.phrase || !evidence.meaning) break;
      if (evidence.detail?.outcome === 'done' || evidence.detail?.outcome === 'partial') {
        return applyEvidence(next, {
          userId: evidence.userId,
          kind: 'accepted_interpretation',
          phrase: evidence.phrase,
          meaning: evidence.meaning,
          weight: evidence.detail?.outcome === 'done' ? 1 : 0.5,
          observedAt: now,
        });
      }
      if (evidence.detail?.outcome === 'edited' && evidence.detail.correctedValue) {
        return applyEvidence(next, {
          userId: evidence.userId,
          kind: 'phrase_observation',
          phrase: evidence.phrase,
          meaning: evidence.detail.correctedValue,
          weight: 1,
          observedAt: now,
        });
      }
      break;
    }
    default:
      break;
  }
  return next;
}

export function lookupPhraseMeaning(
  profile: PersonalCommunicationProfile,
  phrase: string
): PhraseMeaning | null {
  const key = normalisePhrase(phrase);
  if (!key) return null;
  const entry = profile.phraseMeanings.find((p) => p.phrase === key);
  if (!entry) return null;
  const min =
    entry.source === 'explicit_correction' ? MIN_EVIDENCE_EXPLICIT : MIN_EVIDENCE_OBSERVATION;
  if (entry.evidenceCount < min) return null;
  return entry;
}

export function findLearnedPhrases(
  profile: PersonalCommunicationProfile,
  text: string
): PhraseMeaning[] {
  const lower = normalisePhrase(text);
  if (!lower) return [];
  return profile.phraseMeanings
    .filter((p) => {
      const min =
        p.source === 'explicit_correction' ? MIN_EVIDENCE_EXPLICIT : MIN_EVIDENCE_OBSERVATION;
      return p.evidenceCount >= min && lower.includes(p.phrase);
    })
    .sort((a, b) => b.phrase.length - a.phrase.length);
}

export function recordExplicitPhraseCorrection(
  profile: PersonalCommunicationProfile,
  phrase: string,
  meaning: string,
  statementTypeHint?: StatementType
): PersonalCommunicationProfile {
  return applyEvidence(profile, {
    userId: profile.userId,
    kind: 'explicit_correction',
    phrase,
    meaning,
    statementTypeHint,
    weight: EXPLICIT_CORRECTION_WEIGHT,
  });
}
