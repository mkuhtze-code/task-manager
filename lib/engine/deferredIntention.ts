/**
 * Deferred / contextual intention — smallest safe model.
 * LOCATION / RETURN_TO_ACTIVITY are representable; execution is NOT claimed.
 * Future: context event → evaluator → Personal Operating Engine → notify/act.
 */

export type DeferredTriggerType =
  | 'TIME'
  | 'LOCATION'
  | 'EVENT'
  | 'AFTER_MEETING'
  | 'AFTER_TASK'
  | 'RETURN_TO_ACTIVITY'
  | 'CONDITION';

export type DeferredIntentionStatus =
  | 'pending'
  | 'armed'
  | 'triggered'
  | 'completed'
  | 'cancelled'
  | 'expired';

export type DeferredTrigger = {
  type: DeferredTriggerType;
  /** Human / structured label e.g. "office", "return to yard" */
  label: string;
  /** Optional structured payload — never treated as live GPS */
  payload?: {
    placeHint?: string;
    activityHint?: string;
    timeIso?: string;
    eventId?: string;
    taskId?: string;
    conditionText?: string;
  };
};

export type DeferredIntention = {
  id: string;
  userId: string;
  /** Original action text preserved for later execution */
  actionText: string;
  /** Structured request fragment when available */
  requestSummary: string | null;
  trigger: DeferredTrigger;
  status: DeferredIntentionStatus;
  createdAt: string;
  expiresAt: string | null;
  authority: 'observe' | 'suggest' | 'ask' | 'act';
  evidence: Array<{ kind: string; detail: string }>;
  /** Engine request id if multi-turn produced this */
  requestId: string | null;
  /** Explicit: location trigger is NOT operational in Pass 1 */
  executionReady: false;
};

function id(): string {
  return `def_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

const DEFER_RE =
  /\b(?:remind\s+me\s+)?(?:when\s+i\s+(?:get\s+)?back\s+(?:to\s+)?(?:the\s+)?(\w[\w\s-]{0,40})|when\s+i(?:'m|\s+am)\s+(?:back\s+)?(?:at\s+)?(?:the\s+)?(\w[\w\s-]{0,40})|once\s+i(?:'m|\s+am)\s+back)\b/i;

const ACTION_AFTER_RE =
  /\b(?:to\s+|and\s+)?(.+)$/i;

/**
 * Detect contextual deferred intention from utterance.
 * Returns null when this is an ordinary time reminder / task.
 */
export function detectDeferredIntention(
  utterance: string,
  opts: { userId?: string | null; requestId?: string | null } = {}
): DeferredIntention | null {
  const text = utterance.replace(/\s+/g, ' ').trim();
  const lower = text.toLowerCase();

  // Must look like a contextual trigger, not a plain "remind me tomorrow"
  const isContextual =
    /\bwhen\s+i\s+(?:get\s+)?back\b/i.test(lower) ||
    /\bonce\s+i(?:'m|\s+am)\s+back\b/i.test(lower) ||
    /\bwhen\s+i(?:'m|\s+am)\s+(?:back\s+)?at\b/i.test(lower) ||
    /\bafter\s+i\s+(?:get\s+)?back\b/i.test(lower);

  if (!isContextual) return null;

  const m = text.match(DEFER_RE);
  const place =
    (m?.[1] || m?.[2] || 'office')
      .trim()
      .replace(/\s+to\s+.*$/i, '')
      .slice(0, 60) || 'office';

  // Action: prefer "to <verb>..." after the trigger clause
  let actionText = text;
  const toIdx = lower.search(/\bto\s+(?:send|call|email|pay|finish|do|complete|write|drop|pick)/i);
  if (toIdx >= 0) {
    actionText = text.slice(toIdx).replace(/^to\s+/i, '').trim();
  } else {
    const remind = text.match(/\bremind\s+me\s+(?:to\s+)?(.+)$/i);
    if (remind?.[1]) {
      actionText = remind[1]
        .replace(/\bwhen\s+i\s+(?:get\s+)?back.*$/i, '')
        .trim();
    }
  }
  if (!actionText || actionText.length < 3) {
    actionText = text;
  }

  const triggerType: DeferredTriggerType =
    /office|yard|shop|depot|base|home|warehouse/i.test(place)
      ? 'RETURN_TO_ACTIVITY'
      : 'LOCATION';

  const now = new Date().toISOString();
  return {
    id: id(),
    userId: opts.userId ?? 'anon',
    actionText,
    requestSummary: `Deferred: ${actionText} @ return to ${place}`,
    trigger: {
      type: triggerType,
      label: place,
      payload: { placeHint: place, activityHint: place },
    },
    status: 'pending',
    createdAt: now,
    expiresAt: null,
    authority: 'suggest',
    evidence: [
      { kind: 'utterance', detail: text.slice(0, 200) },
      { kind: 'trigger_parse', detail: `${triggerType}:${place}` },
      {
        kind: 'execution_note',
        detail: 'Location trigger not operational in Integration Pass 1',
      },
    ],
    requestId: opts.requestId ?? null,
    executionReady: false,
  };
}

const LOCAL_KEY = 'dokkit.engine.deferredIntentions.v1';

export function loadDeferredIntentionsLocal(userId?: string | null): DeferredIntention[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const key = userId ? `${LOCAL_KEY}:${userId}` : LOCAL_KEY;
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as DeferredIntention[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDeferredIntentionLocal(
  intention: DeferredIntention,
  userId?: string | null
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const uid = userId ?? intention.userId;
    const key = uid ? `${LOCAL_KEY}:${uid}` : LOCAL_KEY;
    const prev = loadDeferredIntentionsLocal(uid);
    const next = [intention, ...prev.filter((x) => x.id !== intention.id)].slice(0, 50);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* quota */
  }
}
