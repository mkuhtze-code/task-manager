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

const CREATE_RE =
  /^(?:(?:start|create|make|new|open)\s+(?:a\s+|an\s+|my\s+)?)?(?:(.+?)\s+)?(?:list|snag\s*list|grocery\s*list|packing\s*list|shopping\s*list)(?:\s+for\s+(.+))?$/i;

const CREATE_COLON_RE =
  /^(.+?)\s*(?:list)?\s*[:—–\-]\s*(.+)$/i;

const CREATE_IS_RE =
  /^(?:i(?:'m| am)\s+(?:making|starting)\s+(?:a\s+|an\s+|my\s+)?)(.+?)(?:\s+list)?$/i;

const APPEND_TO_RE =
  /^(?:add|put|include)\s+(.+?)\s+to\s+(?:my\s+|the\s+)?(.+?)(?:\s+list)?$/i;

const ADD_BARE_RE = /^(?:add|also|plus|and)\s+(.+)$/i;

const COMPLETE_RE =
  /^(?:(?:i\s+)?(?:got|have|bought|picked\s*up)|(?:mark|set)\s+)?(.+?)\s+(?:is\s+)?(?:done|complete|completed|finished)|(?:got|have)\s+(?:the\s+)?(.+)$/i;

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
  const lower = raw.toLowerCase();

  // --- Close ---
  const close = raw.match(CLOSE_RE);
  if (close) {
    const name = close[1] || close[2] || close[3] || '';
    return {
      type: 'close_collection',
      target: name.trim() ? targetTitle(name) : targetActive(),
      ...high(['close_phrase']),
    };
  }

  // --- Reopen ---
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

  // --- Change / replace item ---
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

  // --- Remove ---
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

  // --- Complete ---
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

  // --- Query ---
  const query = raw.match(QUERY_RE);
  if (query) {
    const name = query[1] || query[2] || '';
    return {
      type: 'query_collection',
      target: name.trim() ? targetTitle(name) : targetActive(),
      ...high(['query_phrase']),
    };
  }

  // --- Append to named list ---
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

  // --- Create with colon / em-dash body ---
  const createColon = raw.match(CREATE_COLON_RE);
  if (createColon) {
    const head = collapseWhitespace(createColon[1]);
    const body = createColon[2];
    if (/\blist\b/i.test(head) || isListHead(head) || /\blist\b/i.test(raw)) {
      const title = titleFromSpoken(head.replace(/\blist\b/i, ''));
      const items = itemsFromText(body);
      const contextHint = extractForClause(raw);
      return {
        type: 'create_collection',
        title: title || 'List',
        collectionType: inferCollectionType(title),
        items,
        contextHint: contextHint ?? undefined,
        ...high(['create_colon_list']),
      };
    }
  }

  // --- Start/create a X list ---
  if (
    /\b(start|create|make|new)\b/i.test(raw) &&
    /\b(list|snag|grocery|packing|shopping|materials|questions|observations)\b/i.test(raw)
  ) {
    const forMatch = raw.match(/\bfor\s+(.+)$/i);
    const contextHint = forMatch ? collapseWhitespace(forMatch[1]) : undefined;
    let titlePart = raw
      .replace(/^(?:start|create|make|new)\s+(?:a\s+|an\s+|my\s+)?/i, '')
      .replace(/\blist\b/i, '')
      .replace(/\bfor\s+.+$/i, '');
    titlePart = collapseWhitespace(titlePart);
    const title = titleFromSpoken(titlePart || 'list');
    // Items after period: "Start a grocery list. Need milk and bread."
    const afterPeriod = raw.split(/\.\s+/).slice(1).join('. ');
    const items = afterPeriod ? itemsFromText(afterPeriod) : [];
    return {
      type: 'create_collection',
      title,
      collectionType: inferCollectionType(title),
      items,
      contextHint,
      ...high(['create_list_phrase']),
    };
  }

  // "I'm making a grocery list"
  const createIs = raw.match(CREATE_IS_RE);
  if (createIs) {
    const title = titleFromSpoken(createIs[1]);
    return {
      type: 'create_collection',
      title,
      collectionType: inferCollectionType(title),
      items: [],
      ...high(['create_list_progressive']),
    };
  }

  // Bare "Grocery list: a, b, c" already handled by CREATE_COLON
  // "Grocery list milk bread eggs" without colon
  const listWord = raw.match(
    /^((?:grocery|groceries|shopping|snag|packing|materials|questions|ideas|observations)(?:\s+list)?)\s+(.+)$/i
  );
  if (listWord) {
    const title = titleFromSpoken(listWord[1]);
    const items = itemsFromText(listWord[2]);
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

  // --- Bare add / also ---
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

  // --- Implicit continuation while active ---
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
  return [
    'grocery',
    'shopping',
    'snag',
    'packing',
    'materials',
    'questions',
    'ideas',
    'observations',
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
