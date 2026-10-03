import type {
  Confidence,
  PersonalLanguageModel,
  TranscriptRepair,
} from './types';

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

const DOMAIN_VOCABULARY = new Set([
  'flashing',
  'flashings',
  'fascia',
  'fascias',
  'soffit',
  'soffits',
  'gutter',
  'gutters',
  'gib',
  'gyprock',
  'plasterboard',
  'eaves',
  'lead',
  'weatherboard',
  'weatherboards',
  'ridge',
  'ridges',
  'valley',
  'valleys',
  'apron',
  'aprons',
  'counterflashing',
  'counterflashing',
  'roof',
  'roofs',
  'scaffold',
  'scaffolding',
  'tiler',
  'tilers',
  'cladding',
  'claddings',
  'extension',
  'extensions',
  'variation',
  'variations',
  'invoice',
  'invoices',
  'quote',
  'quotes',
  'quoting',
  'builder',
  'builders',
  'subcontractor',
  'subcontractors',
  'council',
  'consent',
  'consents',
]);

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

const ACTION_WORDS = new Set([
  'check',
  'call',
  'email',
  'text',
  'send',
  'inspect',
  'confirm',
  'chase',
  'quote',
  'order',
  'book',
  'schedule',
  'move',
  'finish',
  'fix',
  'repair',
  'measure',
  'look',
  'see',
  'review',
]);

