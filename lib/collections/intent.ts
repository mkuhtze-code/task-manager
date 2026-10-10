/**
 * Detect list (collection) intents from normalised text.
 * Deterministic — no LLM.
 *
 * Goal: natural speech should work without rigid keyword recipes.
 * "Start list", "I need a packing list", "put milk on it", "what's on my list"
 * should all resolve. Ordinary tasks ("Call John tomorrow") must still fall through.
 */

import { itemsFromText, looksLikeImplicitItem, splitItemEnumeration } from './items';
import {
  normalizeTitle,
  titleFromSpoken,
  inferCollectionType,
  collapseWhitespace,
  normalizeKey,
} from './normalize';
import type {
  CollectionIntent,
  CollectionDetectContext,
  CollectionTarget,
  Confidence,
} from './types';
import { resolveContextLink } from './contextLink';
import { tryStructuralMultiItemCapture } from './structuralCapture';

const CREATE_VERBS =
  /^(?:start|create|make|new|open|begin|setup|set\s*up|kick\s*off|fire\s*up)\b/i;

const NEED_LIST_RE =
  /^(?:i\s+)?(?:need|want|gotta|got\s+to|have\s+to)\s+(?:a\s+|an\s+|my\s+|the\s+)?(.+?)\s+lists?\s*$/i;

const NEED_LIST_BARE_RE =
  /^(?:i\s+)?(?:need|want)\s+(?:a\s+|an\s+|my\s+|the\s+)?lists?\s*$/i;

const CAN_YOU_LIST_RE =
  /^(?:can\s+you\s+|could\s+you\s+|please\s+)?(?:start|create|make|open|begin|set\s*up)\s+(?:me\s+|us\s+)?(?:a\s+|an\s+|my\s+|the\s+)?(?:(.+?)\s+)?lists?\b/i;

/** "start a grocery list", "start list", "make packing list", "new list" */
const CREATE_CORE_RE =
  /^(?:start|create|make|new|open|begin|setup|set\s*up)\s+(?:me\s+|us\s+)?(?:a\s+|an\s+|my\s+|the\s+)?(?:(.+?)\s+)?lists?\b(?:\s+for\s+(.+?))?(?:\s*[:.—–\-]\s*(.+))?$/i;

/** "grocery list: milk, bread" / "packing list milk eggs" */
const NAMED_LIST_INLINE_RE =
  /^(.+?)\s+lists?\s*(?:[:.—–\-]\s*|\s+)(.+)$/i;

/** Bare seed without the word list: "grocery milk, bread" */
const BARE_SEED_RE =
  /^((?:grocery|groceries|shopping|snag|packing|materials|questions|ideas|observations|todo|errands|checklist))\s+(.+)$/i;

const APPEND_TO_RE =
  /^(?:add|put|include|stick|throw)\s+(.+?)\s+(?:to|on|onto)\s+(?:my\s+|the\s+|our\s+)?(.+?)(?:\s+lists?)?$/i;

/** "put milk on the list" / "add milk to the list" / "put milk on it" */
const APPEND_THE_LIST_RE =
  /^(?:add|put|include|stick|throw)\s+(.+?)\s+(?:to|on|onto)\s+(?:my\s+|the\s+|our\s+|that\s+|this\s+)?(?:lists?|it)$/i;

const ADD_BARE_RE = /^(?:add|also|plus|and)\s+(.+)$/i;

/**
 * Done-state predicates — structural class, not a phrase cookbook.
 * "sorted", "dealt with", "handled" sit with "done" / "finished".
 */
const DONE_PREDICATE =
  '(?:done|complete|completed|finished|sorted(?:\\s+out)?|dealt\\s+with|handled|taken\\s+care\\s+of|covered|tick(?:ed)?\\s*off|checked\\s*off)';

/** "fixings is sorted", "eggs are done", "milk sorted" */
const ITEM_DONE_RE = new RegExp(
  `^(.+?)\\s+(?:(?:is|are|was|were)\\s+)?${DONE_PREDICATE}$`,
  'i'
);

/** "I've sorted the fixings", "sorted fixings", "got the milk" */
const VERB_DONE_RE = new RegExp(
  `^(?:(?:i(?:'ve| have)?\\s+)?(?:got|have|bought|picked\\s*up|sorted(?:\\s+out)?|dealt\\s+with|handled)|(?:mark|set|complete|check\\s*off|tick\\s*off))\\s+(?:the\\s+)?(.+?)(?:\\s+(?:as\\s+)?${DONE_PREDICATE})?$`,
  'i'
);

