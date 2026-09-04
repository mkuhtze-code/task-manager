// lib/unifiedInput/parse.ts
//
// Deterministic, rule-based interpretation of a unified thought. No LLM, no
// NLP framework, no chrono-node. Built on the app's existing date handling
// (localDateStr). The goal is a first, safe resolution: pull out a date, a
// clock time, a road-type location hint, and leave the rest as the action.
//
// The parsing is deliberately conservative and *attributive*: only tokens
// that are recognisably a date or time word are consumed, and the intent
// (remaining text) preserves everything else verbatim. Plain task text like
// "Call the dentist" is left untouched.

import { localDateStr } from '@/lib/timeFormat';

export type ParsedClock = {
  hour: number; // 0–23
  minute: number; // 0–59
  label: string; // human label, e.g. "10:00am"
};

export type ThoughtParts = {
  originalInput: string;
  // The action text: the input with any date/time and road-location tokens
  // removed (and a boundary preposition trimmed), so the acceptance example
  // "Belgium Rd tomorrow at 10am to measure Rainwater Head" → intent
  // "measure Rainwater Head". If nothing was consumed, intent === input.
  intent: string;
  // Resolved calendar date as 'YYYY-MM-DD', or null.
  date: string | null;
  // Resolved clock time, or null.
  time: ParsedClock | null;
  // A road-type phrase (e.g. "Belgium Rd") to resolve against jobs, or null.
  locationHint: string | null;
  // Hints that the input actually contained consumable facets.
  hadFacets: boolean;
};

// ── Road-type words that make a phrase look like a place ──────────────
// Conservative: only fires on an obvious road/street suffix so normal task
// text ("paint the fence", "call the dentist") is never treated as a place.
const ROAD_SUFFIX_RE =
  /\b(?:road|rd|street|st|avenue|ave|lane|ln|drive|dr|boulevard|blvd|way|place|pl|terrace|close|grove|crescent|mews|rte|route|highway|hwy|parkway|court|ct)(?:\.)?\b/i;

export function looksLikeRoadPhrase(phrase: string): boolean {
  return ROAD_SUFFIX_RE.test(phrase.trim());
}

// ── Clock time token: "10am", "10:30", "10:00 am", "7 pm" ─────────────
const CLOCK_TOKEN_RE =
  /\b(\d{1,2})(?::(\d{2}))?\s*(a\.m\.|p\.m\.|am|pm)\b|\b(\d{1,2}):(\d{2})\b/i;

function parseClockMatch(text: string, offset: number): { token: string; clock: ParsedClock } | null {
  const re = CLOCK_TOKEN_RE;
  re.lastIndex = offset;
  const m = re.exec(text);
  if (!m || m.index !== offset) return null;
  const token = m[0];
  let hour: number | null;
  let minute = 0;
  let pm = false;
  if (m[1] !== undefined) {
    // "10am"-style: digit + optional minutes + am/pm
    hour = parseInt(m[1], 10);
    if (m[2] !== undefined) minute = parseInt(m[2], 10);
    pm = /p/i.test(m[3]);
  } else {
    // "HH:MM" style, no am/pm marker
    hour = parseInt(m[4], 10);
    minute = parseInt(m[5], 10);
  }
  if (hour === null || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  if (pm && hour < 12) hour += 12;
  if (m[1] !== undefined && hour === 12 && !pm) hour = 0; // 12am = midnight
  return {
    token,
    clock: {
      hour,
      minute,
      label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    },
  };
}

// ── Calendar date tokens: today, tomorrow, tonight, weekday names ─────
const WEEKDAYS_BY_INDEX: { name: string; names: string[] }[] = [
  { name: 'Sunday', names: ['sunday', 'sun'] },
  { name: 'Monday', names: ['monday', 'mon'] },
  { name: 'Tuesday', names: ['tuesday', 'tue', 'tues', 'tues'] },
  { name: 'Wednesday', names: ['wednesday', 'wed'] },
  { name: 'Thursday', names: ['thursday', 'thu', 'thur', 'thurs'] },
  { name: 'Friday', names: ['friday', 'fri'] },
  { name: 'Saturday', names: ['saturday', 'sat'] },
];

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map((n) => parseInt(n, 10));
  const dt = new Date(y, m - 1, d + days);
  return localDateStr(dt);
}

