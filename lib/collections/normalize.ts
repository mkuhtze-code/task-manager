/**
 * Deterministic normalisation for collection titles and item content.
 * No LLM. Supports alias seeds for common list vocabulary.
 */

const TITLE_STOP = new Set([
  'a',
  'an',
  'the',
  'my',
  'our',
  'for',
  'to',
  'of',
  'list',
  'lists',
]);

/** Canonical seeds: spoken form → preferred collection title key */
export const COLLECTION_ALIAS_SEEDS: Record<string, string> = {
  grocery: 'grocery',
  groceries: 'grocery',
  'grocery list': 'grocery',
  'shopping list': 'shopping',
  shopping: 'shopping',
  snag: 'snag',
  snags: 'snag',
  'snag list': 'snag',
  packing: 'packing',
  'packing list': 'packing',
  materials: 'materials',
  'materials list': 'materials',
  questions: 'questions',
  'meeting questions': 'questions',
  ideas: 'ideas',
  observations: 'observations',
  'site observations': 'observations',
};

export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export function normalizeKey(s: string): string {
  return collapseWhitespace(s)
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}\s\-']/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTitle(title: string): string {
  let key = normalizeKey(title);
  key = key.replace(/\blists?\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (COLLECTION_ALIAS_SEEDS[key]) {
    return COLLECTION_ALIAS_SEEDS[key];
  }
  const tokens = key.split(' ').filter((t) => t && !TITLE_STOP.has(t));
  const joined = tokens.join(' ').trim() || key;
  return COLLECTION_ALIAS_SEEDS[joined] ?? joined;
}

export function normalizeItemContent(content: string): string {
  return normalizeKey(content)
    .replace(/^(the|a|an)\s+/i, '')
    .trim();
}

export function titleFromSpoken(spoken: string): string {
  const key = normalizeTitle(spoken);
  return key
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function inferCollectionType(
  title: string
): import('./types').CollectionType {
  const key = normalizeTitle(title);
  if (key === 'grocery' || key.includes('grocery')) return 'grocery';
  if (key === 'snag' || key.includes('snag')) return 'snag';
  if (key === 'shopping' || key.includes('shopping') || key.includes('bunnings'))
    return 'shopping';
  if (key === 'packing' || key.includes('packing')) return 'packing';
  if (key === 'materials' || key.includes('material')) return 'materials';
  if (key === 'questions' || key.includes('question') || key.includes('ask'))
    return 'questions';
  if (key === 'observations' || key.includes('observation')) return 'observations';
  if (key === 'ideas' || key.includes('idea')) return 'ideas';
  return 'generic';
}

export function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeKey(a).split(' ').filter(Boolean));
  const tb = new Set(normalizeKey(b).split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function isLikelySameItem(a: string, b: string): boolean {
  const na = normalizeItemContent(a);
  const nb = normalizeItemContent(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) {
    const sim = tokenSimilarity(na, nb);
    return sim >= 0.5;
  }
  return tokenSimilarity(na, nb) >= 0.72;
}
