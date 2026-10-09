/**
 * Speech normalisation — deterministic, context-aware.
 * Does not call LLMs. Prefer preserving meaning over aggressive cleanup.
 */

import type {
  Confidence,
  CorrectionSpan,
  NormalisationResult,
  SpokenPunctuationHit,
  TemporalReference,
} from './types';

const FILLER_WORDS = new Set(['um', 'uh', 'erm', 'er', 'hmm', 'mm', 'ah', 'eh']);
const SOFT_FILLERS = new Set(['like', 'you know', 'sort of', 'kind of']);

const PUNCTUATION_MAP: { pattern: RegExp; replacement: string }[] = [
  { pattern: /\bcomma\b/gi, replacement: ',' },
  { pattern: /\bperiod\b/gi, replacement: '.' },
  { pattern: /\bfull\s+stop\b/gi, replacement: '.' },
  { pattern: /\bquestion\s+mark\b/gi, replacement: '?' },
  { pattern: /\bexclamation\s+(?:mark|point)\b/gi, replacement: '!' },
  { pattern: /\bnew\s+paragraph\b/gi, replacement: '\n\n' },
  { pattern: /\bnew\s+line\b/gi, replacement: '\n' },
  { pattern: /\bsemicolon\b/gi, replacement: ';' },
  { pattern: /\bcolon\b/gi, replacement: ':' },
  { pattern: /\bdash\b/gi, replacement: '—' },
];

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  sixty: 60, seventy: 70, eighty: 80, ninety: 90, hundred: 100,
};

function confFromScore(score: number): Confidence {
  if (score >= 0.8) return 'high';
  if (score >= 0.45) return 'medium';
  return 'low';
}

