/**
 * Structured Request + constraint refinement.
 *
 * The request layer converts understood natural language into the stable
 * EngineRequest contract consumed by the Personal Operating Engine.
 *
 * Important:
 * - This is deterministic.
 * - Do not add a second "intent engine" here.
 * - Natural-language coverage should grow through structured fields rather
 *   than an ever-growing collection of UI-specific special cases.
 * - A concrete user request such as "drop off X at Y at 12pm today" should
 *   become an executable create_task request.
 */

import type {
  Confidence,
  Constraint,
  EngineRequest,
  RequestAction,
  WorkingMemorySnapshot,
} from './types';

function id(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function emptyRequest(action: RequestAction = 'unknown'): EngineRequest {
  const now = new Date().toISOString();

  return {
    id: id(),
    action,
    titleText: null,
    objectText: null,
    locationText: null,
    relatedJobText: null,
    relatedMeetingText: null,
    dateHint: null,
    timeHint: null,
    urgency: 'none',
    flexibility: 'high',
    commitment: 'weak',
    consequence: null,
    constraints: [],
    rawUtterances: [],
    confidence: 'low',
    updatedAt: now,
  };
}

function pushConstraint(
  list: Constraint[],
  axis: Constraint['axis'],
  value: string,
  confidence: Confidence,
  source: string
): Constraint[] {
  const filtered = list.filter(
    (c) => !(c.axis === axis && c.value === value)
  );

  return [
    ...filtered,
    {
      axis,
      value,
      confidence,
      source,
    },
  ];
}

/**
 * Normalise common spoken / typed clock expressions.
 *
 * Examples:
 *   12pm       -> 12:00
 *   12 pm      -> 12:00
 *   12:30pm    -> 12:30
 *   12:30 pm   -> 12:30
 *   noon       -> 12:00
 *   midnight   -> 00:00
 */
function normaliseTimeHint(value: string): string | null {
  const raw = value.trim().toLowerCase();

  if (raw === 'noon') return '12:00';
  if (raw === 'midnight') return '00:00';

  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);

  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? '00');
  const meridiem = match[3];

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) {
    return null;
  }

  if (meridiem === 'am') {
    if (hour === 12) hour = 0;
  } else if (hour !== 12) {
    hour += 12;
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

/**
 * Extract an explicit clock time from an utterance.
 */
function extractTimeHint(text: string): string | null {
  const match = text.match(
    /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon|midnight)\b/i
  );

  if (!match?.[1]) return null;

  return normaliseTimeHint(match[1]);
}

/**
 * Extract a location without accidentally swallowing a following time/date.
 *
 * Supported forms include:
 *   at 64 Grace James Road
 *   at 64 Grace James Road in Pukekohe
 *   to 64 Grace James Road in Pukekohe at 12pm today
 *   from ABC Roofing today
 *
 * Important:
 * - "at" can introduce either a location or a clock time — clock forms are boundaries.
 * - Infinitive "to" after need/want/have/going must not be treated as a place marker.
 * - Prefer destination after movement verbs (drop off X to/at Y).
 */
