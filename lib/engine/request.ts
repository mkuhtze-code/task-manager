/**
 * Structured Request + constraint refinement.
 * Successive utterances update the same request when continuity holds.
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
  const filtered = list.filter((c) => !(c.axis === axis && c.value === value));
  return [...filtered, { axis, value, confidence, source }];
}

/**
 * Parse a natural utterance into request fields (deterministic heuristics).
 * Designed for the pickup / remind vertical slice; extends by constraints.
 */
export function interpretRequestUtterance(raw: string): Partial<EngineRequest> & {
  isRefinement: boolean;
  isCorrection: boolean;
} {
  const text = raw.replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();
  const out: Partial<EngineRequest> & { isRefinement: boolean; isCorrection: boolean } = {
    isRefinement: false,
    isCorrection: false,
    constraints: [],
  };

  // Corrections / refinements — structural, not phrase cookbook
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

  // Pronoun / anaphora toward prior request
  if (
    /\b(?:\bit\b|\bthat\b|\bthis\b|\bthose\b|\bthese\b)\b/i.test(lower) &&
    !/\b(?:pick\s*up|remind\s+me|start|create|make\s+a)\b/i.test(lower)
  ) {
    out.isRefinement = true;
  }

  // Action class
  if (/\b(?:remind\s+me|don(?:'t|’t)\s+let\s+me\s+forget|keep\s+that\s+in\s+mind)\b/i.test(lower)) {
    out.action = 'remind';
  } else if (/\b(?:pick\s*up|grab|collect|get|fetch)\b/i.test(lower)) {
    out.action = out.action === 'remind' ? 'remind' : 'pickup';
  } else if (/\b(?:put|move|chuck)\b.+\b(?:tomorrow|today|monday|tuesday)\b/i.test(lower)) {
    out.action = 'move';
    out.isRefinement = true;
  }

  // Object: "pick up the flashing" / "grab the flashing"
  const obj =
    text.match(
      /\b(?:pick\s*up|grab|collect|get|fetch|remind\s+me\s+to\s+(?:pick\s*up|grab|get)?)\s+(?:the\s+|a\s+|an\s+)?(.+?)(?:\s+from\s+|\s+at\s+|\s+for\s+|$)/i
    ) || text.match(/\b(?:remind\s+me\s+(?:about|to)\s+)(.+)$/i);
  if (obj?.[1]) {
    let o = obj[1].replace(/\s+from\s+.*$/i, '').trim();
    o = o.replace(/\s+today\b.*$/i, '').trim();
    if (o.length > 1 && o.length < 80) out.objectText = o;
  }

  // Location: from / at
  const loc = text.match(/\b(?:from|at)\s+([A-Z][\w\s&'.-]{1,60})(?:\s|$|\.|,)/);
  const locLoose = text.match(/\b(?:from|at)\s+(.+?)(?:\s+today|\s+tomorrow|\s+because|\s+after|$)/i);
  if (loc?.[1]) out.locationText = loc[1].trim();
  else if (locLoose?.[1] && !/^(?:the|a|an)\s/i.test(locLoose[1])) {
    out.locationText = locLoose[1].trim().replace(/[.,]$/, '');
  }

  // Job link: "on the Henderson job" / "for Henderson"
  const job =
    text.match(/\b(?:on|for)\s+(?:the\s+)?([A-Z][\w\s-]{1,40}?)\s+job\b/i) ||
    text.match(/\busing\s+it\s+on\s+(?:the\s+)?([A-Z][\w\s-]{1,40})\b/i);
  if (job?.[1]) out.relatedJobText = job[1].trim();

  // Meeting: "after the meeting"
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

  // Temporal
  if (/\btoday\b/i.test(lower)) {
    out.dateHint = 'today';
    out.constraints = pushConstraint(out.constraints ?? [], 'temporal', 'today', 'high', 'utterance');
  } else if (/\btomorrow\b/i.test(lower)) {
    out.dateHint = 'tomorrow';
    out.constraints = pushConstraint(out.constraints ?? [], 'temporal', 'tomorrow', 'high', 'utterance');
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

  // Urgency / consequence
  if (/\b(?:need\s+it\s+today|don(?:'t|’t)\s+let\s+me\s+forget|make\s+sure)\b/i.test(lower)) {
    out.urgency = 'elevated';
    out.constraints = pushConstraint(out.constraints ?? [], 'urgency', 'elevated', 'medium', 'utterance');
  }
  if (/\bnot\s+urgent\b/i.test(lower)) {
    out.urgency = 'none';
    out.flexibility = 'high';
  }
  if (/\bbecause\b/i.test(lower)) {
    const cons = text.match(/\bbecause\s+(.+)$/i);
    if (cons?.[1]) {
      out.consequence = cons[1].trim();
      out.constraints = pushConstraint(
        out.constraints ?? [],
        'consequence',
        cons[1].trim().slice(0, 120),
        'medium',
        'utterance'
      );
    }
  }

  // Route opportunity language
  if (/\b(?:heading\s+through|going\s+past|already\s+(?:going|heading)|on\s+the\s+way)\b/i.test(lower)) {
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
 * Merge utterance interpretation into existing request or start a new one.
 */
export function applyUtteranceToRequest(
  existing: EngineRequest | null,
  raw: string,
  mem: WorkingMemorySnapshot
): EngineRequest {
  const partial = interpretRequestUtterance(raw);
  const partialAction = partial.action ?? 'unknown';

  // Continue the open request when the user is clearly refining it, or when
  // working memory still points at it and this isn't a brand-new remind/pickup.
  const hasTaskBind = !!existing?.constraints?.some(
    (c) => c.axis === 'dependency' && c.value.startsWith('task:')
  );
  const looksLikeNewCapture =
    (partialAction === 'remind' || partialAction === 'pickup' || partialAction === 'create_task') &&
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
      ? { ...existing, constraints: [...existing.constraints] }
      : emptyRequest(partialAction);

  if (!continueActive) {
    base.action = partial.action ?? 'unknown';
  } else if (partial.action && partial.action !== 'unknown') {
    // Refinement may keep remind while adding pickup semantics
    if (base.action === 'unknown') base.action = partial.action;
  }

  if (partial.objectText) base.objectText = partial.objectText;
  if (partial.locationText) base.locationText = partial.locationText;
  if (partial.relatedJobText) base.relatedJobText = partial.relatedJobText;
  if (partial.relatedMeetingText) base.relatedMeetingText = partial.relatedMeetingText;
  if (partial.dateHint) base.dateHint = partial.dateHint;
  if (partial.timeHint) base.timeHint = partial.timeHint;
  if (partial.urgency && partial.urgency !== 'none') base.urgency = partial.urgency;
  if (partial.urgency === 'none' && partial.isRefinement) base.urgency = 'none';
  if (partial.flexibility) base.flexibility = partial.flexibility;
  if (partial.consequence) base.consequence = partial.consequence;

  for (const c of partial.constraints ?? []) {
    base.constraints = pushConstraint(
      base.constraints,
      c.axis,
      c.value,
      c.confidence,
      c.source
    );
  }

  base.rawUtterances = [...base.rawUtterances, raw.trim()].slice(-12);
  base.updatedAt = new Date().toISOString();

  // Confidence grows with structure
  let score = 0;
  if (base.objectText) score += 1;
  if (base.locationText) score += 1;
  if (base.dateHint) score += 1;
  if (base.relatedJobText) score += 1;
  base.confidence = score >= 3 ? 'high' : score >= 1 ? 'medium' : 'low';

  if (base.action === 'remind' || base.action === 'pickup') {
    base.commitment = base.urgency === 'high' ? 'soft' : 'weak';
  }

  return base;
}

export function requestTaskText(req: EngineRequest): string {
  const bits: string[] = [];
  if (req.action === 'remind' || req.action === 'pickup') {
    bits.push(req.objectText ? `Pick up ${req.objectText}` : 'Pick up');
  } else if (req.objectText) {
    bits.push(req.objectText);
  } else if (req.rawUtterances[0]) {
    bits.push(req.rawUtterances[0]);
  } else {
    bits.push('Task');
  }
  if (req.locationText) bits.push(`from ${req.locationText}`);
  return bits.join(' ').replace(/\s+/g, ' ').trim();
}
