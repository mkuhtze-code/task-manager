/**
 * Contextual transcript repair.
 *
 * STT produces phonetic text, not guaranteed semantic text.
 *
 * This layer performs deterministic semantic plausibility checks
 * for words that are commonly confused by speech recognition.
 *
 * Important:
 *
 * - Never globally autocorrect a homophone.
 * - Never treat a learned repair as absolute truth.
 * - Prefer sentence/clause context over isolated word frequency.
 * - Preserve the original transcript through TranscriptRepair evidence.
 * - A repair may improve interpretation confidence, but never bypass
 *   the downstream action-safety gate.
 */

import type {
  Confidence,
  PersonalLanguageModel,
  TranscriptRepair,
} from './types';
import { allDomainTerms, domainPackScore } from './domainPacks';

export { DOMAIN_PACKS } from './domainPacks';
export type { DomainPackId } from './domainPacks';

type HomophonePair = {
  a: string;
  b: string;
};

type Candidate = {
  word: string;
  score: number;
  reasons: string[];
};

const HOMOPHONE_PAIRS: HomophonePair[] = [
  { a: 'weather', b: 'whether' },
  { a: 'their', b: 'there' },
  { a: 'their', b: "they're" },
  { a: 'there', b: "they're" },
  { a: 'your', b: "you're" },
  { a: 'youre', b: "you're" },
  { a: 'youre', b: 'your' },
  { a: 'to', b: 'too' },
  { a: 'to', b: 'two' },
  { a: 'too', b: 'two' },
  { a: 'then', b: 'than' },
  { a: 'hear', b: 'here' },
  { a: 'no', b: 'know' },
  { a: 'right', b: 'write' },
  { a: 'site', b: 'sight' },
  { a: 'brake', b: 'break' },
  { a: 'by', b: 'buy' },
  { a: 'for', b: 'four' },
  { a: 'one', b: 'won' },
  { a: 'new', b: 'knew' },
  { a: 'road', b: 'rode' },
  { a: 'week', b: 'weak' },
];

const DOMAIN_VOCABULARY = allDomainTerms();

const COMMON_CONNECTORS = new Set([
  'and',
  'or',
  'but',
  'if',
  'because',
  'when',
  'while',
  'before',
  'after',
  'unless',
  'until',
  'whether',
  'that',
]);

const QUESTION_WORDS = new Set([
  'what',
  'when',
  'where',
  'who',
  'why',
  'how',
]);

const COGNITIVE_VERBS = new Set([
  'check',
  'see',
  'know',
  'confirm',
  'determine',
  'find',
  'decide',
  'verify',
  'establish',
  'ask',
  'learn',
]);

const TEMPORAL_WORDS = new Set([
  'today',
  'tomorrow',
  'yesterday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'tonight',
  'morning',
  'afternoon',
  'evening',
  'night',
  'week',
  'month',
  'year',
  'later',
  'soon',
  'next',
  'last',
]);