function collapseWhitespace(s: string): string {
  return s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function stripFillers(text: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  const tokens = text.split(/(\s+)/);
  const out: string[] = [];
  for (const t of tokens) {
    const lower = t.toLowerCase().replace(/[.,!?]+$/, '');
    if (FILLER_WORDS.has(lower)) {
      removed.push(t.trim());
      // The previous token may contain the comma that introduced this filler
      // ("I need to, um, call"). Keep meaningful punctuation, but not a
      // separator stranded immediately before a deleted hesitation.
      for (let i = out.length - 1; i >= 0; i -= 1) {
        if (/^\s+$/.test(out[i])) continue;
        if (/[,;:]$/.test(out[i])) out[i] = out[i].replace(/[,;:]$/, '');
        break;
      }
      continue;
    }
    out.push(t);
  }
  let result = out.join('');
  for (const soft of SOFT_FILLERS) {
    const re = new RegExp(`(?:^|\\s)(${soft.replace(/\\s+/g, '\\s+')})(?=\\s|$|[,.])`, 'gi');
    result = result.replace(re, (match, g1, offset) => {
      const before = result.slice(0, offset).trim().toLowerCase();
      if (/\b(i|we|they|you|he|she|really|don't|do not)\s*$/.test(before) && soft === 'like') {
        return match;
      }
      removed.push(g1);
      return match.startsWith(' ') ? ' ' : '';
    });
  }
  return { text: collapseWhitespace(result), removed };
}

export function applySpokenPunctuation(text: string): { text: string; hits: SpokenPunctuationHit[] } {
  const hits: SpokenPunctuationHit[] = [];
  let result = text;
  for (const { pattern, replacement } of PUNCTUATION_MAP) {
    result = result.replace(pattern, (match, offset) => {
      hits.push({ spoken: match, replacement, index: typeof offset === 'number' ? offset : 0 });
      return replacement;
    });
  }
  result = result.replace(/\s+([,.!?;:])/g, '$1');
  result = result.replace(/([.!?])\s*([a-z])/g, (_, p, c) => `${p} ${c.toUpperCase()}`);
  return { text: collapseWhitespace(result), hits };
}

export function detectCorrections(text: string): { text: string; corrections: CorrectionSpan[] } {
  const corrections: CorrectionSpan[] = [];
  let working = text;
  // Bare "wait" is discourse (plan revision), not a mid-span correction marker.
  // Only "wait no / wait actually / wait I mean" count as correction.
  const midCorrection =
    /\b(.{2,40}?)\s*[,—-]?\s*(?:actually|sorry|i\s+mean|rather|instead|wait,?\s+(?:no|actually|i\s+mean)|make\s+that|change\s+that)\s+[,—-]?\s*(.{2,40}?)(?=[.!?]|$)/gi;
  working = working.replace(midCorrection, (full, original, corrected) => {
    const o = String(original).trim();
    const c = String(corrected).trim();
    if (!o || !c || o.toLowerCase() === c.toLowerCase()) return full;
    if (/^actually\b/i.test(full.trim()) && o.split(/\s+/).length <= 1) return full;
    corrections.push({
      marker: 'actually',
      originalRaw: o,
      correctedRaw: c,
      facet: classifyCorrectionFacet(o, c),
      confidence: 'medium',
    });
    return c;
  });
  const notBut = /\bnot\s+(.{1,30}?)\s*[,—-]?\s*(?:but\s+)?(.{1,30}?)(?=[.!?]|$)/gi;
  working = working.replace(notBut, (full, original, corrected) => {
    const o = String(original).trim();
    const c = String(corrected).trim();
    if (!o || !c) return full;
    corrections.push({
      marker: 'not',
      originalRaw: o,
      correctedRaw: c,
      facet: classifyCorrectionFacet(o, c),
      confidence: 'medium',
    });
    return c;
  });
  const noSwap = /\b(.{1,25}?)\s*[,—-]?\s+no[,—-]?\s+(.{1,25}?)(?=[.!?]|$)/gi;
  working = working.replace(noSwap, (full, original, corrected) => {
    const o = String(original).trim();
    const c = String(corrected).trim();
    if (!o || !c || o.toLowerCase() === c.toLowerCase()) return full;
    if (/^(?:no|nope|nah)$/i.test(o) || /^(?:no|nope|nah)$/i.test(c)) return full;
    if (o.split(/\s+/).length > 6 || c.split(/\s+/).length > 6) return full;
    if (/\b(?:said|say|told|tell|answered)\b/i.test(o)) return full;
    corrections.push({
      marker: 'no',
      originalRaw: o,
      correctedRaw: c,
      facet: classifyCorrectionFacet(o, c),
      confidence: 'medium',
    });
    return c;
  });
  return { text: collapseWhitespace(working), corrections };
}

function classifyCorrectionFacet(original: string, corrected: string): CorrectionSpan['facet'] {
  const both = `${original} ${corrected}`.toLowerCase();
  if (/\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|yesterday|week|month)\b/.test(both)) return 'date';
  if (/\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|noon|midnight|morning|afternoon|evening|o'?clock)\b/.test(both)) return 'time';
  if (/^(?:call|meet|email|send|create|job|task)\b/i.test(original) || /^(?:call|meet)/i.test(corrected)) return 'action';
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*$/.test(original) || /^[A-Z]/.test(corrected)) return 'entity';
  return 'generic';
}

export function collapseRepetitions(text: string): { text: string; collapsed: string[] } {
  const collapsed: string[] = [];
  const parts = text.split(/(\s+|[,.!?;:—-]+)/);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const cur = parts[i];
    const prev = out.length > 0 ? out[out.length - 1] : '';
    const curWord = cur.trim();
    const prevWord = prev.trim();
    if (
      curWord.length > 1 && prevWord.length > 1 &&
      curWord.toLowerCase() === prevWord.toLowerCase() &&
      /^[A-Za-z']+$/.test(curWord) &&
      !/^(that|this|then|than|to|for|and|or|but|the|a|an)$/i.test(curWord)
    ) {
      collapsed.push(curWord);
      continue;
    }
    out.push(cur);
  }
  return { text: collapseWhitespace(out.join('')), collapsed };
}

export function expandSpokenNumbers(text: string): { text: string; expansions: { raw: string; value: string }[] } {
  const expansions: { raw: string; value: string }[] = [];
  let result = text;
  // Resolve spoken clock phrases before generic number expansion; otherwise
  // "three thirty" becomes "3 30" and loses its clock structure.
  result = result.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(thirty|fifteen|forty[\s-]?five|o'?clock)\b/gi,
    (match, h, m) => {
      const hour = NUMBER_WORDS[h.toLowerCase()];
      if (hour === undefined) return match;
      let mins = 0;
      const ml = m.toLowerCase().replace(/[\s'-]/g, '');
      if (ml === 'thirty') mins = 30;
      else if (ml === 'fifteen') mins = 15;
      else if (ml.startsWith('forty')) mins = 45;
      const value = `${hour}:${String(mins).padStart(2, '0')}`;
      expansions.push({ raw: match, value });
      return value;
    }
  );
  const compound =
    /\b((?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[\s-](?:one|two|three|four|five|six|seven|eight|nine))?|(?:one|two|three|four|five|six|seven|eight|nine)\s+hundred(?:\s+and)?(?:\s+(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety))?(?:[\s-](?:one|two|three|four|five|six|seven|eight|nine))?|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/gi;
  result = result.replace(compound, (match) => {
    const n = wordsToNumber(match);
    if (n === null) return match;
    expansions.push({ raw: match, value: String(n) });
    return String(n);
  });
  result = result.replace(
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(thirty|fifteen|forty[\s-]?five|o'?clock)\b/gi,
    (match, h, m) => {
      const hour = NUMBER_WORDS[h.toLowerCase()];
      if (hour === undefined) return match;
      let mins = 0;
      const ml = m.toLowerCase().replace(/[\s'-]/g, '');
      if (ml === 'thirty') mins = 30;
      else if (ml === 'fifteen') mins = 15;
      else if (ml.startsWith('forty')) mins = 45;
      const value = `${hour}:${String(mins).padStart(2, '0')}`;
      expansions.push({ raw: match, value });
      return value;
    }
  );
  return { text: result, expansions };
}

function wordsToNumber(phrase: string): number | null {
  const parts = phrase.toLowerCase().replace(/-/g, ' ').replace(/\band\b/g, ' ').split(/\s+/).filter(Boolean);
  let current = 0;
  for (const p of parts) {
    const v = NUMBER_WORDS[p];
    if (v === undefined) return null;
    if (v === 100) current = (current || 1) * 100;
    else current += v;
  }
  return current;
}

export function extractTemporals(text: string, todayIso?: string): TemporalReference[] {
  const today = todayIso ? new Date(todayIso + 'T12:00:00') : new Date();
  const refs: TemporalReference[] = [];
  const lower = text.toLowerCase();
  const push = (raw: string, kind: TemporalReference['kind'], date: Date | null, conf: Confidence) => {
    refs.push({
      raw,
      kind,
      resolvedDate: date ? toIsoDate(date) : null,
      resolvedTime: null,
      isCorrection: false,
      confidence: conf,
    });
  };

  if (/\btoday\b/.test(lower)) push('today', 'today', today, 'high');
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    push('tomorrow', 'tomorrow', d, 'high');
  }
  if (/\byesterday\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    push('yesterday', 'yesterday', d, 'high');
  }
  if (/\bthe\s+day\s+after\s+tomorrow\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    push('the day after tomorrow', 'relative_day', d, 'high');
  }
  if (/\bnext\s+week\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    push('next week', 'relative_week', d, 'medium');
  }
  if (/\bearly\s+next\s+week\b/.test(lower)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 7);
    push('early next week', 'relative_week', d, 'low');
  }
  if (/\bend\s+of\s+(?:the\s+)?week\b/.test(lower)) {
    // Prefer Friday as practical end-of-week anchor for trades work
    push(lower.includes('the') ? 'end of the week' : 'end of week', 'relative_week', nextWeekday(today, 5, false), 'medium');
  }
  if (/\bend\s+of\s+(?:the\s+)?month\b/.test(lower)) {
    const d = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    push('end of month', 'deadline', d, 'medium');
  }

  const dayIndex: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  };
  const thisDay = lower.match(/\bthis\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (thisDay) {
    push(thisDay[0], 'weekday', nextWeekday(today, dayIndex[thisDay[1]], false), 'medium');
  }
  const nextDay = lower.match(/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (nextDay) {
    push(nextDay[0], 'relative_week', nextWeekday(today, dayIndex[nextDay[1]], true), 'medium');
  }
  if (/\bfriday\s+week\b/.test(lower)) {
    push('friday week', 'relative_week', nextWeekday(today, 5, true), 'medium');
  }
  if (/\bafter\s+lunch\b/.test(lower)) push('after lunch', 'time_of_day', null, 'medium');
  if (/\bbefore\s+lunch\b/.test(lower)) push('before lunch', 'time_of_day', null, 'medium');
  if (/\bfirst\s+thing\b/.test(lower)) push('first thing', 'time_of_day', null, 'medium');
  const byDay = lower.match(/\bby\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow)\b/);
  if (byDay) {
    if (byDay[1] === 'tomorrow') {
      const d = new Date(today);
      d.setDate(d.getDate() + 1);
      push(byDay[0], 'deadline', d, 'high');
    } else {
      push(byDay[0], 'deadline', nextWeekday(today, dayIndex[byDay[1]], false), 'high');
    }
  }

  if (/\bthis\s+afternoon\b/.test(lower)) push('this afternoon', 'time_of_day', today, 'medium');
  if (/\bsometime\s+next\s+week\b/.test(lower)) push('sometime next week', 'vague', null, 'low');

  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < weekdays.length; i++) {
    const name = weekdays[i];
    const nextRe = new RegExp(`\\bnext\\s+${name}\\b`);
    const plainRe = new RegExp(`\\b${name}\\b`);
    if (nextRe.test(lower)) {
      push(`next ${name}`, 'weekday', nextWeekday(today, i, true), 'high');
    } else if (plainRe.test(lower)) {
      push(name, 'weekday', nextWeekday(today, i, false), 'medium');
    }
  }

  const clock = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (clock) {
    refs.push({
      raw: clock[0],
      kind: 'clock_time',
      resolvedDate: null,
      resolvedTime: `${clock[1].padStart(2, '0')}:${clock[2]}`,
      isCorrection: false,
      confidence: 'high',
    });
  }
  return dedupeTemporalRefs(text, refs);
}

function dedupeTemporalRefs(text: string, refs: TemporalReference[]): TemporalReference[] {
  if (refs.length <= 1) return refs;
  const lower = text.toLowerCase();
  const scored = refs.map((r) => {
    const start = lower.indexOf(r.raw.toLowerCase());
    let score = r.raw.length;
    if (r.kind === 'deadline') score += 20;
    if (r.kind === 'relative_day' || r.kind === 'relative_week') score += 15;
    if (r.kind === 'vague') score -= 10;
    return { r, start: start < 0 ? 9999 : start, end: start < 0 ? 9999 : start + r.raw.length, score };
  });
  scored.sort((a, b) => b.score - a.score || b.r.raw.length - a.r.raw.length);
  const chosen: typeof scored = [];
  for (const h of scored) {
    const overlaps = chosen.some(
      (c) => h.start < 9000 && c.start < 9000 && !(h.end <= c.start || h.start >= c.end)
    );
    if (overlaps) continue;
    chosen.push(h);
  }
  chosen.sort((a, b) => a.start - b.start);
  return chosen.map((c) => c.r);
}

function nextWeekday(from: Date, targetDow: number, forceNext: boolean): Date {
  const d = new Date(from);
  const current = d.getDay();
  let delta = (targetDow - current + 7) % 7;
  if (delta === 0) delta = forceNext ? 7 : 0;
  d.setDate(d.getDate() + delta);
  return d;
}

function toIsoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function normaliseSpeech(rawText: string, options?: { todayIso?: string }): NormalisationResult {
  const originalText = rawText ?? '';
  if (!originalText.trim()) {
    return {
      originalText,
      normalisedText: '',
      fillersRemoved: [],
      repetitionsCollapsed: [],
      punctuationApplied: [],
      corrections: [],
      temporals: [],
      numbersExpanded: [],
      confidence: 'low',
    };
  }
  let text = originalText.replace(/\s+/g, ' ').trim();
  const fillers = stripFillers(text);
  text = fillers.text;
  const reps = collapseRepetitions(text);
  text = reps.text;
  const corr = detectCorrections(text);
  text = corr.text;
  const numbers = expandSpokenNumbers(text);
  text = numbers.text;
  const punct = applySpokenPunctuation(text);
  text = punct.text;
  const temporals = extractTemporals(text, options?.todayIso);
  for (const c of corr.corrections) {
    if (c.facet === 'date' || c.facet === 'time') {
      for (const t of temporals) {
        if (t.raw.toLowerCase().includes(c.correctedRaw.toLowerCase()) || c.correctedRaw.toLowerCase().includes(t.raw.toLowerCase())) {
          t.isCorrection = true;
        }
      }
    }
  }
  let score = 0.55;
  if (fillers.removed.length > 0) score += 0.05;
  if (punct.hits.length > 0) score += 0.05;
  if (corr.corrections.length > 0) score += 0.1;
  if (temporals.some((t) => t.confidence === 'high')) score += 0.1;
  return {
    originalText,
    normalisedText: collapseWhitespace(text),
    fillersRemoved: fillers.removed,
    repetitionsCollapsed: reps.collapsed,
    punctuationApplied: punct.hits,
    corrections: corr.corrections,
    temporals,
    numbersExpanded: numbers.expansions,
    confidence: confFromScore(Math.min(1, score)),
  };
}
