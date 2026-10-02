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
  /\b(call|email|send|meet|message|text|create|schedule|order|book|invoice|quote|chase|follow\s+up|check|inspect|finish|complete|mark|push|postpone|cancel|delete|update|note)\b/gi;

/**
 * Split on "and" / "also" only when multiple action verbs appear.
 * Never forces multiple tasks — candidates only.
 */
export function extractActionClauses(text: string): ActionClause[] {
  const verbs = [...text.matchAll(ACTION_VERBS)].map((m) => m[0].toLowerCase().replace(/\s+/g, ' '));
  if (verbs.length < 2) {
    return text.trim()
      ? [{ raw: text.trim(), verbs, confidence: verbs.length ? 'medium' : 'low' }]
      : [];
  }

  const parts = text.split(/\b(?:and|also)\b/i).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) {
    return [{ raw: text.trim(), verbs, confidence: 'medium' }];
  }

  return parts.map((part) => {
    const partVerbs = [...part.matchAll(ACTION_VERBS)].map((m) =>
      m[0].toLowerCase().replace(/\s+/g, ' ')
    );
    return {
      raw: part,
      verbs: partVerbs,
      confidence: partVerbs.length ? 'medium' : 'low',
    };
  });
}

export function hasMultiActionCandidate(text: string): boolean {
  const clauses = extractActionClauses(text);
  return clauses.filter((c) => c.verbs.length > 0).length >= 2;
}