function extractLocation(text: string): string | null {
  /**
   * Destination after movement verb + object:
   *   drop off clips to 64 Grace James Road in Pukekohe at 4pm today
   * Must not treat infinitive "to" in "need to drop off…" as a place marker.
   */
  const afterAction = text.match(
    /\b(?:drop\s+off|dropoff|deliver|take|leave|pick\s*up|pickup|grab|collect|get|fetch)\s+(?:the\s+|a\s+|an\s+)?(?:.+?)\s+(?:at|to|from)\s+(.+?)(?=\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\s+\b(?:noon|midnight)\b|\s+\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\s+\bbecause\b|\s+\bafter\b|$)/i
  );

  let location: string | null = afterAction?.[1]?.trim() ?? null;

  if (!location) {
    /*
     * Movement + destination + infinitive:
     *   "go to Bunnings to grab 2 cartridges..."
     *   "head to Mitre 10 to pick up screws"
     *
     * The first "to" is the destination marker; the second "to" introduces
     * the purpose/action. Resolve the destination between those two markers
     * instead of swallowing the action phrase into locationText.
     */
    const movementDestination = text.match(
      /\b(?:go|going|head|heading|drive|driving|travel|travelling|walk|walking|return|returning)\s+(?:over\s+)?to\s+(.+?)\s+(?:to|and|for)\s+(?:grab|pick\s*up|pickup|collect|get|fetch|buy|purchase|drop\s+off|deliver)\b/i
    );

    if (movementDestination?.[1]) {
      location = movementDestination[1].trim();
    }
  }

  if (!location) {
    // Fall back: first at/to/from that is not an infinitive marker.
    const re = /\b(?:at|to|from)\s+/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const prep = m[0].trim().toLowerCase();
      const before = text.slice(Math.max(0, m.index - 28), m.index).toLowerCase();
      if (
        prep === 'to' &&
        /\b(?:need|want|have|got|going|try|ought|able|supposed)\s+$/i.test(before)
      ) {
        continue;
      }

      const rest = text.slice(m.index + m[0].length);

      /*
       * If this destination is immediately followed later by a second
       * infinitive "to <action>", stop at that boundary.
       *
       * This catches variants where the movement verb is not in the
       * explicit movement list above.
       */
      const purposeBoundary = rest.match(
        /^(.+?)\s+to\s+(?:grab|pick\s*up|pickup|collect|get|fetch|buy|purchase|drop\s+off|deliver)\b/i
      );

      const tail = rest.match(
        /^(.+?)(?=\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\s+\b(?:noon|midnight)\b|\s+\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\s+\bbecause\b|\s+\bafter\b|$)/i
      );

      if (purposeBoundary?.[1]) {
        location = purposeBoundary[1].trim();
        break;
      }

      if (!tail?.[1]) continue;
      location = tail[1].trim();
      break;
    }
  }

  if (!location) return null;

  location = location.replace(/[.,]+$/, '').trim();

  // Avoid treating "at the meeting" as a physical location.
  if (/^(?:the|a|an)\s+meeting$/i.test(location)) {
    return null;
  }

  // Reject values that are still the action phrase, not a place.
  if (
    /^(?:drop\s+off|dropoff|deliver|pick\s*up|pickup|grab|collect|remind|need\s+to)\b/i.test(
      location
    )
  ) {
    return null;
  }

  if (location.length < 2 || location.length > 120) {
    return null;
  }

  return location;
}

/**
 * Parse a natural utterance into request fields.
 *
 * This is deliberately a semantic-to-request adapter, not a UI parser.
 * The resulting EngineRequest is what the operating engine reasons over.
 */