export function parseThought(raw: string, today: string = localDateStr(new Date())): ThoughtParts {
  const originalInput = raw;
  const text = raw.trim();
  if (text.length === 0) {
    return { originalInput, intent: '', date: null, time: null, locationHint: null, hadFacets: false };
  }

  // Walk the string left-to-right, collecting consumed spans.
  const consumed: { start: number; end: number }[] = [];
  let date: string | null = null;
  let time: ParsedClock | null = null;

  let i = 0;
  while (i < text.length) {
    // Try a clock token at this offset.
    const clock = parseClockMatch(text, i);
    if (clock) {
      if (time === null) {
        time = clock.clock;
        consumed.push({ start: i, end: i + clock.token.length });
        // Consume a leading "at" (e.g. "at 10am").
        const before = text.slice(0, i).match(/(\s+at)\s*$/i);
        if (before) {
          consumed.push({ start: i - before[1].length, end: i });
        }
      }
      i += clock.token.length;
      continue;
    }

    // Try a date word at this offset.
    const lower = text.slice(i);
    const dateMatch = matchDateWord(lower, today);
    if (dateMatch) {
      if (date === null) {
        date = dateMatch.date;
        consumed.push({ start: i, end: i + dateMatch.matchLength });
        // Consume a leading "on" / "next" / "this".
        const before = text.slice(0, i).match(/(\s+(?:on|next|this))\s*$/i);
        if (before) {
          consumed.push({ start: i - before[1].length, end: i });
        }
      }
      i += dateMatch.matchLength;
      continue;
    }

    i += 1;
  }

  // Extract a road-type location hint (first occurrence).
  let locationHint: string | null = null;
  const roadMatch = extractRoadPhrase(text, consumed);
  if (roadMatch) {
    locationHint = roadMatch.phrase;
    consumed.push({ start: roadMatch.start, end: roadMatch.end });
    // Consume a leading "at" / "to" / "on" if one rides on the phrase.
    const before = text.slice(0, roadMatch.start).match(/(\s+(?:at|to|on))\s*$/i);
    if (before) {
      consumed.push({ start: roadMatch.start - before[1].length, end: roadMatch.start });
    }
  }

  // Build the intent from the non-consumed spans.
  const intent = buildIntent(text, consumed);

  return {
    originalInput,
    intent,
    date,
    time,
    locationHint,
    hadFacets: date !== null || time !== null || locationHint !== null,
  };
}

// ── Date-word matching ─────────────────────────────────────────────────
function matchDateWord(
  lowerFrom: string,
  today: string,
): { date: string; matchLength: number } | null {
  // today / tomorrow / tonight
  if (/^tomorrow\b/.test(lowerFrom)) {
    return { date: addDays(today, 1), matchLength: 'tomorrow'.length };
  }
  if (/^today\b/.test(lowerFrom)) {
    return { date: today, matchLength: 'today'.length };
  }
  if (/^tonight\b/.test(lowerFrom)) {
    return { date: today, matchLength: 'tonight'.length };
  }

  // next monday / this wednesday / monday
  const rel = lowerFrom.match(/^((?:next|this)\s+)?([a-z]+)/i);
  if (!rel) return null;
  const weekdayName = rel[2].toLowerCase();
  const entry = WEEKDAYS_BY_INDEX.find((w) => w.names.includes(weekdayName));
  if (!entry) return null;
  const isNext = /^next/i.test(rel[1] || '');
  const matchLength = (rel[1] || '').length + weekdayName.length;
  const dayIndex = WEEKDAYS_BY_INDEX.indexOf(entry);
  const todayIdx = new Date(today + 'T00:00:00Z').getUTCDay();
  let diff = (dayIndex - todayIdx + 7) % 7;
  if (diff === 0) diff = 7; // the same-named day is always in the future
  if (isNext) diff += 7;
  return { date: addDays(today, diff), matchLength };
}

// ── Road-phrase extraction ─────────────────────────────────────────────
function extractRoadPhrase(
  text: string,
  consumed: { start: number; end: number }[],
): { phrase: string; start: number; end: number } | null {
  // Match a phrase that ENDS in a road suffix, e.g. "Belgium Rd", "14
  // Belgium Road", "Valley Avenue". The prefix is letters/numbers/spaces
  // and is kept short so we grab only the place name, not the whole line.
  const re =
    /\b([a-z0-9][a-z0-9 .'-]{0,40}?)(road|rd|street|st|avenue|ave|lane|ln|drive|dr|boulevard|blvd|way|place|pl|terrace|close|grove|crescent|mews|rte|route|highway|hwy|parkway|court|ct)(?:\.)?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const phrase = (m[1] + m[2]).trim();
    if (phrase.length < 3) continue;
    if (!looksLikeRoadPhrase(phrase)) continue;
    // The phrase's raw span: m.index is the first word char; the trimmed
    // phrase may drop a trailing space inside m[1], so end at phrase.length.
    const start = m.index;
    const end = m.index + phrase.length;
    const overlaps = consumed.some((c) => start < c.end && end > c.start);
    if (!overlaps) return { phrase, start, end };
  }
  return null;
}

// ── Intent builder ─────────────────────────────────────────────────────
function buildIntent(text: string, consumed: { start: number; end: number }[]): string {
  if (consumed.length === 0) return text.trim();
  const spans = [...consumed].sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const s of spans) {
    if (s.start > cursor) out += text.slice(cursor, s.start);
    cursor = Math.max(cursor, s.end);
  }
  out += text.slice(cursor);

  let intent = out.replace(/\s+/g, ' ').trim();

  // If something was consumed but the remainder still opens with a pure
  // coordinating preposition ("to measure …"), trim the leading preposition
  // so the action reads cleanly. This only fires when a facet was actually
  // removed, so ordinary task text is never altered.
  if (consumed.length > 0) {
    intent = intent.replace(/^(?:to|for|at|on)\s+/i, '').trim();
  }

  return intent;
}
