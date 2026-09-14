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
  // The action text: the input with any date/time, road-location tokens and
  // grammatical/context fillers removed (and a boundary preposition trimmed),
  // so the acceptance example "Belgium Rd tomorrow at 10am to measure Rainwater
  // Head" → intent "measure Rainwater Head", and "I need to call the dentist
  // urgently" → intent "call the dentist". If nothing was consumed,
  // intent === input.
  intent: string;
  // Resolved calendar date as 'YYYY-MM-DD', or null.
  date: string | null;
  // Resolved clock time, or null.
  time: ParsedClock | null;
  // A road-type phrase (e.g. "Belgium Rd") to resolve against jobs, or null.
  locationHint: string | null;
  // A detected priority/state modifier facet — "urgent", "asap", "important",
  // "priority", "delayed", "waiting", "blocked", "on hold" — surfaced for the
  // UI but kept OUT of the task label (intent). Null when none was recognised.
  priority: string | null;
  // Hints that the input actually contained consumable facets or that the
  // label was cleaned up (obligation/project/priority fillers removed).
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

// ── Grammatical / context fillers (V1.1) ─────────────────────────────
// Obligation constructions that ride on the front of a command and are not
// part of the action ("I need to call...", "must call..."). need/have/got
// only fire when followed by "to" so "have a coffee" is never mangled; the
// modal must/should also fire directly before the verb ("must call").
const OBLIGATION_LEAD_RE =
  /^(?:(?:i|we|you)\s+)?(?:need|have|got)\s+to\s+/i;