const COMPLETE_CMD_RE = new RegExp(
  `^(?:complete|check\\s*off|tick\\s*off|mark)\\s+(.+?)(?:\\s+(?:as\\s+)?${DONE_PREDICATE})?$`,
  'i'
);

/** Quick gate: utterance carries a done-state signal. */
const HAS_DONE_SIGNAL = new RegExp(
  `\\b(?:is|are|was|were)\\s+${DONE_PREDICATE}\\b|\\b${DONE_PREDICATE}\\b|\\b(?:got|bought|picked\\s*up)\\b`,
  'i'
);

const REMOVE_RE =
  /^(?:remove|delete|cross\s*off|take(?!\s+.+?\s+to\b))\s+(.+?)(?:\s+off(?:\s+the\s+list)?|\s+from\s+(?:my\s+|the\s+)?(.+?)(?:\s+lists?)?)?$/i;

const CLOSE_RE =
  /^(?:that(?:'s| is)\s+(?:it|everything|all)(?:\s+for\s+(.+))?|close\s+(?:my\s+|the\s+)?(.+?)(?:\s+lists?)?|i(?:'m| am)\s+done\s+with\s+(?:that\s+list|(?:my\s+|the\s+)?(.+?)))$/i;

const REOPEN_RE =
  /^(?:open\s+(?:my\s+|the\s+)?(.+?)(?:\s+lists?)?|i\s+need\s+to\s+add\s+(?:something\s+)?to\s+(?:my\s+|the\s+)?(.+?)(?:\s+lists?)?)$/i;

const CHANGE_RE =
  /^(?:change|replace)\s+(.+?)\s+to\s+(.+)$/i;

