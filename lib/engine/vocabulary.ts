export type VocabularyEntry = {
  canonical: string;
  aliases: string[];
  kind?: 'person' | 'location' | 'job' | 'product' | 'company' | 'custom';
};

export type VocabularyMatch = {
  input: string;
  canonical: string;
  kind: VocabularyEntry['kind'];
  score: number;
  reason: 'exact' | 'alias' | 'edit_distance' | 'phonetic';
};

const normalise = (v: string) =>
  v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').replace(/ +/g, ' ').trim();

const compact = (v: string) => normalise(v).replace(/ /g, '');

function editDistance(a: string, b: string): number {
  a = compact(a);
  b = compact(b);
  let p = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const r = [i];
    for (let j = 1; j <= b.length; j++) {
      r.push(Math.min(
        p[j] + 1,
        r[j - 1] + 1,
        p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      ));
    }
    p = r;
  }
  return p[b.length];
}

function phonetic(v: string): string {
  return normalise(v)
    .replace(/^kn/, 'n')
    .replace(/^wr/, 'r')
    .replace(/^wh/, 'w')
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/qu/g, 'k')
    .replace(/[aeiouy]+/g, 'a')
    .replace(/(.)\1+/g, '$1')
    .replace(/[^a-z]/g, '');
}

export function resolvePersonalTerm(
  input: string,
  entries: VocabularyEntry[]
): VocabularyMatch | null {
  const n = normalise(input);
  if (!n) return null;

  const candidates = entries
    .filter((e) => e.canonical.trim())
    .map((entry) => {
      const canonical = normalise(entry.canonical);
      const aliases = entry.aliases.map(normalise).filter(Boolean);
      const all = [canonical, ...aliases];

      const exact = all.find((x) => x === n);
      if (exact) {
        return {
          input,
          canonical: entry.canonical,
          kind: entry.kind,
          score: 1,
          reason: exact === canonical ? 'exact' as const : 'alias' as const,
          rawScore: 1,
        };
      }

      let score = 0;
      let candidate = '';
      for (const c of all) {
        const max = Math.max(n.length, c.length);
        const s = max ? 1 - editDistance(n, c) / max : 0;
        if (s > score) {
          score = s;
          candidate = c;
        }
      }

      const ph = n.length >= 4 && candidate && phonetic(n) === phonetic(candidate);
      return {
        input,
        canonical: entry.canonical,
        kind: entry.kind,
        score: ph ? Math.max(score, 0.95) : score,
        reason: ph ? 'phonetic' as const : 'edit_distance' as const,
        rawScore: score,
      };
    })
    .sort((a, b) => b.score - a.score);

  const best = candidates[0];
  const second = candidates[1];
  if (!best) return null;

  const threshold = n.length <= 4 ? 0.9 : n.length <= 7 ? 0.78 : 0.72;

  // Do not force a phonetic match when another candidate is lexically close.
  // This keeps Jadon from being silently forced to Jaden/Jason.
  if (
    best.reason === 'phonetic' &&
    second &&
    best.rawScore !== undefined &&
    second.rawScore >= best.rawScore - 0.15
  ) {
    return null;
  }

  if (best.score < threshold || (second && best.score - second.score < 0.08)) {
    return null;
  }

  return best;
}

export function applyPersonalVocabulary(
  text: string,
  entries: VocabularyEntry[]
): { text: string; matches: VocabularyMatch[] } {
  let result = text;
  const matches: VocabularyMatch[] = [];

  const escapeRegExp = (value: string) =>
    value.replace(/[.*+?^()|[\]\\]/g, '\\$&');

  // Replace longest aliases first so a specific learned phrase wins over a
  // shorter alias contained inside it.
  const aliases = entries
    .flatMap((entry) => entry.aliases.map((alias) => ({ entry, alias })))
    .filter(({ alias }) => Boolean(normalise(alias)))
    .sort((a, b) => normalise(b.alias).length - normalise(a.alias).length);

  for (const { entry, alias } of aliases) {
    const words = normalise(alias).split(' ').map(escapeRegExp).join('\\s+');
    const re = new RegExp('\\b' + words + '\\b', 'gi');

    if (!re.test(result)) continue;

    result = result.replace(re, entry.canonical);
    matches.push({
      input: alias,
      canonical: entry.canonical,
      kind: entry.kind,
      score: 1,
      reason: 'alias',
    });
  }

  return { text: result, matches };
}