const MODAL_LEAD_RE = /^(?:(?:i|we|you)\s+)?(?:must|should)\s+/i;
const REMEMBER_LEAD_RE = /^(?:remember|don't\s+forget|do\s+not\s+forget)\s+to\s+/i;

// Priority / state modifiers. These are facets of the thought — a priority or
// a workflow state — not part of the label itself, so they are surfaced but
// kept out of the intent ("urgent: call the dentist" → intent "call the
// dentist", priority "urgent"). Only standalone markers at the leading or
// trailing edge are recognised, so an embedded adjective ("an important email")
// is left alone.
const PRIORITY_FACET: Record<string, string> = {
  urgent: 'urgent',
  urgently: 'urgent',
  asap: 'urgent',
  important: 'important',
  priority: 'priority',
  'high priority': 'high priority',
  delayed: 'delayed',
  waiting: 'waiting',
  blocked: 'blocked',
  'on hold': 'on hold',
};

function canonicalPriority(word: string): string {
  return PRIORITY_FACET[word.toLowerCase().trim()] ?? word.toLowerCase().trim();
}

// Strips one leading priority marker (optionally followed by a colon/comma)
// and/or one leading obligation construction. Returns the cleaned text and the
// first priority facet found, if any.
function stripLeadingFacets(text: string): { text: string; priority: string | null } {
  let out = text.trim();
  let priority: string | null = null;
  let guard = 0;
  while (guard < 4) {
    guard++;
    const trimmed = out.trimStart();
    const lead = trimmed.match(/^(urgent|urgently|asap|important|priority|high\s+priority|on\s+hold|delayed|waiting|blocked)\s*[:,\-]?\s+/i);
    if (lead) {
      priority = canonicalPriority(lead[1]);
      out = trimmed.slice(lead[0].length).trimStart();
      continue;
    }
    const ob = trimmed.match(OBLIGATION_LEAD_RE) || trimmed.match(MODAL_LEAD_RE) || trimmed.match(REMEMBER_LEAD_RE);
    if (ob) {
      out = trimmed.slice(ob[0].length).trimStart();
      continue;
    }
    const bare = trimmed.match(/^(urgent|urgently|asap|important|priority|high\s+priority|on\s+hold|delayed|waiting|blocked)\s*$/i);
    if (bare) {
      priority = canonicalPriority(bare[1]);
      out = '';
      continue;
    }
    break;
  }
  return { text: out, priority };
}

// Strips one trailing priority/state marker (optionally after a comma or
// em-dash). e.g. "call the dentist - urgent" → "call the dentist".
function stripTrailingFacet(text: string): { text: string; priority: string | null } {
  const trimmed = text.trim();
  const m = trimmed.match(
    /[\s,:\-–—]+(urgent|urgently|asap|important|priority|high\s+priority|on\s+hold|delayed|waiting|blocked)\s*$/i,
  );
  if (m) {
    return {
      text: trimmed.slice(0, trimmed.length - m[0].length).trim(),
      priority: canonicalPriority(m[1]),
    };
  }
  return { text: trimmed, priority: null };
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
    return {
      originalInput,
      intent: '',
      date: null,
      time: null,
      locationHint: null,
      priority: null,
      hadFacets: false,
    };
  }

  // V1.1: pull grammatical/context fillers (obligation constructions and
  // priority/state markers) off the label first. These are facets, not the
  // action — they are removed from `intent` so the label reads cleanly, but
  // the priority is still surfaced for the UI. The rest of the walk then runs
  // on the cleaned `working` string, so its spans are always relative to it.
  const lead = stripLeadingFacets(text);
  let working = lead.text;
  let priority = lead.priority;
  const trail = stripTrailingFacet(working);
  working = trail.text;
  if (trail.priority && !priority) priority = trail.priority;
  const textTransformed = working !== text;

  // Walk the string left-to-right, collecting consumed spans.
  const consumed: { start: number; end: number }[] = [];
  let date: string | null = null;
  let time: ParsedClock | null = null;

  let i = 0;
  while (i < working.length) {
    // Try a clock token at this offset.
    const clock = parseClockMatch(working, i);
    if (clock) {
      if (time === null) {
        time = clock.clock;
        consumed.push({ start: i, end: i + clock.token.length });
        // Consume a leading "at" (e.g. "at 10am").
        const before = working.slice(0, i).match(/(\s+at)\s*$/i);
        if (before) {
          consumed.push({ start: i - before[1].length, end: i });
        }
      }
      i += clock.token.length;
      continue;
    }

    // Try a date word at this offset.
    const lower = working.slice(i);
    const dateMatch = matchDateWord(lower, today);
    if (dateMatch) {
      if (date === null) {
        date = dateMatch.date;
        consumed.push({ start: i, end: i + dateMatch.matchLength });
        // Consume a leading "on" / "next" / "this".
        const before = working.slice(0, i).match(/(\s+(?:on|next|this))\s*$/i);
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
  const roadMatch = extractRoadPhrase(working, consumed);
  if (roadMatch) {
    locationHint = roadMatch.phrase;
    consumed.push({ start: roadMatch.start, end: roadMatch.end });
    // Consume a leading "at" / "to" / "on" if one rides on the phrase.
    const before = working.slice(0, roadMatch.start).match(/(\s+(?:at|to|on))\s*$/i);
    if (before) {
      consumed.push({ start: roadMatch.start - before[1].length, end: roadMatch.start });
    }
  }

  // Build the intent from the non-consumed spans.
  const intent = buildIntent(working, consumed);

  return {
    originalInput,
    intent,
    date,
    time,
    locationHint,
    priority,
    hadFacets: date !== null || time !== null || locationHint !== null || textTransformed,
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
// Capture the SHORT place name directly in front of a road-type suffix —
// one or two tokens ("Belgium Rd", "14 Belgium Road", "Valley View
// Avenue"). Two tokens is the widest the prefix ever goes, so a road that
// sits mid-sentence ("Meeting with Tim at Belgium Rd tomorrow at 2pm")
// never swallows the words in front of it as part of the "place name".
// The suffix must be a SEPARATE word (whitespace-required) so "dentist"
// can never splice into "denti" + "st", and a leading preposition
// ("at Belgium Rd", "on Main St") is dropped from the phrase and left to
// the surrounding preposition consumption.
const ROAD_NAME_TOKEN = "[a-z0-9][a-z0-9.'-]*";
const PLACE_PREP = new Set(['at', 'to', 'on', 'in', 'near', 'by', 'via', 'around', 'next']);
const ROAD_PHRASE_SRC =
  '\\b(' + ROAD_NAME_TOKEN + '(?:\\s+' + ROAD_NAME_TOKEN + ')?)\\s+' +
  '(road|rd|street|st|avenue|ave|lane|ln|drive|dr|boulevard|blvd|way|place|pl|terrace|close|grove|crescent|mews|rte|route|highway|hwy|parkway|court|ct)(?:\\.)?\\b';

function extractRoadPhrase(
  text: string,
  consumed: { start: number; end: number }[],
): { phrase: string; start: number; end: number } | null {
  // Fresh instance per call: a shared /g regex would leak lastIndex across
  // parseThought calls and drop later matches.
  const re = new RegExp(ROAD_PHRASE_SRC, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    let phrase = (m[1] + ' ' + m[2]).trim();
    let start = m.index;
    const first = m[1].split(/\s+/)[0];
    if (PLACE_PREP.has(first.toLowerCase()) && phrase.split(/\s+/).length > 2) {
      phrase = phrase.split(/\s+/).slice(1).join(' ');
      start = m.index + first.length + 1;
    }
    if (phrase.length < 3) continue;
    if (!looksLikeRoadPhrase(phrase)) continue;
    // The phrase's raw span: `start` is the first word char of the name
    // part; the joint includes a space before the suffix, so end at
    // start + phrase.length.
    const end = start + phrase.length;
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