export function interpretRequestUtterance(raw: string): Partial<EngineRequest> & {
  isRefinement: boolean;
  isCorrection: boolean;
} {
  const text = raw.replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const isQuestion =
    /\?\s*$/.test(text) ||
    /^(?:can|could|do|does|should|is|are|will|what|when|where|why|how)\b/i.test(lower);
  const isNegatedCommitment =
    /\b(?:i\s+)?(?:do\s+not|don't|do\s+n[o’]t|never)\s+(?:need|have|got)\s+to\b/i.test(lower) ||
    /\bnot\s+(?:need|have|got)\s+to\b/i.test(lower);

  const out: Partial<EngineRequest> & {
    isRefinement: boolean;
    isCorrection: boolean;
  } = {
    isRefinement: false,
    isCorrection: false,
    constraints: [],
  };

  if (!text) {
    return out;
  }

  // ---------------------------------------------------------------------------
  // Corrections / refinements
  // ---------------------------------------------------------------------------

  if (
    /^(?:no|actually|sorry|wait|i\s+meant)\b/i.test(text) ||
    /\bactually\b/i.test(lower) ||
    /\b(?:i\s+)?need\s+it\b/i.test(lower) ||
    /\b(?:make|put|do)\s+that\b/i.test(lower) ||
    /\b(?:the\s+)?same\s+one\b/i.test(lower)
  ) {
    out.isCorrection = /^(?:no|sorry|i\s+meant)\b/i.test(text);
    out.isRefinement = true;
  }

  // ---------------------------------------------------------------------------
  // Pronoun / anaphora toward prior request
  // ---------------------------------------------------------------------------

  if (
    /\b(?:it|that|this|those|these)\b/i.test(lower) &&
    !/\b(?:pick\s*up|drop\s*off|remind\s+me|start|create|make\s+a)\b/i.test(lower)
  ) {
    out.isRefinement = true;
  }

  // ---------------------------------------------------------------------------
  // Action class
  // ---------------------------------------------------------------------------

  // Questions and explicit negations are observations about possible work,
  // never executable captures. This guard must run before verb extraction so
  // "Do I need to drop this off?" cannot inherit "drop off" as an action.
  if (isQuestion || isNegatedCommitment) {
    out.action = 'unknown';
  } else if (
    /\b(?:remind\s+me|don(?:'t|’t)\s+let\s+me\s+forget|keep\s+that\s+in\s+mind)\b/i.test(
      lower
    )
  ) {
    out.action = 'remind';
  } else if (/\b(?:drop\s+off|dropoff|deliver|take\s+to|leave\s+at)\b/i.test(lower)) {
    out.action = 'create_task';
  } else if (/\b(?:pick\s*up|pickup|grab|collect|get|fetch)\b/i.test(lower)) {
    out.action = out.action === 'remind' ? 'remind' : 'pickup';
  } else if (
    /\b(?:put|move|chuck)\b.+\b(?:tomorrow|today|monday|tuesday)\b/i.test(lower)
  ) {
    out.action = 'move';
    out.isRefinement = true;
  } else if (/\b(?:i\s+)?(?:need|have|got)\s+to\s+/i.test(lower)) {
    // "I need to call the client tomorrow" is an executable task request,
    // not an unknown intent. Keep this generic so the CPU can reason over
    // communication, checks, site work, and other non-movement tasks without
    // adding a verb-specific branch for every possible task.
    out.action = 'create_task';
  }

  // ---------------------------------------------------------------------------
  // Object
  // ---------------------------------------------------------------------------

  const objectPatterns = [
    /\b(?:drop\s+off|dropoff|deliver|take\s+to|leave\s+at)\s+(?:the\s+|a\s+|an\s+)?(.+?)(?=\s+(?:at|to|from)\s+|\s+\b(?:today|tomorrow)\b|\s+\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|$)/i,

    // Movement + purpose: "go to Bunnings and grab two cartridges".
    // The object belongs after the purpose verb, not after the destination.
    /\b(?:grab|pick\s*up|pickup|collect|get|fetch|buy|purchase)\s+(?:the\s+|a\s+|an\s+)?(.+?)(?=\s+(?:from|at|to|for)\s+|\s+\b(?:today|tomorrow)\b|\s+\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|$)/i,

    /\b(?:remind\s+me\s+(?:about|to)\s+)(.+)$/i,

    // Generic explicit commitment: preserve the complete task phrase for
    // executable requests such as "I need to call the client tomorrow".
    /\b(?:i\s+)?(?:need|have|got)\s+to\s+(.+?)(?=\s+\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\s+\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|$)/i,
  ];

  for (const pattern of objectPatterns) {
    if (isQuestion || isNegatedCommitment) break;
    const match = text.match(pattern);

    if (!match?.[1]) continue;

    let objectText = match[1].trim().replace(/[.,]+$/, '').trim();

    objectText = objectText.replace(/\s+\b(?:today|tomorrow)\b.*$/i, '').trim();
    objectText = objectText
      .replace(/\s+\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b.*$/i, '')
      .trim();

    if (objectText.length > 1 && objectText.length < 120) {
      out.objectText = objectText;
      break;
    }
  }

  // ---------------------------------------------------------------------------
  // Location
  // ---------------------------------------------------------------------------

  const location = extractLocation(text);

  if (location) {
    out.locationText = location;
  }

  // ---------------------------------------------------------------------------
  // Job link
  // ---------------------------------------------------------------------------

  const job =
    text.match(/\b(?:on|for)\s+(?:the\s+)?([A-Z][\w\s-]{1,40}?)\s+job\b/i) ||
    text.match(/\busing\s+it\s+on\s+(?:the\s+)?([A-Z][\w\s-]{1,40})\b/i);

  if (job?.[1]) {
    out.relatedJobText = job[1].trim();
  }

  // ---------------------------------------------------------------------------
  // Meeting
  // ---------------------------------------------------------------------------

  if (/\bafter\s+(?:the\s+)?meeting\b/i.test(lower)) {
    out.relatedMeetingText = 'meeting';

    out.constraints = pushConstraint(
      out.constraints ?? [],
      'dependency',
      'after_meeting',
      'medium',
      'utterance'
    );
  }

  // ---------------------------------------------------------------------------
  // Temporal date
  // ---------------------------------------------------------------------------

  if (/\btoday\b/i.test(lower)) {
    out.dateHint = 'today';

    out.constraints = pushConstraint(
      out.constraints ?? [],
      'temporal',
      'today',
      'high',
      'utterance'
    );
  } else if (/\btomorrow\b/i.test(lower)) {
    out.dateHint = 'tomorrow';

    out.constraints = pushConstraint(
      out.constraints ?? [],
      'temporal',
      'tomorrow',
      'high',
      'utterance'
    );
  } else if (/\bthis\s+afternoon\b/i.test(lower)) {
    out.dateHint = 'today';
    out.timeHint = 'afternoon';

    out.constraints = pushConstraint(
      out.constraints ?? [],
      'temporal',
      'afternoon',
      'medium',
      'utterance'
    );
  } else if (/\bnext\s+week\b/i.test(lower)) {
    out.dateHint = 'next_week';

    out.constraints = pushConstraint(
      out.constraints ?? [],
      'temporal',
      'next_week',
      'medium',
      'utterance'
    );
  } else if (/\bwhenever\b/i.test(lower)) {
    out.flexibility = 'high';

    out.constraints = pushConstraint(
      out.constraints ?? [],
      'flexibility',
      'whenever',
      'high',
      'utterance'
    );
  }

  // Explicit clock time should be preserved independently of date.
  const timeHint = extractTimeHint(text);

  if (timeHint) {
    out.timeHint = timeHint;

    out.constraints = pushConstraint(
      out.constraints ?? [],
      'temporal',
      `time:${timeHint}`,
      'high',
      'utterance'
    );
  }

  // ---------------------------------------------------------------------------
  // Urgency / consequence
  // ---------------------------------------------------------------------------

  if (
    /\b(?:need\s+it\s+today|don(?:'t|’t)\s+let\s+me\s+forget|make\s+sure)\b/i.test(
      lower
    )
  ) {
    out.urgency = 'elevated';

    out.constraints = pushConstraint(
      out.constraints ?? [],
      'urgency',
      'elevated',
      'medium',
      'utterance'
    );
  }

  if (/\bnot\s+urgent\b/i.test(lower)) {
    out.urgency = 'none';
    out.flexibility = 'high';
  }

  if (/\bbecause\b/i.test(lower)) {
    const consequence = text.match(/\bbecause\s+(.+)$/i);

    if (consequence?.[1]) {
      out.consequence = consequence[1].trim();

      out.constraints = pushConstraint(
        out.constraints ?? [],
        'consequence',
        consequence[1].trim().slice(0, 120),
        'medium',
        'utterance'
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Route opportunity language
  // ---------------------------------------------------------------------------

  if (
    /\b(?:heading\s+through|going\s+past|already\s+(?:going|heading)|on\s+the\s+way)\b/i.test(
      lower
    )
  ) {
    out.constraints = pushConstraint(
      out.constraints ?? [],
      'location',
      'route_opportunity',
      'medium',
      'utterance'
    );

    out.isRefinement = true;
  }

  return out;
}

/**
 * Merge utterance interpretation into an existing request or start a new one.
 */
export function applyUtteranceToRequest(
  existing: EngineRequest | null,
  raw: string,
  mem: WorkingMemorySnapshot
): EngineRequest {
  const partial = interpretRequestUtterance(raw);
  const partialAction = partial.action ?? 'unknown';
  const normalisedRaw = raw.replace(/\s+/g, ' ').trim();
  const lowerRaw = normalisedRaw.toLowerCase();
  const isQuestion =
    /\?\s*$/.test(normalisedRaw) ||
    /^(?:can|could|do|does|should|is|are|will|what|when|where|why|how)\b/i.test(lowerRaw);
  const isNegatedCommitment =
    /\b(?:i\s+)?(?:do\s+not|don't|never)\s+(?:need|have|got)\s+to\b/i.test(lowerRaw) ||
    /\bnot\s+(?:need|have|got)\s+to\b/i.test(lowerRaw);

  const hasTaskBind = !!existing?.constraints?.some(
    (c) => c.axis === 'dependency' && c.value.startsWith('task:')
  );

  const looksLikeNewCapture =
    (partialAction === 'remind' ||
      partialAction === 'pickup' ||
      partialAction === 'create_task') &&
    !!partial.objectText &&
    !partial.isRefinement &&
    !partial.isCorrection;

  const continueActive =
    !!existing &&
    !looksLikeNewCapture &&
    (partial.isRefinement ||
      partial.isCorrection ||
      hasTaskBind ||
      mem.activeRequestId === existing.id ||
      partialAction === 'unknown' ||
      partialAction === existing.action ||
      partialAction === 'move');

  const base =
    continueActive && existing
      ? {
          ...existing,
          constraints: [...existing.constraints],
        }
      : emptyRequest(partialAction);

  if (!continueActive) {
    base.action = partial.action ?? 'unknown';
  } else if (partial.action && partial.action !== 'unknown') {
    if (base.action === 'unknown') {
      base.action = partial.action;
    }
  }

  if (partial.objectText) {
    base.objectText = partial.objectText;
    if (!base.titleText) {
      base.titleText = partial.objectText;
    }
  }

  if (partial.locationText) {
    base.locationText = partial.locationText;
  }

  if (partial.relatedJobText) {
    base.relatedJobText = partial.relatedJobText;
  }

  if (partial.relatedMeetingText) {
    base.relatedMeetingText = partial.relatedMeetingText;
  }

  if (partial.dateHint) {
    base.dateHint = partial.dateHint;
  }

  if (partial.timeHint) {
    base.timeHint = partial.timeHint;
  }

  if (partial.urgency && partial.urgency !== 'none') {
    base.urgency = partial.urgency;
  }

  if (partial.urgency === 'none' && partial.isRefinement) {
    base.urgency = 'none';
  }

  if (partial.flexibility) {
    base.flexibility = partial.flexibility;
  }

  if (partial.consequence) {
    base.consequence = partial.consequence;
  }

  for (const constraint of partial.constraints ?? []) {
    base.constraints = pushConstraint(
      base.constraints,
      constraint.axis,
      constraint.value,
      constraint.confidence,
      constraint.source
    );
  }

  base.rawUtterances = [...base.rawUtterances, raw.trim()].slice(-12);

  base.updatedAt = new Date().toISOString();

  let score = 0;

  if (base.objectText) score += 1;
  if (base.locationText) score += 1;
  if (base.dateHint) score += 1;
  if (base.timeHint) score += 1;
  if (base.relatedJobText) score += 1;

  base.confidence = score >= 3 ? 'high' : score >= 1 ? 'medium' : 'low';

  // Explicit "need/have/got to" language is a user commitment. When it has
  // enough structure to execute, mark it hard so capacity/opportunity logic
  // cannot later downgrade or veto the user's chosen commitment.
  const explicitCommitment =
    !isQuestion &&
    !isNegatedCommitment &&
    (
      /\b(?:i\s+)?(?:need|have|got)\s+to\s+/i.test(raw) ||
      /\b(?:i\s+)?must\s+/i.test(raw)
    );

  if (
    explicitCommitment &&
    base.objectText &&
    (base.action === 'create_task' ||
      base.action === 'pickup' ||
      base.action === 'remind') &&
    base.confidence !== 'low'
  ) {
    base.commitment = 'hard';
    base.flexibility = 'low';
  }

  if (
    (base.action === 'remind' || base.action === 'pickup') &&
    base.commitment !== 'hard'
  ) {
    base.commitment = base.urgency === 'high' ? 'soft' : 'weak';
  }

  return base;
}

/**
 * Build the human task text while preserving the user's actual action.
 *
 * Examples:
 *   pickup + flashing -> Pick up flashing
 *   create_task + drop off clips -> Drop off clips
 *   create_task + check flashing -> check flashing
 */
export function requestTaskText(req: EngineRequest): string {
  const firstUtterance = req.rawUtterances[0] ?? '';

  const lowerFirst = firstUtterance.toLowerCase();

  const isDropOff = /\b(?:drop\s+off|dropoff|deliver|take\s+to|leave\s+at)\b/i.test(
    lowerFirst
  );

  const isPickup =
    req.action === 'pickup' ||
    /\b(?:pick\s*up|pickup|grab|collect|get|fetch)\b/i.test(lowerFirst);

  const bits: string[] = [];

  if (isDropOff) {
    bits.push(req.objectText ? `Drop off ${req.objectText}` : 'Drop off');
  } else if (req.action === 'remind' || isPickup) {
    bits.push(req.objectText ? `Pick up ${req.objectText}` : 'Pick up');
  } else if (req.objectText) {
    bits.push(req.objectText);
  } else if (firstUtterance) {
    bits.push(firstUtterance);
  } else {
    bits.push('Task');
  }

  if (req.locationText && !isDropOff && !isPickup) {
    bits.push(`at ${req.locationText}`);
  }

  return bits.join(' ').replace(/\s+/g, ' ').trim();
}