function normaliseWord(word: string): string {
  return word
    .toLowerCase()
    .replace(/[^\p{L}'-]/gu, '')
    .trim();
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

function hasWord(tokens: string[], word: string): boolean {
  return tokens.includes(normaliseWord(word));
}

function previousWord(tokens: string[], index: number): string {
  return tokens[index - 1] ?? '';
}

function nextWord(tokens: string[], index: number): string {
  return tokens[index + 1] ?? '';
}

function scoreCandidate(
  candidate: string,
  original: string,
  tokens: string[],
  index: number,
  model?: PersonalLanguageModel | null
): Candidate {
  const word = normaliseWord(candidate);
  const previous = previousWord(tokens, index);
  const next = nextWord(tokens, index);
  const reasons: string[] = [];
  let score = 0.5;

  /*
   * Personal evidence is deliberately strong, but never absolute.
   * A learned repair still has to survive contextual plausibility.
   */
  const learned = model?.transcriptionRepairs?.filter(
    (repair) =>
      normaliseWord(repair.from) === normaliseWord(original) &&
      normaliseWord(repair.to) === word
  );

  if (learned?.length) {
    const strongest = Math.max(
      ...learned.map((repair) => repair.evidenceCount)
    );

    score += Math.min(0.3, strongest * 0.1);
    reasons.push(`learned:${strongest}`);
  }

  /*
   * "whether" has a particularly strong syntactic signature:
   *
   *   whether + clause
   *   check whether...
   *   see whether...
   *   know whether...
   *   find out whether...
   */
  if (word === 'whether') {
    if (
      ['check', 'see', 'know', 'confirm', 'determine', 'find', 'decide'].includes(
        previous
      )
    ) {
      score += 0.22;
      reasons.push('whether_after_cognitive_verb');
    }

    if (
      next &&
      !COMMON_CONNECTORS.has(next) &&
      !QUESTION_WORDS.has(next)
    ) {
      score += 0.08;
      reasons.push('whether_introduces_clause');
    }

    if (
      previous === 'on' ||
      previous === 'by' ||
      previous === 'for'
    ) {
      score -= 0.03;
    }
  }

  /*
   * "weather" is normally a noun.
   *
   * Strong contexts:
   *   the weather
   *   bad weather
   *   weather forecast
   *   weather tomorrow
   */
  if (word === 'weather') {
    if (previous === 'the' || previous === 'bad' || previous === 'good') {
      score += 0.2;
      reasons.push('weather_noun_context');
    }

    if (
      next === 'forecast' ||
      next === 'conditions' ||
      next === 'report'
    ) {
      score += 0.2;
      reasons.push('weather_noun_compound');
    }

    if (
      previous === 'check' ||
      previous === 'see'
    ) {
      score += 0.04;
      reasons.push('weather_after_check');
    }

    /*
     * A noun followed by another noun phrase can be suspicious when
     * the second phrase is clearly a clause.
     */
    if (
      next &&
      DOMAIN_VOCABULARY.has(next)
    ) {
      score -= 0.12;
      reasons.push('weather_domain_clause_conflict');
    }
  }

  /*
   * their / there / they're
   */
  if (
    word === 'their' &&
    next &&
    !COMMON_CONNECTORS.has(next)
  ) {
    score += 0.05;
    reasons.push('possessive_following_noun_candidate');
  }

  if (
    word === 'they\'re' &&
    ['going', 'coming', 'doing', 'checking', 'working', 'waiting', 'ready'].includes(next)
  ) {
    score += 0.22;
    reasons.push('theyre_copula_context');
  }

  if (
    word === 'there' &&
    ['is', 'are', 'was', 'were', 'will', 'go', 'going'].includes(next)
  ) {
    score += 0.18;
    reasons.push('there_context');
  }

  /*
   * your / you're
   */
  if (
    word === "you're" &&
    ['going', 'doing', 'checking', 'right', 'ready', 'sure', 'working'].includes(next)
  ) {
    score += 0.22;
    reasons.push('youre_copula_context');
  }

  if (
    word === 'your' &&
    next &&
    !COMMON_CONNECTORS.has(next)
  ) {
    score += 0.06;
    reasons.push('your_possessive_context');
  }

  /*
   * to / too / two
   */
  if (word === 'two') {
    if (/^\d+$/.test(next) || DOMAIN_VOCABULARY.has(next)) {
      score += 0.02;
    }

    if (
      ['one', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'].includes(
        previous
      )
    ) {
      score += 0.1;
      reasons.push('numeric_context');
    }
  }

  if (word === 'too') {
    if (
      next === 'much' ||
      next === 'many' ||
      next === 'late' ||
      next === 'early'
    ) {
      score += 0.2;
      reasons.push('too_modifier_context');
    }

    if (previous === 'me' || previous === 'you') {
      score += 0.08;
      reasons.push('too_additive_context');
    }
  }

  if (word === 'to') {
    if (
      ACTION_WORDS.has(next) ||
      next === 'the' ||
      next === 'a' ||
      next === 'my'
    ) {
      score += 0.1;
      reasons.push('to_infinitive_or_preposition');
    }
  }

  /*
   * Domain vocabulary gets a small boost. This is intentionally modest:
   * vocabulary should disambiguate rather than dictate.
   */
  if (DOMAIN_VOCABULARY.has(word)) {
    score += 0.08;
    reasons.push('domain_vocabulary');
  }

  /*
   * If the original word is itself perfectly plausible, require stronger
   * evidence before replacing it.
   */
  if (word !== normaliseWord(original)) {
    score -= 0.03;
  }

  return {
    word,
    score: Math.max(0, Math.min(1, score)),
    reasons,
  };
}

function shouldConsiderToken(
  token: string,
  model?: PersonalLanguageModel | null
): boolean {
  const lower = normaliseWord(token);

  if (pairFor(lower).length > 0) return true;

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
  if (!model?.transcriptionRepairs?.length) return [];

  return model.transcriptionRepairs
    .filter(
      (repair) =>
        normaliseWord(repair.from) === normaliseWord(token) &&
        repair.evidenceCount >= 1
    )
    .sort((a, b) => b.evidenceCount - a.evidenceCount)
    .map((repair) => repair.to);
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

  return text.replace(re, (match) => {
    if (seen === occurrence) {
      seen += 1;
      return replacement;
    }

    seen += 1;
    return match;
  });
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
  const originalText = text ?? '';

  if (!originalText.trim()) {
    return {
      text: originalText,
      repairs: [],
      confidence: 'low',
    };
  }

  const tokens = tokenise(originalText);
  let working = originalText;
  const repairs: TranscriptRepair[] = [];

  const seenOccurrences = new Map<string, number>();

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (!shouldConsiderToken(token, options?.model)) {
      continue;
    }

    const lower = normaliseWord(token);
    const occurrence = seenOccurrences.get(lower) ?? 0;
    seenOccurrences.set(lower, occurrence + 1);

    const candidates = [
      ...pairFor(lower),
      ...learnedCandidates(lower, options?.model),
    ].filter(
      (value, candidateIndex, values) =>
        values.findIndex(
          (v) => normaliseWord(v) === normaliseWord(value)
        ) === candidateIndex
    );

    if (!candidates.length) continue;

    const scored = [
      {
        word: lower,
        score: 0.5,
        reasons: ['original_candidate'],
      },
      ...candidates.map((candidate) =>
        scoreCandidate(
          candidate,
          lower,
          tokens,
          index,
          options?.model
        )
      ),
    ].sort((a, b) => b.score - a.score);

    const best = scored[0];
    const second = scored[1];

    /*
     * Never repair on a tiny margin.
     *
     * This is critical because many homophones are legitimately ambiguous.
     */
    const margin =
      best.score - (second?.score ?? 0);

    if (
      best.word === lower ||
      margin < 0.12 ||
      best.score < 0.72
    ) {
      continue;
    }

    /*
     * Low-confidence transcription requires stronger contextual evidence.
     * High-confidence transcription can still be repaired when semantic
     * evidence is very strong, because STT confidence does not measure
     * semantic correctness.
     */
    const transcriptionConfidence =
      options?.transcriptionConfidence ?? null;

    if (
      transcriptionConfidence != null &&
      transcriptionConfidence >= 0.9 &&
      best.score < 0.84
    ) {
      continue;
    }

    const replacement = best.word;

    working = replaceTokenAt(
      working,
      token,
      replacement,
      occurrence
    );

    repairs.push({
      original: token,
      replacement,
      reason: best.reasons.join(','),
      confidence: confidenceFromScore(best.score),
      score: Number(best.score.toFixed(3)),
      context: buildContext(tokens, index),
    });
  }

  const confidence =
    repairs.length === 0
      ? 'high'
      : repairs.some((repair) => repair.confidence === 'high')
        ? 'high'
        : 'medium';

  return {
    text: working,
    repairs,
    confidence,
  };
}

function buildContext(
  tokens: string[],
  index: number
): string {
  const start = Math.max(0, index - 4);
  const end = Math.min(tokens.length, index + 5);

  return tokens.slice(start, end).join(' ');
}