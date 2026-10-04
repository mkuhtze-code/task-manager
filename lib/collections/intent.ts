/**
 * Detect collection intents from normalised text.
 * Plugs into the speech pipeline — does not special-case "grocery".
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

/**
 * Generic list create. Matches e.g.:
 *   "start a grocery list"
 *   "create packing list"
 *   "new list"
 *   "make a birthday list for the party"
 *   "open my materials list"
 * Domain words (grocery, packing, …) are examples only — any "<name> list" works.
 */
const CREATE_RE =
  /^(?:(?:start|create|make|new|open)\s+(?:a\s+|an\s+|my\s+|the\s+)?)?(?:(.+?)\s+)?list(?:\s+for\s+([^.:—–\-]+))?(?:\s*[:.—–\-]\s*(.+))?$/i;

const CREATE_COLON_RE =
  /^(.+?)\s*(?:list)?\s*[:—–\-]\s*(.+)$/i;

const CREATE_IS_RE =
  /^(?:i(?:'m| am)\s+(?:making|starting)\s+(?:a\s+|an\s+|my\s+)?)(.+?)\s+list$/i;

/** Bare known-type or any "<name> list" followed by items, no verb required. */
const LIST_INLINE_RE =
  /^(.+?)\s+list\s+(.+)$/i;

const APPEND_TO_RE =
  /^(?:add|put|include)\s+(.+?)\s+to\s+(?:my\s+|the\s+)?(.+?)(?:\s+list)?$/i;

const ADD_BARE_RE = /^(?:add|also|plus|and)\s+(.+)$/i;

const COMPLETE_RE =
  /^(?:(?:i\s+)?(?:got|have|bought|picked\s*up)|(?:mark|set)\s+)?(.+?)\s+(?:is\s+)?(?:done|complete|completed|finished)|(?:got|have)\s+(?:the\s+)?(.+)$/i;

/** "Complete eggs" / "Mark eggs done" / "Check off eggs" */
const COMPLETE_CMD_RE =
  /^(?:complete|check\s*off|tick\s*off|mark)\s+(.+?)(?:\s+(?:as\s+)?(?:done|complete|completed|finished))?$/i;

const REMOVE_RE =
  /^(?:remove|delete|take)\s+(.+?)(?:\s+off(?:\s+the\s+list)?|\s+from\s+(?:my\s+|the\s+)?(.+?)(?:\s+list)?)?$/i;

const CLOSE_RE =
  /^(?:that(?:'s| is)\s+(?:it|everything|all)(?:\s+for\s+(.+))?|close\s+(?:my\s+|the\s+)?(.+?)(?:\s+list)?|i(?:'m| am)\s+done\s+with\s+(?:that\s+list|(?:my\s+|the\s+)?(.+?)))$/i;

const REOPEN_RE =
  /^(?:open\s+(?:my\s+|the\s+)?(.+?)(?:\s+list)?|i\s+need\s+to\s+add\s+(?:something\s+)?to\s+(?:my\s+|the\s+)?(.+?)(?:\s+list)?)$/i;

const CHANGE_RE =
  /^(?:change|replace)\s+(.+?)\s+to\s+(.+)$/i;

const QUERY_RE =
  /^(?:what(?:'s| is)\s+on\s+(?:my\s+|the\s+)?(.+?)(?:\s+list)?|show\s+(?:my\s+|the\s+)?(.+?)(?:\s+list)?)$/i;

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

/**
 * Primary entry: detect a collection intent from text.
 * Returns null when the utterance should fall through to normal task create.
 */
export function detectCollectionIntent(
  text: string,
  ctx?: CollectionDetectContext
): CollectionIntent | null {
  const raw = collapseWhitespace(text);
  if (!raw) return null;

  const close = raw.match(CLOSE_RE);
  if (close) {
    const name = close[1] || close[2] || close[3] || '';
    return {
      type: 'close_collection',
      target: name.trim() ? targetTitle(name) : targetActive(),
      ...high(['close_phrase']),
    };
  }

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

  const change = raw.match(CHANGE_RE);
  if (change) {
    return {
      type: 'update_collection_item',
      target: targetActive(),
      itemReference: collapseWhitespace(change[1]),
      replacement: collapseWhitespace(change[2]),
      ...med(['change_item']),
    };
  }

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

  const completeCmd = raw.match(COMPLETE_CMD_RE);
  if (completeCmd) {
    const refs = splitItemEnumeration(completeCmd[1]);
    if (refs.length > 0) {
      return {
        type: 'complete_collection_items',
        target: targetActive(),
        itemReferences: refs,
        ...high(['complete_command']),
      };
    }
  }

  if (
    /\b(got|bought|picked up|is done|are done|finished)\b/i.test(raw) &&
    !/\b(need|start|create|list)\b/i.test(raw)
  ) {
    const m = raw.match(COMPLETE_RE);
    const body = m ? m[1] || m[2] || raw : raw;
    const cleaned = body
      .replace(/^(?:i\s+)?(?:got|have|bought|picked\s*up)\s+(?:the\s+)?/i, '')
      .replace(/\s+is\s+done$/i, '')
      .replace(/\s+are\s+done$/i, '');
    const refs = splitItemEnumeration(cleaned);
    if (refs.length > 0 && refs.join(' ').length < 120) {
      return {
        type: 'complete_collection_items',
        target: targetActive(),
        itemReferences: refs,
        ...med(['complete_phrase']),
      };
    }
  }

  const query = raw.match(QUERY_RE);
  if (query) {
    const name = query[1] || query[2] || '';
    return {
      type: 'query_collection',
      target: name.trim() ? targetTitle(name) : targetActive(),
      ...high(['query_phrase']),
    };
  }

  const appendTo = raw.match(APPEND_TO_RE);
  if (appendTo) {
    const items = itemsFromText(appendTo[1]);
    return {
      type: 'append_collection',
      target: targetTitle(appendTo[2]),
      items,
      ...high(['append_to_named']),
    };
  }

  // Explicit create: "start a grocery list", "make a packing list", "new list", …
  const createMatch = raw.match(CREATE_RE);
  if (createMatch && /\blist\b/i.test(raw)) {
    // Avoid treating "add X to my list" as create (handled above via APPEND).
    if (!/^(?:add|put|include|remove|delete|show|what)\b/i.test(raw)) {
      const namePart = collapseWhitespace(createMatch[1] || '');
      const title = titleFromSpoken(namePart) || 'List';
      const contextHint = createMatch[2]
        ? collapseWhitespace(createMatch[2])
        : extractForClause(raw) ?? undefined;
      // Items may follow via colon/dash/period: "Start a packing list: screws, gib"
      const trailing = collapseWhitespace(createMatch[3] || '');
      const afterPeriod = raw.split(/\.\s+/).slice(1).join('. ');
      const itemSource = trailing || afterPeriod;
      const items = itemSource ? itemsFromText(itemSource) : [];
      return withContextLink({
        type: 'create_collection',
        title,
        collectionType: inferCollectionType(title),
        items,
        contextHint: contextHint || undefined,
        ...high(['create_list_phrase']),
      }, ctx);
    }
  }

  const createColon = raw.match(CREATE_COLON_RE);
  if (createColon) {
    const head = collapseWhitespace(createColon[1]);
    const body = createColon[2];
    // Require "list" in the utterance, or a known list-head seed, so
    // "Call: John" does not become a list.
    if (/\blist\b/i.test(head) || isListHead(head) || /\blist\b/i.test(raw)) {
      const title = titleFromSpoken(head.replace(/\blist\b/i, '')) || 'List';
      const items = itemsFromText(body);
      const contextHint = extractForClause(raw);
      return withContextLink({
        type: 'create_collection',
        title,
        collectionType: inferCollectionType(title),
        items,
        contextHint: contextHint ?? undefined,
        ...high(['create_colon_list']),
      }, ctx);
    }
  }

  const createIs = raw.match(CREATE_IS_RE);
  if (createIs) {
    const title = titleFromSpoken(createIs[1]) || 'List';
    return {
      type: 'create_collection',
      title,
      collectionType: inferCollectionType(title),
      items: [],
      ...high(['create_list_progressive']),
    };
  }

  // "grocery list milk, bread" or "birthday list cake, candles" (no verb).
  // Known seeds (grocery, packing, …) may omit the word "list".
  const listInline = raw.match(LIST_INLINE_RE);
  if (listInline) {
    const title = titleFromSpoken(listInline[1]) || 'List';
    const items = itemsFromText(listInline[2]);
    if (items.length >= 1 && !looksLikeStandaloneTask(raw)) {
      return {
        type: 'create_collection',
        title,
        collectionType: inferCollectionType(title),
        items,
        ...med(['create_list_inline_items']),
      };
    }
  }

  // Bare seed + items: "grocery milk, bread" / "packing screws, gib"
  const bareSeed = raw.match(
    /^((?:grocery|groceries|shopping|snag|packing|materials|questions|ideas|observations))\s+(.+)$/i
  );
  if (bareSeed) {
    const title = titleFromSpoken(bareSeed[1]);
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

  return null;
}

function isListHead(head: string): boolean {
  const k = normalizeTitle(head);
  // Known seeds (examples only) OR any head that already ends with "list".
  if (/\blist\b/i.test(head)) return true;
  return [
    'grocery',
    'shopping',
    'snag',
    'packing',
    'materials',
    'questions',
    'ideas',
    'observations',
    'todo',
    'to do',
    'checklist',
    'errands',
  ].some((x) => k === x || k.includes(x));
}

function extractForClause(raw: string): string | null {
  const m = raw.match(/\bfor\s+(.+?)(?:\s*[:—–\-]|$)/i);
  return m ? collapseWhitespace(m[1]) : null;
}

function looksLikeStandaloneTask(text: string): boolean {
  return /\b(need to|have to|should|must|schedule|call|email|meet|finish|write|send)\b/i.test(
    text
  );
}

/** Whether speech decision should prefer collection mutation over task create. */
export function intentBlocksTaskCreate(intent: CollectionIntent | null): boolean {
  if (!intent) return false;
  return intent.type !== 'query_collection';
}
