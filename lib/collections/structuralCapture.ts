/**
 * Structural multi-item capture — wide net, not domain recipes.
 *
 * Detects utterances that are clearly "several related things, optionally
 * under an action, optionally anchored to a place/job" without requiring
 * the user to say "list".
 *
 * Examples that should fire:
 *   "I need to order downpipes, 5 bends, 6 unsent rings and some screws for Munstead"
 *   "get milk, bread and eggs"
 *   "pick up screws, gib and adhesive for Smith Street"
 *
 * Examples that must NOT fire:
 *   "Call John tomorrow"
 *   "Buy a new drill"
 *   "Call John, email Sarah and book the plumber" (each segment is its own task)
 */

import { collapseWhitespace } from './normalize';
import { itemsFromText, splitItemEnumeration } from './items';
import type { CollectionItemInput } from './types';

/** Procurement / gather style actions — structural role, not product domains. */
const ACTION_RE =
  /\b(order|buy|get|grab|fetch|collect|source|arrange|organise|organize|bring|take|find|pick\s*up)\b/i;

const LEAD_IN_RE =
  /^(?:(?:ok|okay|hey|please)[,\s]+)?(?:i\s+)?(?:(?:just\s+)?(?:need\s+to|want\s+to|gotta|got\s+to|have\s+to|must|should)\s*[,;:]?\s*(?:(?:um+|uh+|erm+|er+)\b[,;:]?\s*)?)?/i;

/** Trailing place/job anchor: "... for Munstead" / "... at Belgium Rd" */
const TRAILING_ANCHOR_RE =
  /\s+(?:for|at|on)\s+([A-Za-z0-9][\w\s'./-]{0,60})$/i;

/** Segments that look like independent tasks, not list items. */
const TASKISH_SEGMENT =
  /^(?:call|email|text|message|meet|schedule|book|pay|fix|write|send|remind|check|inspect|review|confirm|ask|tell|chase|follow\s+up|go|head|drive|travel|walk|visit|return|deliver|drop\s+off|dropoff|take)\b/i;

/**
 * A duration is a task constraint, not an item in a collection.
 * If a comma-separated utterance contains a standalone duration clause
 * ("..., give me 1 hour"), structural list capture must yield to the normal
 * request interpreter so the duration remains attached to the task.
 */
const DURATION_SEGMENT =
  /^(?:give(?:\s+me)?|take|allow|spend|about|around|for)\s+(?:half\s+an?\s+hour|an?\s+half\s+hour|\d+(?:\.\d+)?\s*(?:minutes?|mins?|m|hours?|hrs?|h))\s*$/i;

export type StructuralCapture = {
  title: string;
  items: CollectionItemInput[];
  contextHint: string | null;
  action: string | null;
  reasons: string[];
};

function titleCaseAction(action: string): string {
  const a = collapseWhitespace(action.replace(/\s+/g, ' '));
  if (!a) return 'List';
  return a
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function stripItemDecorators(content: string): string {
  return collapseWhitespace(
    content
      .replace(/^(?:some|a few|a couple of|a bit of|the|a|an)\s+/i, '')
      .replace(/\s+/g, ' ')
  );
}

/**
 * True when the body is an enumeration of related nouns, not a chain of tasks.
 */
function isItemEnumeration(segments: string[]): boolean {
  if (segments.length < 2) return false;
  const taskish = segments.filter((s) => TASKISH_SEGMENT.test(s)).length;
  // If half or more segments look like tasks, this is multi-task not a list
  if (taskish >= Math.ceil(segments.length / 2)) return false;
  // Prefer short noun phrases
  const long = segments.filter((s) => s.split(/\s+/).length > 10).length;
  if (long > 0 && long >= segments.length - 1) return false;
  return true;
}

/**
 * Try to read a structural multi-item capture from natural speech/text.
 * Returns null when evidence is too weak — caller falls through to task create.
 */
export function tryStructuralMultiItemCapture(raw: string): StructuralCapture | null {
  const text = collapseWhitespace(raw);
  if (!text || text.length < 4) return null;

  // Explicit "list" creates are handled elsewhere; this path is for
  // enumeration-shaped utterances that never said the word.
  if (/\b(?:start|create|make|new|open|begin)\b/i.test(text) && /\blists?\b/i.test(text)) {
    return null;
  }

  let body = text.replace(LEAD_IN_RE, '');
  body = collapseWhitespace(body);
  if (!body) return null;

  // Optional trailing anchor
  let contextHint: string | null = null;
  const anchor = body.match(TRAILING_ANCHOR_RE);
  if (anchor) {
    contextHint = collapseWhitespace(anchor[1]);
    body = collapseWhitespace(body.slice(0, anchor.index));
  }

  // Optional leading action
  let action: string | null = null;
  const actionMatch = body.match(
    /^(order|buy|get|grab|fetch|collect|source|arrange|organise|organize|bring|take|find|pick\s*up)\b[\s:]*/i
  );
  if (actionMatch) {
    action = collapseWhitespace(actionMatch[1]);
    body = collapseWhitespace(body.slice(actionMatch[0].length));
  }

  if (!body) return null;

  // Need enumeration structure: commas and/or multiple "and" parts
  const hasEnumCue = /,/.test(body) || (body.match(/\band\b/gi) || []).length >= 1;
  if (!hasEnumCue) return null;

  const segments = splitItemEnumeration(body).map(stripItemDecorators).filter(Boolean);

  // A trailing duration clause is metadata for the primary task, not a list
  // item. More generally, any task-like segment means this is not a related
  // item enumeration.
  if (segments.some((segment) => DURATION_SEGMENT.test(segment))) return null;
  if (!isItemEnumeration(segments)) return null;

  // Require at least 2 items after cleaning
  if (segments.length < 2) return null;

  // Title: action if present; else first-item-class generic "List"
  // When we have an unresolved anchor and no action, prefer the anchor as title
  // so "milk, bread for Munstead" becomes titled toward the job/place.
  let title = 'List';
  const reasons: string[] = ['structural_enumeration'];
  if (action) {
    title = titleCaseAction(action);
    reasons.push('structural_action');
  } else if (contextHint) {
    title = contextHint
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
    reasons.push('structural_anchor_title');
  }

  if (contextHint) reasons.push('structural_anchor');

  const items = segments.map((content) => ({
    content,
    source: 'speech',
    metadata: {} as Record<string, unknown>,
  }));

  return {
    title,
    items,
    contextHint,
    action,
    reasons,
  };
}

/** Convenience: map to CollectionItemInput[] already shaped. */
export function structuralItems(capture: StructuralCapture): CollectionItemInput[] {
  return capture.items.length ? capture.items : itemsFromText('');
}
