/**
 * Polarity / negation — first-class safety signal.
 * "Don't call John" must never become task "Call John".
 */

export type PolarityHit = {
  polarity: 'positive' | 'negated' | 'unknown';
  markers: string[];
  negatedSpan?: string;
};

const NEGATION_PATTERNS: { re: RegExp; marker: string }[] = [
  { re: /\bdon't\s+(?:need\s+to\s+)?/i, marker: "don't" },
  { re: /\bdo\s+not\s+(?:need\s+to\s+)?/i, marker: 'do not' },
  { re: /\bdidn't\s+/i, marker: "didn't" },
  { re: /\bdid\s+not\s+/i, marker: 'did not' },
  { re: /\bhasn't\s+/i, marker: "hasn't" },
  { re: /\bhas\s+not\s+/i, marker: 'has not' },
  { re: /\bhaven't\s+/i, marker: "haven't" },
  { re: /\bhave\s+not\s+/i, marker: 'have not' },
  { re: /\bwon't\s+/i, marker: "won't" },
  { re: /\bwill\s+not\s+/i, marker: 'will not' },
  { re: /\bcan't\s+/i, marker: "can't" },
  { re: /\bcannot\s+/i, marker: 'cannot' },
  { re: /\bno\s+need\s+to\b/i, marker: 'no need to' },
  { re: /\bthere(?:'s|\s+is)\s+no\s+need\b/i, marker: "there's no need" },
  { re: /\bnever\s+/i, marker: 'never' },
  { re: /\bno\s+(?:call|email|send|meet|order|book|chase|create|schedule|message|text|remind)\b/i, marker: 'no action' },
  { re: /\bwait[,.]?\s+(?:wait[,.]?\s+)?no\b/i, marker: 'wait no' },
  { re: /\b(?:nah|nope)\b/i, marker: 'nah' },
  { re: /\bwithout\s+/i, marker: 'without' },
];

export function detectPolarity(text: string): PolarityHit {
  const markers: string[] = [];
  let negatedSpan: string | undefined;

  for (const { re, marker } of NEGATION_PATTERNS) {
    const m = text.match(re);
    if (m) {
      markers.push(marker);
      const idx = text.toLowerCase().indexOf(m[0].toLowerCase());
      if (idx >= 0) {
        negatedSpan = text.slice(idx).trim();
      }
    }
  }

  if (/\b(?:said|say|told|tell)\s+no\b/i.test(text)) {
    markers.push('said no');
  }

  if (markers.length === 0) {
    return { polarity: 'positive', markers: [] };
  }
  return { polarity: 'negated', markers, negatedSpan };
}

export function isActionNegated(text: string): boolean {
  const p = detectPolarity(text);
  if (p.polarity !== 'negated') return false;
  return /\b(?:call|email|send|meet|order|book|chase|create|schedule|message|text|invoice|quote)\b/i.test(
    text
  );
}