const QUERY_RE =
  /^(?:what(?:'s| is)\s+on\s+(?:my\s+|the\s+|our\s+)?(.+?)(?:\s+lists?)?|show\s+(?:me\s+)?(?:my\s+|the\s+|our\s+)?(.+?)(?:\s+lists?)?|open\s+(?:my\s+|the\s+)?(.+?)\s+lists?)$/i;

/** "what's on the list" / "show the list" / "show my list" with no name */
const QUERY_BARE_LIST_RE =
  /^(?:what(?:'s| is)\s+on\s+(?:my\s+|the\s+|our\s+|that\s+|this\s+)?lists?|show\s+(?:me\s+)?(?:my\s+|the\s+|our\s+|that\s+|this\s+)?lists?|open\s+(?:my\s+|the\s+)?lists?)$/i;

const VERB_RESIDUE = new Set([
  'start',
  'create',
  'make',
  'new',
  'open',
  'begin',
  'setup',
  'set',
  'up',
  'kick',
  'off',
  'fire',
  'need',
  'want',
  'gotta',
  'please',
  'can',
  'you',
  'could',
  'me',
  'us',
  'i',
  'a',
  'an',
  'the',
  'my',
  'our',
  'for',
  'to',
  'of',
  'list',
  'lists',
]);

function high(reasons: string[]): { confidence: Confidence; reasons: string[] } {
  return { confidence: 'high', reasons };
}
function med(reasons: string[]): { confidence: Confidence; reasons: string[] } {
  return { confidence: 'medium', reasons };
}

function targetTitle(title: string): CollectionTarget {
  return { kind: 'title', title: collapseWhitespace(title) };
}

function targetActive(): CollectionTarget {
  return { kind: 'active' };
}

/**
 * Turn a spoken name fragment into a clean display title.
 * Never returns a create-verb residue like "Start".
 */
function cleanListTitle(spoken: string | undefined | null, fallback = 'List'): string {
  const raw = collapseWhitespace(spoken || '');
  if (!raw) return fallback;
  let title = titleFromSpoken(raw);
  // Strip residual verbs if normalize left them
  const tokens = title.split(/\s+/).filter((t) => t && !VERB_RESIDUE.has(t.toLowerCase()));
  title = tokens.join(' ').trim();
  if (!title) return fallback;
  // Re-capitalise
  return title
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function withContextLink(
  base: Extract<CollectionIntent, { type: 'create_collection' }>,
  ctx?: CollectionDetectContext
): CollectionIntent {
  const link = resolveContextLink(base.contextHint, ctx);
  if (!link) return base;
  return {
    ...base,
    contextType: link.contextType,
    contextId: link.contextId,
    reasons: [...base.reasons, `context_${link.contextType}`],
  };
}

function looksLikeStandaloneTask(text: string): boolean {
  return (
    /\b(need to|have to|should|must|schedule|call|ring|phone|email|text|message|contact|meet|finish|write|send|buy|fix|repair|inspect|check|book|pay|pick up|grab|collect|get|fetch|deliver|drop off|take|go|head|drive|travel|visit|order|clean|measure|install|remove|replace|update|change|move|reschedule|postpone|review|confirm|ask|tell|chase|follow up)\b/i.test(
      text
    ) && !/\blists?\b/i.test(text)
  );
}

function isListyUtterance(raw: string): boolean {
  if (/\blists?\b/i.test(raw)) return true;
  if (/\b(checklist|todo|to-do|snag|grocery|groceries|packing|materials)\b/i.test(raw))
    return true;
  return false;
}

/**
 * Primary entry: detect a list intent from text.
 * Returns null when the utterance should fall through to normal task create.
 */
export function detectCollectionIntent(
  text: string,
  ctx?: CollectionDetectContext
): CollectionIntent | null {
  const raw = collapseWhitespace(text);
  if (!raw) return null;

  // Temporal corrections belong to the task engine, not the list parser.
  // Without this precedence guard, a short correction such as
  // "Actually, make that Friday" can be split into list title/items before
  // the task-continuity engine gets a chance to update the existing task.
  if (
    /^(?:actually[,:]?\s*)?(?:make|change|set|move|reschedule)\s+(?:that|it|this)\s+(?:to\s+)?(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[.!?]*$/i.test(raw) ||
    /^(?:actually[,:]?\s*)?(?:change|set|update)\s+(?:the\s+)?date\s+(?:to\s+)?(?:today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b[.!?]*$/i.test(raw)
  ) {
    return null;
  }

  // --- close ---
  const close = raw.match(CLOSE_RE);
  if (close) {
    const name = close[1] || close[2] || close[3] || '';
    return {
      type: 'close_collection',
      target: name.trim() ? targetTitle(name) : targetActive(),
      ...high(['close_phrase']),
    };
  }

  // --- change item ---
  const change = raw.match(CHANGE_RE);
  if (change && (ctx?.activeCollectionId || isListyUtterance(raw))) {
    return {
      type: 'update_collection_item',
      target: targetActive(),
      itemReference: collapseWhitespace(change[1]),
      replacement: collapseWhitespace(change[2]),
      ...med(['change_item']),
    };
  }

  // --- remove ---
  const remove = raw.match(REMOVE_RE);
  if (remove) {
    const refs = splitItemEnumeration(remove[1]);
    const listName = remove[2];
    return {
      type: 'remove_collection_items',
      target: listName?.trim() ? targetTitle(listName) : targetActive(),
      itemReferences: refs,
      ...high(['remove_phrase']),
    };
  }

  // --- complete: done-state predicates (sorted / done / finished / dealt with…) ---
  // Runs before append/implicit so "fixings is sorted" never becomes a new item.
  if (HAS_DONE_SIGNAL.test(raw) && !/\b(need to|start|create|make a list)\b/i.test(raw)) {
    const completeCmd = raw.match(COMPLETE_CMD_RE);
    const itemDone = raw.match(ITEM_DONE_RE);
    const verbDone = raw.match(VERB_DONE_RE);

    let body = '';
    let reason = 'complete_phrase';
    if (completeCmd?.[1]) {
      body = completeCmd[1];
      reason = 'complete_command';
    } else if (itemDone?.[1]) {
      body = itemDone[1];
      reason = 'item_done_predicate';
    } else if (verbDone?.[1]) {
      body = verbDone[1];
      reason = 'verb_done_predicate';
    }

    if (body) {
      // Optional "X for Anchor" → item X, target list named Anchor when present
      let target = targetActive();
      const forSplit = body.match(/^(.+?)\s+for\s+(.+)$/i);
      let itemBody = body;
      if (forSplit) {
        itemBody = forSplit[1];
        const anchor = collapseWhitespace(forSplit[2]);
        if (anchor) target = targetTitle(anchor);
      }
      const refs = splitItemEnumeration(itemBody)
        .map((r) => r.replace(/^(?:the|a|an)\s+/i, '').trim())
        .filter(Boolean);
      if (refs.length > 0 && refs.join(' ').length < 120) {
        return {
          type: 'complete_collection_items',
          target,
          itemReferences: refs,
          ...(reason === 'complete_command' ? high([reason]) : med([reason])),
        };
      }
    }
  }

  // --- query bare: "what's on the list" / "show my list" ---
  if (QUERY_BARE_LIST_RE.test(raw)) {
    return {
      type: 'query_collection',
      target: targetActive(),
      ...high(['query_bare_list']),
    };
  }

  // --- query named: "show my packing list" / "what's on grocery" ---
  const query = raw.match(QUERY_RE);
  if (query) {
    const name = query[1] || query[2] || query[3] || '';
    const cleaned = collapseWhitespace(name.replace(/\blists?\b/i, ''));
    return {
      type: 'query_collection',
      target: cleaned ? targetTitle(cleaned) : targetActive(),
      ...high(['query_phrase']),
    };
  }

  // --- reopen ---
  const reopen = raw.match(REOPEN_RE);
  if (reopen) {
    const name = reopen[1] || reopen[2] || '';
    if (name.trim()) {
      return {
        type: 'reopen_collection',
        target: targetTitle(name),
        ...high(['reopen_phrase']),
      };
    }
  }

  // --- append to named list ---
  const appendTo = raw.match(APPEND_TO_RE);
  if (appendTo) {
    const items = itemsFromText(appendTo[1]);
    const targetName = collapseWhitespace(appendTo[2].replace(/\blists?\b/i, ''));
    // "add milk to my list" → active; "add milk to packing" → packing
    if (!targetName || /^(?:it|that|this)$/i.test(targetName)) {
      return {
        type: 'append_collection',
        target: targetActive(),
        items,
        ...high(['append_to_the_list']),
      };
    }
    return {
      type: 'append_collection',
      target: targetTitle(targetName),
      items,
      ...high(['append_to_named']),
    };
  }

  // --- put X on the list / on it ---
  const appendThe = raw.match(APPEND_THE_LIST_RE);
  if (appendThe) {
    return {
      type: 'append_collection',
      target: targetActive(),
      items: itemsFromText(appendThe[1]),
      ...high(['append_the_list']),
    };
  }

  // --- COMPOUND CREATE + APPEND: "start a grocery list and add milk to it" ---
  // Treat this as one atomic list creation with initial items. This preserves
  // the user's two-step meaning without routing the second clause through the
  // active-list continuation heuristic before the list exists.
  const compoundCreate = raw.match(
    /^(?:start|create|make|new|open|begin|setup|set\s*up)\s+(?:me\s+|us\s+)?(?:a\s+|an\s+|my\s+|the\s+)?(.+?)\s+lists?\s+and\s+(?:add|put|include|stick|throw)\s+(.+?)\s+(?:to|on|onto)\s+(?:it|the\s+list|my\s+list|that\s+list|this\s+list)$/i
  );
  if (compoundCreate) {
    const title = cleanListTitle(compoundCreate[1]);
    const items = itemsFromText(compoundCreate[2]);
    return withContextLink(
      {
        type: 'create_collection',
        title,
        collectionType: inferCollectionType(title),
        items,
        ...high(['compound_create_append']),
      },
      ctx
    );
  }

  // --- CREATE: "I need a packing list" ---
  const needBare = raw.match(NEED_LIST_BARE_RE);
  if (needBare) {
    return withContextLink(
      {
        type: 'create_collection',
        title: 'List',
        collectionType: 'generic',
        items: [],
        ...high(['need_list_bare']),
      },
      ctx
    );
  }
  const needNamed = raw.match(NEED_LIST_RE);
  if (needNamed) {
    const title = cleanListTitle(needNamed[1]);
    return withContextLink(
      {
        type: 'create_collection',
        title,
        collectionType: inferCollectionType(title),
        items: [],
        ...high(['need_list_named']),
      },
      ctx
    );
  }

  // --- CREATE: "can you make a birthday list" ---
  const canYou = raw.match(CAN_YOU_LIST_RE);
  if (canYou && isListyUtterance(raw)) {
    const title = cleanListTitle(canYou[1]);
    const after = raw.split(/\.\s+/).slice(1).join('. ');
    const items = after ? itemsFromText(after) : [];
    return withContextLink(
      {
        type: 'create_collection',
        title,
        collectionType: inferCollectionType(title),
        items,
        ...high(['can_you_list']),
      },
      ctx
    );
  }

  // --- CREATE core: "start list", "start a grocery list", "make packing list: a, b" ---
  const createCore = raw.match(CREATE_CORE_RE);
  if (createCore) {
    const title = cleanListTitle(createCore[1]);
    const contextHint = createCore[2] ? collapseWhitespace(createCore[2]) : undefined;
    const trailing = collapseWhitespace(createCore[3] || '');
    const afterPeriod = raw.split(/\.\s+/).slice(1).join('. ');
    const items = itemsFromText(trailing || afterPeriod || '');
    return withContextLink(
      {
        type: 'create_collection',
        title,
        collectionType: inferCollectionType(title),
        items,
        contextHint,
        ...high(['create_list_phrase']),
      },
      ctx
    );
  }

  // Fallback create: verb + listy word somewhere (handles odd word order)
  if (CREATE_VERBS.test(raw) && isListyUtterance(raw) && !looksLikeStandaloneTask(raw)) {
    // Strip verb + articles, strip trailing "list", leftover is the name
    let rest = raw
      .replace(CREATE_VERBS, '')
      .replace(/^(?:\s*(?:me|us)\s+)?(?:a|an|my|the)\s+/i, ' ')
      .replace(/\blists?\b/i, ' ')
      .replace(/\bfor\s+.+$/i, ' ');
    // Drop trailing items after colon
    const colonSplit = rest.split(/[:.—–\-]/);
    const namePart = collapseWhitespace(colonSplit[0] || '');
    const itemPart = colonSplit.slice(1).join(' ');
    const title = cleanListTitle(namePart);
    const items = itemPart ? itemsFromText(itemPart) : [];
    return withContextLink(
      {
        type: 'create_collection',
        title,
        collectionType: inferCollectionType(title),
        items,
        ...med(['create_list_fallback']),
      },
      ctx
    );
  }

  // --- "packing list: screws, gib" / "birthday list cake, candles" ---
  const inline = raw.match(NAMED_LIST_INLINE_RE);
  if (inline && !looksLikeStandaloneTask(raw) && !CREATE_VERBS.test(raw)) {
    // Avoid "call list of clients" style — require short head
    const head = collapseWhitespace(inline[1]);
    if (head.split(/\s+/).length <= 4) {
      const title = cleanListTitle(head);
      const items = itemsFromText(inline[2]);
      if (items.length >= 1) {
        return {
          type: 'create_collection',
          title,
          collectionType: inferCollectionType(title),
          items,
          ...med(['create_list_inline_items']),
        };
      }
    }
  }

  // --- bare seed + items ---
  const bareSeed = raw.match(BARE_SEED_RE);
  if (bareSeed) {
    const title = cleanListTitle(bareSeed[1]);
    const items = itemsFromText(bareSeed[2]);
    if (items.length >= 1) {
      return {
        type: 'create_collection',
        title,
        collectionType: inferCollectionType(title),
        items,
        ...med(['create_list_seed_items']),
      };
    }
  }

  // --- bare add / implicit continuation on active list ---
  const addBare = raw.match(ADD_BARE_RE);
  if (addBare) {
    const items = itemsFromText(addBare[1]);
    return {
      type: 'append_collection',
      target: targetActive(),
      items,
      ...med(['append_bare']),
    };
  }

  const hasActive =
    !!ctx?.activeCollectionId &&
    (ctx.msSinceLastActivity == null || ctx.msSinceLastActivity < 2 * 60 * 60 * 1000);

  if (hasActive && looksLikeImplicitItem(raw) && !looksLikeStandaloneTask(raw)) {
    const items = itemsFromText(raw);
    if (items.length > 0) {
      return {
        type: 'append_collection',
        target: targetActive(),
        items,
        ...med(['implicit_continuation']),
      };
    }
  }

  // --- structural multi-item capture (wide net) ---
  // "I need to order A, B and C for Munstead" — no need to say "list".
  // Reuses for/at/on anchors → job/meeting via withContextLink.
  const structural = tryStructuralMultiItemCapture(raw);
  if (structural) {
    return withContextLink(
      {
        type: 'create_collection',
        title: structural.title,
        collectionType: inferCollectionType(structural.title),
        items: structural.items,
        contextHint: structural.contextHint ?? undefined,
        confidence: 'medium',
        reasons: structural.reasons,
      },
      ctx
    );
  }

  return null;
}

/** Whether speech decision should prefer list mutation over task create. */
export function intentBlocksTaskCreate(intent: CollectionIntent | null): boolean {
  if (!intent) return false;
  return intent.type !== 'query_collection';
}

