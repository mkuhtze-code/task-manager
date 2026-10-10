export type SemanticExpectation = {
  id: string;
  domain: string;
  input: string;
  expected: {
    minActs?: number;
    maxActs?: number;
    requiredActKinds?: readonly string[];
    forbiddenActKinds?: readonly string[];
    requiredActionTerms?: readonly string[];
    forbiddenActionTerms?: readonly string[];
    requiredEntityTerms?: readonly string[];
    requiredTemporalTerms?: readonly string[];
    mustNotCreateTask?: boolean;
    mustHaveNegation?: boolean;
    mustHaveCorrection?: boolean;
    mustHaveCondition?: boolean;
    mustHaveDependency?: boolean;
  };
};

export type ObservedSemanticFacts = {
  actCount: number;
  actKinds: readonly string[];
  actionText: string;
  entityText: string;
  temporalText: string;
  mustNotCreateTask: boolean;
  hasNegation: boolean;
  hasCorrection: boolean;
  hasCondition: boolean;
  hasDependency: boolean;
};

export type SemanticCriterionResult = {
  criterion: string;
  expected: string | number | boolean;
  actual: string | number | boolean;
  passed: boolean;
};

export type SemanticExpectationResult = {
  id: string;
  domain: string;
  passed: number;
  failed: number;
  criteria: SemanticCriterionResult[];
  score: number | null;
};

function normalized(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

/** Normalize common equivalent clock expressions before term-level comparison. */
function normalizedForMatching(text: string): string {
  return normalized(text)
    .replace(/\bnoon\b/g, ' time_12:00 ')
    .replace(/\bmidnight\b/g, ' time_00:00 ')
    .replace(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/gi, (_match, hourText: string, minuteText: string | undefined, meridiemText: string) => {
      const hour = Number(hourText);
      const minute = minuteText ?? '00';
      const isPm = meridiemText.toLocaleLowerCase().startsWith('p');
      const hour24 = (hour % 12) + (isPm ? 12 : 0);
      return ' time_' + String(hour24).padStart(2, '0') + ':' + minute + ' ';
    })
    .replace(/\b(\d{1,2}):(\d{2})\b/g, ' time_$1:$2 ');
}

function containsTerm(text: string, term: string): boolean {
  const words = normalizedForMatching(text).split(/[^a-z0-9]+/).filter(Boolean);
  const wanted = normalizedForMatching(term).split(/[^a-z0-9]+/).filter(Boolean);
  if (wanted.length === 0 || wanted.length > words.length) return false;
  for (let start = 0; start <= words.length - wanted.length; start += 1) {
    if (wanted.every((word, offset) => words[start + offset] === word)) return true;
  }
  return false;
}

export function evaluateSemanticExpectation(
  label: SemanticExpectation,
  observed: ObservedSemanticFacts,
): SemanticExpectationResult {
  const criteria: SemanticCriterionResult[] = [];
  const add = (criterion: string, expected: string | number | boolean, actual: string | number | boolean, passed: boolean) => {
    criteria.push({ criterion, expected, actual, passed });
  };
  const expected = label.expected;

  if (expected.minActs !== undefined) {
    add('minActs', expected.minActs, observed.actCount, observed.actCount >= expected.minActs);
  }
  if (expected.maxActs !== undefined) {
    add('maxActs', expected.maxActs, observed.actCount, observed.actCount <= expected.maxActs);
  }
  for (const kind of expected.requiredActKinds ?? []) {
    add(`requiredActKind:${kind}`, kind, observed.actKinds.join(','), observed.actKinds.includes(kind));
  }
  for (const kind of expected.forbiddenActKinds ?? []) {
    add(`forbiddenActKind:${kind}`, kind, observed.actKinds.join(','), !observed.actKinds.includes(kind));
  }
  for (const term of expected.requiredActionTerms ?? []) {
    add(`requiredActionTerm:${term}`, term, observed.actionText, containsTerm(observed.actionText, term));
  }
  for (const term of expected.forbiddenActionTerms ?? []) {
    add(`forbiddenActionTerm:${term}`, term, observed.actionText, !containsTerm(observed.actionText, term));
  }
  for (const term of expected.requiredEntityTerms ?? []) {
    add(`requiredEntityTerm:${term}`, term, observed.entityText, containsTerm(observed.entityText, term));
  }
  for (const term of expected.requiredTemporalTerms ?? []) {
    add(`requiredTemporalTerm:${term}`, term, observed.temporalText, containsTerm(observed.temporalText, term));
  }

  const booleanChecks: Array<[keyof SemanticExpectation['expected'], string, boolean | undefined, boolean]> = [
    ['mustNotCreateTask', 'mustNotCreateTask', expected.mustNotCreateTask, observed.mustNotCreateTask],
    ['mustHaveNegation', 'mustHaveNegation', expected.mustHaveNegation, observed.hasNegation],
    ['mustHaveCorrection', 'mustHaveCorrection', expected.mustHaveCorrection, observed.hasCorrection],
    ['mustHaveCondition', 'mustHaveCondition', expected.mustHaveCondition, observed.hasCondition],
    ['mustHaveDependency', 'mustHaveDependency', expected.mustHaveDependency, observed.hasDependency],
  ];
  for (const [, name, wanted, actual] of booleanChecks) {
    if (wanted !== undefined) add(name, wanted, actual, wanted === actual);
  }

  const passed = criteria.filter((item) => item.passed).length;
  const failed = criteria.length - passed;
  return {
    id: label.id,
    domain: label.domain,
    passed,
    failed,
    criteria,
    score: criteria.length === 0 ? null : passed / criteria.length,
  };
}

export function summarizeSemanticExpectationResults(results: readonly SemanticExpectationResult[]) {
  const criteria = results.flatMap((result) => result.criteria);
  const passed = criteria.filter((item) => item.passed).length;
  const failed = criteria.length - passed;
  const byDomain: Record<string, { cases: number; passed: number; failed: number; score: number | null }> = {};
  for (const result of results) {
    const bucket = byDomain[result.domain] ?? { cases: 0, passed: 0, failed: 0, score: null };
    bucket.cases += 1;
    bucket.passed += result.passed;
    bucket.failed += result.failed;
    bucket.score = bucket.passed + bucket.failed === 0 ? null : bucket.passed / (bucket.passed + bucket.failed);
    byDomain[result.domain] = bucket;
  }
  return {
    cases: results.length,
    criteria: criteria.length,
    passed,
    failed,
    score: criteria.length === 0 ? null : passed / criteria.length,
    byDomain: Object.fromEntries(Object.entries(byDomain).sort(([a], [b]) => a.localeCompare(b))),
  };
}
