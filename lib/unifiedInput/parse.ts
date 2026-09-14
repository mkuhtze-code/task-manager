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
  intent: string;
  date: string | null;
  time: ParsedClock | null;
  locationHint: string | null;
  priority: string | null;
  hadFacets: boolean;
};

const ROAD_SUFFIX_RE =
  /\b(?:road|rd|street|st|avenue|ave|lane|ln|drive|dr|boulevard|blvd|way|place|pl|terrace|close|grove|crescent|mews|rte|route|highway|hwy|parkway|court|ct)(?:\.)?\b/i;

export function looksLikeRoadPhrase(phrase: string): boolean {
  return ROAD_SUFFIX_RE.test(phrase.trim());
}