function normaliseWord(word: string): string {
  return word.toLowerCase().replace(/[^\p{L}'-]/gu, '').trim();
}

function tokenise(text: string): string[] {
  return text.split(/\s+/).map(normaliseWord).filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function confidenceFromScore(score: number): Confidence {
  if (score >= 0.9) return 'high';
  if (score >= 0.65) return 'medium';
  return 'low';
}

function pairFor(word: string): string[] {
  const lower = normaliseWord(word);
  const out = new Set<string>();

  for (const pair of HOMOPHONE_PAIRS) {
    if (pair.a === lower) out.add(pair.b);
    if (pair.b === lower) out.add(pair.a);
  }

  return [...out];
}

function previousWord(tokens: string[], index: number): string {
  return tokens[index - 1] ?? '';
}

function nextWord(tokens: string[], index: number): string {
  return tokens[index + 1] ?? '';
}

function wordsBefore(
  tokens: string[],
  index: number,
  distance: number
): string[] {
  return tokens.slice(Math.max(0, index - distance), index);
}

function wordsAfter(
  tokens: string[],
  index: number,
  distance: number
): string[] {
  return tokens.slice(
    index + 1,
    Math.min(tokens.length, index + 1 + distance)
  );
}

function hasCognitiveVerbBeforeClause(
  tokens: string[],
  index: number
): { found: boolean; verb?: string; distance?: number } {
  const before = wordsBefore(tokens, index, 7);

  for (let i = before.length - 1; i >= 0; i -= 1) {
    const word = before[i];

    if (COGNITIVE_VERBS.has(word)) {
      return {
        found: true,
        verb: word,
        distance: before.length - i,
      };
    }
  }

  return { found: false };
}

function hasTemporalBridge(
  tokens: string[],
  index: number
): boolean {
  const before = wordsBefore(tokens, index, 6);

  if (!before.length) return false;

  const temporal = before.some((word) =>
    TEMPORAL_WORDS.has(word)
  );

  if (!temporal) return false;

  return before.some((word) =>
    COGNITIVE_VERBS.has(word)
  );
}

function hasFollowingClause(
  tokens: string[],
  index: number
): boolean {
  const next = nextWord(tokens, index);

  if (!next) return false;

  if (
    [
      'the',
      'a',
      'an',
      'he',
      'she',
      'it',
      'they',
      'we',
      'you',
      'i',
    ].includes(next)
  ) {
    return true;
  }

  if (QUESTION_WORDS.has(next)) return true;

  if (DOMAIN_VOCABULARY.has(next)) return true;

  return false;
}

function scoreCandidate(
  candidate: string,
  original: string,
  tokens: string[],
  index: number,
  model?: PersonalLanguageModel | null
): Candidate {
  const word = normaliseWord(candidate);
  const originalWord = normaliseWord(original);
  const previous = previousWord(tokens, index);
  const next = nextWord(tokens, index);

  const reasons: string[] = [];

  let score = 0.5;

  const learned = model?.transcriptionRepairs?.filter(
    (repair) =>
      normaliseWord(repair.from) === originalWord &&
      normaliseWord(repair.to) === word
  );

  if (learned?.length) {
    const strongest = Math.max(
      ...learned.map((r) => r.evidenceCount)
    );

    score += Math.min(
      0.3,
      strongest * 0.1
    );

    reasons.push(`learned:${strongest}`);
  }

  if (word === 'whether') {
    if (COGNITIVE_VERBS.has(previous)) {
      score += 0.22;
      reasons.push(
        'whether_after_cognitive_verb'
      );
    }

    const cognitive =
      hasCognitiveVerbBeforeClause(
        tokens,
        index
      );

    if (cognitive.found) {
      score += 0.18;

      reasons.push(
        `whether_clause_after_${cognitive.verb}`
      );
    }

    if (hasTemporalBridge(tokens, index)) {
      score += 0.12;
      reasons.push(
        'whether_temporal_bridge'
      );
    }

    if (hasFollowingClause(tokens, index)) {
      score += 0.12;
      reasons.push(
        'whether_following_clause'
      );
    }

    if (
      previous === 'on' ||
      previous === 'by' ||
      previous === 'for'
    ) {
      score -= 0.02;
    }
  }

  if (word === 'weather') {
    if (
      previous === 'the' ||
      previous === 'bad' ||
      previous === 'good' ||
      previous === 'nice' ||
      previous === 'cold' ||
      previous === 'hot'
    ) {
      score += 0.2;
      reasons.push(
        'weather_noun_context'
      );
    }

    if (
      next === 'forecast' ||
      next === 'conditions' ||
      next === 'report' ||
      next === 'outlook' ||
      next === 'warning'
    ) {
      score += 0.28;
      reasons.push(
        'weather_noun_compound'
      );
    }

    if (previous === 'the') {
      score += 0.12;
      reasons.push(
        'weather_definite_article'
      );
    }

    if (
      previous === 'check' &&
      next !== 'the'
    ) {
      score += 0.04;
      reasons.push(
        'weather_after_check'
      );
    }

    if (
      hasFollowingClause(tokens, index) &&
      DOMAIN_VOCABULARY.has(next)
    ) {
      score -= 0.12;
      reasons.push(
        'weather_domain_clause_conflict'
      );
    }

    const cognitive =
      hasCognitiveVerbBeforeClause(
        tokens,
        index
      );

    if (
      cognitive.found &&
      hasFollowingClause(tokens, index)
    ) {
      score -= 0.16;
      reasons.push(
        'weather_cognitive_clause_conflict'
      );
    }
  }

  if (
    word === 'their' &&
    next &&
    !COMMON_CONNECTORS.has(next)
  ) {
    score += 0.05;
    reasons.push(
      'possessive_following_noun_candidate'
    );
  }

  if (
    word === "they're" &&
    [
      'going',
      'coming',
      'doing',
      'checking',
      'working',
      'here',
      'there',
    ].includes(next)
  ) {
    score += 0.18;
    reasons.push(
      'theyre_copula_or_participle'
    );
  }

  if (
    word === 'there' &&
    (
      next === 'is' ||
      next === 'are' ||
      next === 'was' ||
      next === 'were'
    )
  ) {
    score += 0.18;
    reasons.push(
      'there_existential'
    );
  }

  if (
    word === "you're" ||
    word === 'youre'
  ) {
    if (
      [
        'checking',
        'going',
        'coming',
        'doing',
        'working',
        'looking',
      ].includes(next)
    ) {
      score += 0.2;
      reasons.push(
        'youre_participle'
      );
    }

    if (
      next === 'not' ||
      next === 'right' ||
      next === 'welcome'
    ) {
      score += 0.12;
      reasons.push(
        'youre_predicate'
      );
    }
  }

  if (
    word === 'your' &&
    next &&
    !COMMON_CONNECTORS.has(next)
  ) {
    score += 0.08;
    reasons.push(
      'your_possessive'
    );
  }

  if (word === 'to') {
    if (
      [
        'check',
        'call',
        'send',
        'email',
        'inspect',
        'confirm',
        'see',
        'verify',
        'finish',
        'order',
      ].includes(next)
    ) {
      score += 0.15;
      reasons.push(
        'to_infinitive'
      );
    }
  }

  if (word === 'too') {
    if (
      [
        'much',
        'many',
        'late',
        'early',
        'big',
        'small',
        'high',
        'low',
      ].includes(next) ||
      previous === 'way'
    ) {
      score += 0.15;
      reasons.push(
        'too_degree'
      );
    }
  }

  if (
    word === 'two' &&
    (
      next === 'days' ||
      next === 'weeks' ||
      next === 'hours' ||
      next === 'people'
    )
  ) {
    score += 0.15;
    reasons.push(
      'two_quantity'
    );
  }

  if (
    word === 'than' &&
    (
      previous === 'more' ||
      previous === 'less' ||
      previous === 'better' ||
      previous === 'worse'
    )
  ) {
    score += 0.18;
    reasons.push(
      'than_comparative'
    );
  }

  if (
    word === 'then' &&
    (
      previous === 'and' ||
      next === 'we' ||
      next === 'i'
    )
  ) {
    score += 0.08;
    reasons.push(
      'then_sequence'
    );
  }

  if (
    DOMAIN_VOCABULARY.has(next) ||
    DOMAIN_VOCABULARY.has(previous)
  ) {
    score += 0.03;
    reasons.push(
      'domain_vocabulary'
    );
  }

  const packNudge =
    domainPackScore(
      previous,
      next
    );

  if (packNudge > 0) {
    score += packNudge;
    reasons.push(
      'domain_pack'
    );
  }

  if (word !== originalWord) {
    score -= 0.03;
  }

  return {
    word,
    score: Math.max(
      0,
      Math.min(1, score)
    ),
    reasons,
  };
}

function shouldConsiderToken(
  token: string,
  model?: PersonalLanguageModel | null
): boolean {
  const lower = normaliseWord(token);

  if (pairFor(lower).length > 0) {
    return true;
  }

  if (
    model?.transcriptionRepairs?.some(
      (repair) =>
        normaliseWord(repair.from) === lower
    )
  ) {
    return true;
  }

  return false;
}

function learnedCandidates(
  token: string,
  model?: PersonalLanguageModel | null
): string[] {
  if (
    !model?.transcriptionRepairs?.length
  ) {
    return [];
  }

  return model.transcriptionRepairs
    .filter(
      (repair) =>
        normaliseWord(repair.from) ===
          normaliseWord(token) &&
        repair.evidenceCount >= 1
    )
    .sort(
      (a, b) =>
        b.evidenceCount -
        a.evidenceCount
    )
    .map(
      (repair) =>
        repair.to
    );
}

function replaceTokenAt(
  text: string,
  original: string,
  replacement: string,
  occurrence: number
): string {
  const re = new RegExp(
    `\\b${escapeRegExp(original)}\\b`,
    'gi'
  );

  let seen = 0;

  return text.replace(
    re,
    (match) => {
      if (seen === occurrence) {
        seen += 1;
        return replacement;
      }

      seen += 1;
      return match;
    }
  );
}

function buildContext(
  tokens: string[],
  index: number
): string {
  const start =
    Math.max(0, index - 5);

  const end =
    Math.min(
      tokens.length,
      index + 6
    );

  return tokens
    .slice(start, end)
    .join(' ');
}

export function repairTranscript(
  text: string,
  options?: {
    model?: PersonalLanguageModel | null;
    transcriptionConfidence?: number | null;
  }
): {
  text: string;
  repairs: TranscriptRepair[];
  confidence: Confidence;
} {
  const originalText =
    text ?? '';

  if (!originalText.trim()) {
    return {
      text: originalText,
      repairs: [],
      confidence: 'low',
    };
  }

  const tokens =
    tokenise(originalText);

  let working =
    originalText;

  const repairs:
    TranscriptRepair[] = [];

  const seenOccurrences =
    new Map<string, number>();

  for (
    let index = 0;
    index < tokens.length;
    index += 1
  ) {
    const token =
      tokens[index];

    if (
      !shouldConsiderToken(
        token,
        options?.model
      )
    ) {
      continue;
    }

    const lower =
      normaliseWord(token);

    const occurrence =
      seenOccurrences.get(lower) ?? 0;

    seenOccurrences.set(
      lower,
      occurrence + 1
    );

    const candidates = [
      ...pairFor(lower),
      ...learnedCandidates(
        lower,
        options?.model
      ),
    ].filter(
      (
        value,
        candidateIndex,
        values
      ) =>
        values.findIndex(
          (v) =>
            normaliseWord(v) ===
            normaliseWord(value)
        ) === candidateIndex
    );

    if (!candidates.length) {
      continue;
    }

    const scored: Candidate[] = [
      scoreCandidate(
        lower,
        lower,
        tokens,
        index,
        options?.model
      ),
      ...candidates.map(
        (candidate) =>
          scoreCandidate(
            candidate,
            lower,
            tokens,
            index,
            options?.model
          )
      ),
    ].sort(
      (a, b) =>
        b.score - a.score
    );

    const best =
      scored[0];

    const second =
      scored[1];

    const margin =
      best.score -
      (second?.score ?? 0);

    if (
      best.word === lower ||
      margin < 0.12 ||
      best.score < 0.72
    ) {
      continue;
    }

    const transcriptionConfidence =
      options?.transcriptionConfidence ??
      null;

    if (
      transcriptionConfidence != null &&
      transcriptionConfidence >= 0.9 &&
      best.score < 0.84
    ) {
      continue;
    }

    const replacement =
      best.word;

    working =
      replaceTokenAt(
        working,
        token,
        replacement,
        occurrence
      );

    repairs.push({
      original: token,
      replacement,
      reason:
        best.reasons.join(','),
      confidence:
        confidenceFromScore(
          best.score
        ),
      score:
        Number(
          best.score.toFixed(3)
        ),
      context:
        buildContext(
          tokens,
          index
        ),
    });
  }

  const confidence =
    repairs.length === 0
      ? 'high'
      : repairs.some(
          (repair) =>
            repair.confidence ===
            'high'
        )
        ? 'high'
        : 'medium';

  return {
    text: working,
    repairs,
    confidence,
  };
}