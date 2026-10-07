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
    primaryVerb: null,
    personText: null,
    purposeText: null,
    subjectText: null,
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
  const matches = Array.from(
    text.matchAll(
      /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)|noon|midnight)\b/gi
    )
  );

  const last = matches.at(-1)?.[1];
  return last ? normaliseTimeHint(last) : null;
}


/**
 * Extract an explicit task duration from natural language.
 * Explicit duration is per-task user evidence and outranks learned/default estimates.
 */
export function extractDurationHint(text: string): number | null {
  const raw = text.replace(/\s+/g, ' ').trim().toLowerCase();
  if (/\b(?:half\s+an?\s+hour|an?\s+half\s+hour)\b/.test(raw)) return 30;
  if (/\ban?\s+hour\b/.test(raw)) return 60;
  const match = raw.match(/\b(?:for\s+|give(?:\s+me)?\s+|take\s+|about\s+|around\s+)?(\d+(?:\.\d+)?)\s*(minutes?|mins?|m|hours?|hrs?|h)\b/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const minutes = /^(?:hours?|hrs?|h)$/.test(match[2]) ? amount * 60 : amount;
  const rounded = Math.round(minutes);
  return rounded > 0 && rounded <= 24 * 60 ? rounded : null;
}


/**
 * Identify the user's primary task verb, not a nested purpose verb.
 *
 * Examples:
 *   "I need to call Jordan to get the measurements" -> call
 *   "I need to pick up the screws" -> pick up
 *   "I need to get the measurements" -> get
 *
 * This is deliberately anchored to the primary task position so a nested
 * "get/grab/pick up" cannot overwrite an explicit leading action such as
 * "call" or "email".
 */
function extractPrimaryTaskVerb(text: string): string | null {
  const match = text.match(
    /^(?:\s*(?:i\s+)?(?:need|have|got)\s+to\s+|\s*(?:please\s+)?)(call|ring|phone|email|text|message|contact|check|inspect|fix|repair|send|write|book|pay|finish|review|confirm|ask|tell|meet|visit|order|clean|measure|install|remove|replace|update|change|chase|follow\s*up|pick\s*up|pickup|grab|collect|fetch|get|buy|purchase|drop\s+off|dropoff|deliver|take|leave|remind|schedule)\b/i
  );
  return match?.[1]?.toLowerCase() ?? null;
}

function isPhysicalPickupVerb(verb: string | null): boolean {
  return !!verb && /^(?:pick\s*up|pickup|grab|collect|fetch)$/.test(verb);
}

function isDropOffVerb(verb: string | null): boolean {
  return !!verb && /^(?:drop\s+off|dropoff|deliver|take|leave)$/.test(verb);
}

function extractCompoundSemantic(text: string, primaryVerb: string | null): {
  personText: string | null;
  purposeText: string | null;
  subjectText: string | null;
} {
  if (!primaryVerb) {
    return { personText: null, purposeText: null, subjectText: null };
  }

  const communicationVerb =
    /^(?:call|ring|phone|email|text|message|contact|ask|tell|confirm|check|chase|follow\s*up)$/.test(
      primaryVerb
    );

  if (!communicationVerb) {
    return { personText: null, purposeText: null, subjectText: null };
  }

  const escapedVerb = primaryVerb.replace(/\s+/g, '\\s+');
  const afterVerb = text.match(
    new RegExp('^.*?\\b' + escapedVerb + '\\s+(.+)$', 'i')
  )?.[1]?.trim();

  if (!afterVerb) {
    return { personText: null, purposeText: null, subjectText: null };
  }

  const personMatch = afterVerb.match(
    /^(.+?)(?=\s+(?:to|about|regarding|on|for)\s+)/i
  );

  const personText = (personMatch?.[1] ?? afterVerb)
    .replace(/[.,]+$/, '')
    .trim();

  const remainder = personMatch
    ? afterVerb.slice(personMatch[0].length).trim()
    : null;

  if (!remainder) {
    return {
      personText: personText || null,
      purposeText: null,
      subjectText: null,
    };
  }

  const purpose = remainder
    .replace(/\s+(?:for|at)\s+[A-Z][A-Za-z0-9' .-]{1,80}\s*$/i, '')
    .replace(/[.,]+$/, '')
    .trim();

  const subjectMatch = purpose.match(
    /^(?:to\s+)?(?:get|grab|pick\s*up|collect|fetch|check|inspect|confirm|ask|find\s+out|find)\s+(?:the\s+|a\s+|an\s+)?(.+)$/i
  );

  return {
    personText: personText || null,
    purposeText: purpose || null,
    subjectText: subjectMatch?.[1]?.trim() || purpose || null,
  };
}

function extractDateHint(text: string): string | null {
  const matches = Array.from(
    text.matchAll(
      /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this\s+afternoon|next\s+week)\b/gi
    )
  );

  const last = matches.at(-1)?.[1]?.toLowerCase().replace(/\s+/g, ' ');
  if (!last) return null;

  if (last === 'this afternoon') return 'today';
  if (last === 'next week') return 'next_week';
  return last;
}

function extractQuantityCorrection(text: string): string | null {
  const match = text.match(
    /\b(?:make|change|set)\s+(?:that|it)\s+(?:to\s+)?(\d+)\b/i
  );
  return match?.[1] ?? null;
}

function extractAdditionalQuantity(text: string): string | null {
  const match = text.match(/\b(?:and\s+)?(?:grab|pick\s*up|get|collect|fetch|buy)\s+(\d+)\s+more\b/i);
  return match?.[1] ?? null;
}

function extractObjectReplacement(text: string): string | null {
  const match = text.match(
    /^(?:actually[,:]?\s*)?(?:make|change|set)\s+(?:it|that)\s+(?:to\s+)?(?:the\s+)?(.+?)\s*$/i
  );
  const value = match?.[1]?.trim();
  if (!value || /^\d+$/.test(value)) return null;
  return value.replace(/[.,]+$/, '').trim();
}

function extractCorrectionLocation(text: string): string | null {
  if (/^(?:actually[,:]?\s*)?(?:make|change|set)\s+(?:it|that)\b/i.test(text)) {
    return null;
  }

  const match = text.match(
    /^(?:no|actually|sorry|i\s+meant)[,\s]+(?:the\s+)?(?:location\s+is\s+)?(.+?)\s*$/i
  );
  const value = match?.[1]?.trim().replace(/[.,]+$/, '');
  if (!value || /\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(value)) {
    return null;
  }
  if (/^(?:it|that|this|same|one)$/i.test(value)) return null;
  return value;
}

function replaceLeadingQuantity(text: string, quantity: string): string {
  return /^\d+\b/.test(text.trim())
    ? text.trim().replace(/^\d+\b/, quantity)
    : text.trim();
}

function addToLeadingQuantity(text: string, amount: string): string {
  const match = text.trim().match(/^(\d+)\b/);
  if (!match) return text.trim();

  return text.trim().replace(/^\d+\b/, String(Number(match[1]) + Number(amount)));
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
function stripExplicitDurationPhrase(text: string): string {
  return text
    .replace(
      /\s*(?:,?\s*(?:for|give(?:\s+me)?|take|about|around)\s+)?(?:half\s+an?\s+hour|an?\s+half\s+hour)\b.*$/i,
      ''
    )
    .replace(
      /\s*(?:,?\s*(?:for|give(?:\s+me)?|take|about|around)\s+)?\d+(?:\.\d+)?\s*(?:minutes?|mins?|m|hours?|hrs?|h)\b.*$/i,
      ''
    )
    .replace(/\s*,\s*$/, '')
    .trim();
}

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
    /*
     * Strong final job/place phrase:
     *   "measurements for the downpipes for Angela Place"
     *
     * There can be multiple "for" prepositions. Do not capture everything
     * after the first one. Choose the LAST "for" whose remainder is a
     * place-shaped phrase, because that is the job/location boundary.
     */
    const forMatches = [...text.matchAll(/\bfor\s+/gi)];
    for (let i = forMatches.length - 1; i >= 0; i -= 1) {
      const match = forMatches[i];
      const candidate = text.slice(
        (match.index ?? 0) + match[0].length
      ).trim();

      const cleanedCandidate = candidate
        .replace(
          /\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b.*$/i,
          ''
        )
        .replace(
          /\s+(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.*$/i,
          ''
        )
        .replace(/\s*,\s*$/, '')
        .trim();

      if (
        /^(?:\d+\s+)?[A-Za-z0-9][A-Za-z0-9' .-]{1,80}\b(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|place|pl|crescent|cres|court|ct|close|cl|terrace|tce|way|boulevard|blvd|highway|hwy|parade|parkway|pkwy|square|sq)$/i.test(
          cleanedCandidate
        )
      ) {
        location = cleanedCandidate;
        break;
      }
    }
  }

  if (!location) {
    const re = /\b(?:at|to|from|for)\s+/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const prep = m[0].trim().toLowerCase();
      const before = text.slice(Math.max(0, m.index - 28), m.index).toLowerCase();

      /*
       * "for" can introduce contextual place/job language, but it is much
       * more ambiguous than at/to/from. Only accept it when the preceding
       * clause contains a location-oriented action. The captured value is
       * still only the text after "for", so locationText never contains the
       * preposition itself.
       */
      if (prep === 'for') {
        /*
         * "for" can mean purpose/recipient ("call Jordan for the quote")
         * or a job/location ("for Angela Place"). Prefer the final "for"
         * whose remainder is strongly place-like when nested "for" phrases
         * occur, e.g. "measurements for the downpipes for Angela Place".
         */
        const restAfterFor = text.slice(m.index + m[0].length);
        const placeLike =
          /\b(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|place|pl|crescent|cres|court|ct|close|cl|terrace|tce|way|boulevard|blvd|highway|hwy|parade|parkway|pkwy|square|sq)\b/i.test(
            restAfterFor
          ) ||
          /^\d+\s+[A-Za-z0-9][^,]{2,80}$/i.test(restAfterFor.trim());

        if (
          !placeLike &&
          !/\b(?:check|inspect|fix|repair|visit|go|head|drive|work|working|deliver|drop\s+off|take|leave|pick\s*up|collect|get|fetch)\b/i.test(
            before
          )
        ) {
          continue;
        }

        const nestedPlace = restAfterFor.match(
          /\bfor\s+(.+?)(?=\s*(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\s+(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|$)/i
        );

        if (
          nestedPlace?.[1] &&
          /\b(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|place|pl|crescent|cres|court|ct|close|cl|terrace|tce|way|boulevard|blvd|highway|hwy|parade|parkway|pkwy|square|sq)\b/i.test(
            nestedPlace[1]
          )
        ) {
          location = nestedPlace[1].trim();
          break;
        }
      }
      if (
        prep === 'to' &&
        /\b(?:need|want|have|got|going|try|ought|able|supposed)\s+$/i.test(before)
      ) {
        continue;
      }

      // In "call Jordan to get measurements for Angela Place", this "to"
      // introduces the purpose/action rather than a destination.
      if (
        prep === 'to' &&
        /^(?:get|grab|pick\s*up|pickup|collect|fetch|buy|purchase|check|inspect|measure|review|confirm|ask|tell)\b/i.test(
          text.slice(m.index + m[0].length).trim()
        )
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
        /^(.+?)(?=\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\s+\b(?:noon|midnight)\b|\s+\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\s+\bbecause\b|\s+\bafter\b|\s+\b(?:give(?:\s+me)?|for|about|around|take)\s+(?:half\s+an?\s+hour|an?\s+half\s+hour|\d+(?:\.\d+)?\s*(?:minutes?|mins?|m|hours?|hrs?|h))\b|$)/i
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

  // Duration phrases must never leak into location semantics.
  location = stripExplicitDurationPhrase(location);
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
    primaryVerb: null,
    personText: null,
    purposeText: null,
    subjectText: null,
    constraints: [],
  };

  if (!text) {
    return out;
  }

  const primaryVerb = extractPrimaryTaskVerb(text);
  if (primaryVerb) {
    out.primaryVerb = primaryVerb;
    const compound = extractCompoundSemantic(text, primaryVerb);
    out.personText = compound.personText;
    out.purposeText = compound.purposeText;
    out.subjectText = compound.subjectText;
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
  } else if (
    /\bget\s+(?:the\s+)?(?:measurements?|dimensions?|details?|information|info|quote|price|pricing|approval|confirmation|answer|answers|response|responses|feedback|availability|status|update|updates)\b/i.test(lower)
  ) {
    // "get measurements/details/a quote" is an information-gathering task,
    // not a material pickup. This must outrank the broad pickup meaning of
    // "get" while preserving genuine requests such as "get screws".
    out.action = 'create_task';
  } else if (/\b(?:pick\s*up|pickup|grab|collect|get|fetch)\b/i.test(lower)) {
    out.action = out.action === 'remind' ? 'remind' : 'pickup';
  } else if (
    /\b(?:put|move|chuck)\b.+\b(?:tomorrow|today|monday|tuesday)\b/i.test(lower)
  ) {
    out.action = 'move';
    out.isRefinement = true;
  } else if (/\b(?:i\s+)?(?:need|have|got)\s+to\s+/i.test(lower)) {
    // "I need to call the client tomorrow" is an executable task request.
    out.action = 'create_task';
  } else if (
    /^(?:call|ring|phone|email|text|message|contact|check|inspect|fix|repair|send|write|book|pay|finish|review|confirm|ask|tell|meet|visit|order|clean|measure|install|remove|replace|update|change|chase|follow\s*up)\b/i.test(
      lower
    )
  ) {
    // Bare imperative captures are new requests, not refinements of the
    // previous request. "call John" must not inherit a previously bound task.
    out.action = 'create_task';
  }

  // ---------------------------------------------------------------------------
  // Object
  // ---------------------------------------------------------------------------

  const objectPatterns = [
    /*
     * PRIMARY ACTION FIRST.
     *
     * A compound request such as:
     *   "I need to call Jordan to get the measurements for the downpipes"
     * must bind to CALL. Do not let the nested "get" pattern below steal
     * "the measurements" and turn the whole task into a pickup.
     */
    /^(?:\s*(?:i\s+)?(?:need|have|got)\s+to\s+|\s*(?:please\s+)?)\s*(?:call|ring|phone|email|text|message|contact|check|inspect|fix|repair|send|write|book|pay|finish|review|confirm|ask|tell|meet|visit|order|clean|measure|install|remove|replace|update|change|chase|follow\s*up)\s+(.+?)(?=\s+\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\s+\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|$)/i,

    /\b(?:drop\s+off|dropoff|deliver|take\s+to|leave\s+at)\s+(?:the\s+|a\s+|an\s+)?(.+?)(?=\s+(?:at|to|from)\s+|\s+\b(?:today|tomorrow)\b|\s+\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|$)/i,

    // Movement / physical collection. This intentionally comes AFTER
    // explicit primary-action parsing so nested "get" does not win.
    /\b(?:grab|pick\s*up|pickup|collect|get|fetch|buy|purchase)\s+(?:the\s+|a\s+|an\s+)?(.+?)(?=\s+(?:from|at|to|for)\s+|\s+\b(?:today|tomorrow)\b|\s+\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|$)/i,

    /\b(?:remind\s+me\s+(?:about|to)\s+)(.+)$/i,

    // Generic explicit commitment: preserve the complete task phrase.
    /\b(?:i\s+)?(?:need|have|got)\s+to\s+(.+?)(?=\s+\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\s+\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|$)/i,

    // Bare imperative fallback.
    /^(?:call|ring|phone|email|text|message|contact|check|inspect|fix|repair|send|write|book|pay|finish|review|confirm|ask|tell|meet|visit|order|clean|measure|install|remove|replace|update|change|chase|follow\s*up)\s+(.+?)(?=\s+\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\s+\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|$)/i,

  ];



  for (const pattern of objectPatterns) {
    if (isQuestion || isNegatedCommitment) break;
    const match = text.match(pattern);

    if (!match?.[1]) continue;

    let objectText = match[1].trim().replace(/[.,]+$/, '').trim();

    // Duration is a semantic modifier, not part of the task object.
    objectText = stripExplicitDurationPhrase(objectText);

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
  // Deterministic correction semantics
  // ---------------------------------------------------------------------------

  const quantityCorrection = extractQuantityCorrection(text);
  const additionalQuantity = extractAdditionalQuantity(text);
  const objectReplacement = extractObjectReplacement(text);
  const correctionLocation = extractCorrectionLocation(text);

  if (quantityCorrection) {
    out.constraints = pushConstraint(
      out.constraints ?? [],
      'object',
      `quantity:${quantityCorrection}`,
      'high',
      'correction'
    );
    out.isCorrection = true;
    out.isRefinement = true;
  }

  if (additionalQuantity) {
    out.constraints = pushConstraint(
      out.constraints ?? [],
      'object',
      `additional_quantity:${additionalQuantity}`,
      'high',
      'correction'
    );
    out.isCorrection = true;
    out.isRefinement = true;
  }

  if (objectReplacement) {
    out.constraints = pushConstraint(
      out.constraints ?? [],
      'object',
      `replace:${objectReplacement}`,
      'high',
      'correction'
    );
    out.isCorrection = true;
    out.isRefinement = true;
  }

  if (correctionLocation) {
    out.constraints = pushConstraint(
      out.constraints ?? [],
      'location',
      `replace:${correctionLocation}`,
      'high',
      'correction'
    );
    out.isCorrection = true;
    out.isRefinement = true;
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

  const dateHint = extractDateHint(text);

  if (dateHint) {
    out.dateHint = dateHint;

    out.constraints = pushConstraint(
      out.constraints ?? [],
      'temporal',
      dateHint === 'today' && /\bthis\s+afternoon\b/i.test(lower)
        ? 'afternoon'
        : dateHint,
      dateHint === 'today' || dateHint === 'tomorrow' ? 'high' : 'medium',
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

  // Explicit duration is authoritative for this task. Preserve it as
  // structured evidence so execution can outrank the legacy 15m default.
  const durationHint = extractDurationHint(text);

  if (durationHint != null) {
    out.constraints = pushConstraint(
      out.constraints ?? [],
      'duration',
      `minutes:${durationHint}`,
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

  const quantityCorrection = partial.constraints?.find(
    (c) => c.axis === 'object' && c.value.startsWith('quantity:')
  )?.value.slice('quantity:'.length);

  const additionalQuantity = partial.constraints?.find(
    (c) => c.axis === 'object' && c.value.startsWith('additional_quantity:')
  )?.value.slice('additional_quantity:'.length);

  const objectReplacement = partial.constraints?.find(
    (c) => c.axis === 'object' && c.value.startsWith('replace:')
  )?.value.slice('replace:'.length);

  const locationReplacement = partial.constraints?.find(
    (c) => c.axis === 'location' && c.value.startsWith('replace:')
  )?.value.slice('replace:'.length);

  if (quantityCorrection && base.objectText) {
    base.objectText = replaceLeadingQuantity(base.objectText, quantityCorrection);
  } else if (additionalQuantity && base.objectText) {
    base.objectText = addToLeadingQuantity(base.objectText, additionalQuantity);
  } else if (objectReplacement && base.objectText) {
    base.objectText = objectReplacement;
  } else if (partial.objectText) {
    base.objectText = partial.objectText;
  }

  if (partial.objectText && !base.titleText) {
    base.titleText = partial.objectText;
  }

  if (partial.primaryVerb) {
    base.primaryVerb = partial.primaryVerb;
  }

  if (partial.personText) {
    base.personText = partial.personText;
  }

  if (partial.purposeText) {
    base.purposeText = partial.purposeText;
  }

  if (partial.subjectText) {
    base.subjectText = partial.subjectText;
  }

  if (locationReplacement && base.locationText) {
    base.locationText = locationReplacement;
  } else if (partial.locationText) {
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
  const primaryVerb = req.primaryVerb || extractPrimaryTaskVerb(firstUtterance);

  /*
   * Never infer PICK UP merely because the sentence contains "get", "grab",
   * etc. Those verbs are frequently nested purposes:
   *   "call Jordan to get measurements"
   *   "email Sarah to get the quote"
   *
   * The primary verb is authoritative for task wording.
   */
  const isDropOff =
    req.action === 'create_task'
      ? isDropOffVerb(primaryVerb)
      : false;

  const isPickup =
    req.action === 'pickup' ||
    isPhysicalPickupVerb(primaryVerb);

  const bits: string[] = [];

  if (isDropOff) {
    bits.push(req.objectText ? `Drop off ${req.objectText}` : 'Drop off');
  } else if (isPickup) {
    bits.push(req.objectText ? `Pick up ${req.objectText}` : 'Pick up');
  } else if (primaryVerb && req.objectText) {
    const displayVerb = primaryVerb
      .replace(/\bcall\b/i, 'Call')
      .replace(/\bring\b/i, 'Ring')
      .replace(/\bphone\b/i, 'Phone')
      .replace(/\bemail\b/i, 'Email')
      .replace(/\btext\b/i, 'Text')
      .replace(/\bmessage\b/i, 'Message')
      .replace(/\bcontact\b/i, 'Contact')
      .replace(/\bcheck\b/i, 'Check')
      .replace(/\binspect\b/i, 'Inspect')
      .replace(/\bconfirm\b/i, 'Confirm')
      .replace(/\bask\b/i, 'Ask')
      .replace(/\btell\b/i, 'Tell')
      .replace(/\bmeet\b/i, 'Meet')
      .replace(/\bget\b/i, 'Get')
      .replace(/\bbuy\b/i, 'Buy')
      .replace(/\bpurchase\b/i, 'Purchase')
      .replace(/\bmeasure\b/i, 'Measure')
      .replace(/\bfix\b/i, 'Fix')
      .replace(/\brepair\b/i, 'Repair')
      .replace(/\bcheck\b/i, 'Check')
      .replace(/\bfollow\\s*up\b/i, 'Follow up');

    bits.push(`${displayVerb} ${req.objectText}`);
  } else if (req.action === 'remind' && req.objectText) {
    bits.push(`Remind me ${req.objectText}`);
  } else if (req.objectText) {
    bits.push(req.objectText);
  } else if (firstUtterance) {
    bits.push(firstUtterance);
  } else {
    bits.push('Task');
  }

  if (req.locationText && !isDropOff && !isPickup) {
    const object = (req.objectText ?? '').trim();
    const location = req.locationText.trim();
    const escaped = location.replace(/[.*+?^$()|[\\]{}]/g, '\\$&');

    const alreadyInObject =
      new RegExp(
        '(?:\\b(?:at|to|from|for|about)\\s+)' + escaped + '\\s*$',
        'i'
      ).test(object) ||
      object.toLowerCase() === location.toLowerCase();

    if (!alreadyInObject) {
      bits.push(`at ${location}`);
    }
  }

  return bits.join(' ').replace(/\s+/g, ' ').trim();
}


function extractDateHint(text: string): string | null {
  const matches = Array.from(
    text.matchAll(
      /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this\s+afternoon|next\s+week)\b/gi
    )
  );

  const last = matches.at(-1)?.[1]?.toLowerCase().replace(/\s+/g, ' ');
  if (!last) return null;

  if (last === 'this afternoon') return 'today';
  if (last === 'next week') return 'next_week';
  return last;
}

function extractQuantityCorrection(text: string): string | null {
  const match = text.match(
    /\b(?:make|change|set)\s+(?:that|it)\s+(?:to\s+)?(\d+)\b/i
  );
  return match?.[1] ?? null;
}

function extractAdditionalQuantity(text: string): string | null {
  const match = text.match(/\b(?:and\s+)?(?:grab|pick\s*up|get|collect|fetch|buy)\s+(\d+)\s+more\b/i);
  return match?.[1] ?? null;
}

function extractObjectReplacement(text: string): string | null {
  const match = text.match(
    /^(?:actually[,:]?\s*)?(?:make|change|set)\s+(?:it|that)\s+(?:to\s+)?(?:the\s+)?(.+?)\s*$/i
  );
  const value = match?.[1]?.trim();
  if (!value || /^\d+$/.test(value)) return null;
  return value.replace(/[.,]+$/, '').trim();
}

function extractCorrectionLocation(text: string): string | null {
  if (/^(?:actually[,:]?\s*)?(?:make|change|set)\s+(?:it|that)\b/i.test(text)) {
    return null;
  }

  const match = text.match(
    /^(?:no|actually|sorry|i\s+meant)[,\s]+(?:the\s+)?(?:location\s+is\s+)?(.+?)\s*$/i
  );
  const value = match?.[1]?.trim().replace(/[.,]+$/, '');
  if (!value || /\b(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)|today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(value)) {
    return null;
  }
  if (/^(?:it|that|this|same|one)$/i.test(value)) return null;
  return value;
}

function replaceLeadingQuantity(text: string, quantity: string): string {
  return /^\d+\b/.test(text.trim())
    ? text.trim().replace(/^\d+\b/, quantity)
    : text.trim();
}

function addToLeadingQuantity(text: string, amount: string): string {
  const match = text.trim().match(/^(\d+)\b/);
  if (!match) return text.trim();

  return text.trim().replace(/^\d+\b/, String(Number(match[1]) + Number(amount)));
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
function stripExplicitDurationPhrase(text: string): string {
  return text
    .replace(
      /\s*(?:,?\s*(?:for|give(?:\s+me)?|take|about|around)\s+)?(?:half\s+an?\s+hour|an?\s+half\s+hour)\b.*$/i,
      ''
    )
    .replace(
      /\s*(?:,?\s*(?:for|give(?:\s+me)?|take|about|around)\s+)?\d+(?:\.\d+)?\s*(?:minutes?|mins?|m|hours?|hrs?|h)\b.*$/i,
      ''
    )
    .replace(/\s*,\s*$/, '')
    .trim();
}

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
    /*
     * Strong final job/place phrase:
     *   "measurements for the downpipes for Angela Place"
     *
     * There can be multiple "for" prepositions. Do not capture everything
     * after the first one. Choose the LAST "for" whose remainder is a
     * place-shaped phrase, because that is the job/location boundary.
     */
    const forMatches = [...text.matchAll(/\bfor\s+/gi)];
    for (let i = forMatches.length - 1; i >= 0; i -= 1) {
      const match = forMatches[i];
      const candidate = text.slice(
        (match.index ?? 0) + match[0].length
      ).trim();

      const cleanedCandidate = candidate
        .replace(
          /\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b.*$/i,
          ''
        )
        .replace(
          /\s+(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b.*$/i,
          ''
        )
        .replace(/\s*,\s*$/, '')
        .trim();

      if (
        /^(?:\d+\s+)?[A-Za-z0-9][A-Za-z0-9' .-]{1,80}\b(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|place|pl|crescent|cres|court|ct|close|cl|terrace|tce|way|boulevard|blvd|highway|hwy|parade|parkway|pkwy|square|sq)$/i.test(
          cleanedCandidate
        )
      ) {
        location = cleanedCandidate;
        break;
      }
    }
  }

  if (!location) {
    const re = /\b(?:at|to|from|for)\s+/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const prep = m[0].trim().toLowerCase();
      const before = text.slice(Math.max(0, m.index - 28), m.index).toLowerCase();

      /*
       * "for" can introduce contextual place/job language, but it is much
       * more ambiguous than at/to/from. Only accept it when the preceding
       * clause contains a location-oriented action. The captured value is
       * still only the text after "for", so locationText never contains the
       * preposition itself.
       */
      if (prep === 'for') {
        /*
         * "for" can mean purpose/recipient ("call Jordan for the quote")
         * or a job/location ("for Angela Place"). Prefer the final "for"
         * whose remainder is strongly place-like when nested "for" phrases
         * occur, e.g. "measurements for the downpipes for Angela Place".
         */
        const restAfterFor = text.slice(m.index + m[0].length);
        const placeLike =
          /\b(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|place|pl|crescent|cres|court|ct|close|cl|terrace|tce|way|boulevard|blvd|highway|hwy|parade|parkway|pkwy|square|sq)\b/i.test(
            restAfterFor
          ) ||
          /^\d+\s+[A-Za-z0-9][^,]{2,80}$/i.test(restAfterFor.trim());

        if (
          !placeLike &&
          !/\b(?:check|inspect|fix|repair|visit|go|head|drive|work|working|deliver|drop\s+off|take|leave|pick\s*up|collect|get|fetch)\b/i.test(
            before
          )
        ) {
          continue;
        }

        const nestedPlace = restAfterFor.match(
          /\bfor\s+(.+?)(?=\s*(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\s+(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|$)/i
        );

        if (
          nestedPlace?.[1] &&
          /\b(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|place|pl|crescent|cres|court|ct|close|cl|terrace|tce|way|boulevard|blvd|highway|hwy|parade|parkway|pkwy|square|sq)\b/i.test(
            nestedPlace[1]
          )
        ) {
          location = nestedPlace[1].trim();
          break;
        }
      }
      if (
        prep === 'to' &&
        /\b(?:need|want|have|got|going|try|ought|able|supposed)\s+$/i.test(before)
      ) {
        continue;
      }

      // In "call Jordan to get measurements for Angela Place", this "to"
      // introduces the purpose/action rather than a destination.
      if (
        prep === 'to' &&
        /^(?:get|grab|pick\s*up|pickup|collect|fetch|buy|purchase|check|inspect|measure|review|confirm|ask|tell)\b/i.test(
          text.slice(m.index + m[0].length).trim()
        )
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
        /^(.+?)(?=\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\s+\b(?:noon|midnight)\b|\s+\b(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|\s+\bbecause\b|\s+\bafter\b|\s+\b(?:give(?:\s+me)?|for|about|around|take)\s+(?:half\s+an?\s+hour|an?\s+half\s+hour|\d+(?:\.\d+)?\s*(?:minutes?|mins?|m|hours?|hrs?|h))\b|$)/i
      );

      if (purposeBoundary?.[1]) {
        location = purposeBoundary[1].trim();
        break;
      }

      if (!tail?.[1]) continue;
      location = tail[1].trim();
      break;
    }