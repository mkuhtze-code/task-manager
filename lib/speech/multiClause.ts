/**
 * Soft multi-clause detection — does not auto-create tasks.
 * Returns candidate action spans for confirmation UI later.
 */

export type ActionClause = {
  raw: string;
  verbs: string[];
  confidence: 'low' | 'medium' | 'high';
};

const ACTION_VERBS =
  /\b(call|email|send|meet|message|text|create|schedule|order|book|invoice|quote|chase|follow\s+up|check|inspect|finish|complete|mark|push|postpone|cancel|delete|update|note|remind|tell|ask|pick|drop|collect|fetch|grab|deliver)\b/gi;

/**
 * Prefer sentence / discourse boundaries; only split on "and" when each side
 * carries its own action verb.
 */
export function extractActionClauses(text: string): ActionClause[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const discourseParts = trimmed
    .split(/(?<=[.!?])\s+|\s+—\s+|\s*,\s*wait,?[\s]+|\s+\bOh,?\s+and\b\s+|\s+\bSo\s+(?:let'?s|lets)\b\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);

  if (discourseParts.length >= 2) {
    return discourseParts.map((part) => {
      const partVerbs = [...part.matchAll(ACTION_VERBS)].map((m) =>
        m[0].toLowerCase().replace(/\s+/g, ' ')
      );
      return {
        raw: part,
        verbs: partVerbs,
        confidence: partVerbs.length ? ('medium' as const) : ('low' as const),
      };
    });
  }

  const verbs = [...trimmed.matchAll(ACTION_VERBS)].map((m) =>
    m[0].toLowerCase().replace(/\s+/g, ' ')
  );
  if (verbs.length < 2) {
    return [{ raw: trimmed, verbs, confidence: verbs.length ? 'medium' : 'low' }];
  }

  const parts = trimmed.split(/\b(?:and|also)\b/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) {
    return [{ raw: trimmed, verbs, confidence: 'medium' }];
  }

  const mapped = parts.map((part) => {
    const partVerbs = [...part.matchAll(ACTION_VERBS)].map((m) =>
      m[0].toLowerCase().replace(/\s+/g, ' ')
    );
    return {
      raw: part,
      verbs: partVerbs,
      confidence: (partVerbs.length ? 'medium' : 'low') as 'low' | 'medium' | 'high',
    };
  });

  if (mapped.filter((c) => c.verbs.length > 0).length < 2) {
    return [{ raw: trimmed, verbs, confidence: 'medium' }];
  }
  return mapped;
}

export function hasMultiActionCandidate(text: string): boolean {
  const clauses = extractActionClauses(text);
  return clauses.filter((c) => c.verbs.length > 0).length >= 2;
}
