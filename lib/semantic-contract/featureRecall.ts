/**
 * Positive-label semantic coverage metrics.
 *
 * This deliberately computes recall/coverage only. The current reviewed-label
 * format annotates required positive features but does not enumerate verified
 * negatives, so precision and false-positive rates cannot be estimated honestly.
 */
export type FeatureRecallCase = {
  id: string;
  domain: string;
  requiredFeatures: readonly string[];
  observedFeatures: readonly string[];
};

export type FeatureRecallBucket = {
  cases: number;
  required: number;
  matched: number;
  missing: number;
  recall: number | null;
};

export type FeatureRecallReport = FeatureRecallBucket & {
  domainCount: number;
  featureCount: number;
  byDomain: Record<string, FeatureRecallBucket>;
  byFeature: Record<string, { required: number; matched: number; missing: number; recall: number | null }>;
};

function bucket(required: number, matched: number, cases: number): FeatureRecallBucket {
  const missing = required - matched;
  return {
    cases,
    required,
    matched,
    missing,
    recall: required === 0 ? null : matched / required,
  };
}

export function summarizeFeatureRecall(rows: readonly FeatureRecallCase[]): FeatureRecallReport {
  const ids = new Set<string>();
  const byDomainRaw = new Map<string, { cases: number; required: number; matched: number }>();
  const byFeatureRaw = new Map<string, { required: number; matched: number }>();
  let required = 0;
  let matched = 0;

  for (const row of rows) {
    if (!row.id.trim()) throw new Error('Feature-recall cases require a non-empty id.');
    if (ids.has(row.id)) throw new Error(`Duplicate feature-recall case id: ${row.id}`);
    ids.add(row.id);
    if (!row.domain.trim()) throw new Error(`Feature-recall case ${row.id} requires a domain.`);

    const expected = new Set(row.requiredFeatures);
    if (expected.size !== row.requiredFeatures.length) {
      throw new Error(`Feature-recall case ${row.id} contains duplicate required features.`);
    }
    const observed = new Set(row.observedFeatures);
    let rowMatched = 0;
    for (const feature of expected) {
      const stat = byFeatureRaw.get(feature) ?? { required: 0, matched: 0 };
      stat.required += 1;
      required += 1;
      if (observed.has(feature)) {
        stat.matched += 1;
        matched += 1;
        rowMatched += 1;
      }
      byFeatureRaw.set(feature, stat);
    }

    const domain = byDomainRaw.get(row.domain) ?? { cases: 0, required: 0, matched: 0 };
    domain.cases += 1;
    domain.required += expected.size;
    domain.matched += rowMatched;
    byDomainRaw.set(row.domain, domain);
  }

  const byDomain = Object.fromEntries(
    [...byDomainRaw.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, stat]) => [
      name,
      bucket(stat.required, stat.matched, stat.cases),
    ]),
  );
  const byFeature = Object.fromEntries(
    [...byFeatureRaw.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, stat]) => [
      name,
      { required: stat.required, matched: stat.matched, missing: stat.required - stat.matched,
        recall: stat.required === 0 ? null : stat.matched / stat.required },
    ]),
  );

  return {
    ...bucket(required, matched, rows.length),
    domainCount: byDomainRaw.size,
    featureCount: byFeatureRaw.size,
    byDomain,
    byFeature,
  };
}
