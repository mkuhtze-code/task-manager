/**
 * Collection service — pure in-memory core for tests + mutation API.
 * Speech engine must not embed raw Supabase queries; call this layer.
 */

import {
  normalizeTitle,
  normalizeItemContent,
  titleFromSpoken,
  isLikelySameItem,
} from './normalize';
import { resolveTarget, matchItems } from './resolve';
import {
  activateCollection,
  clearActive,
  touchActive,
  emptyActiveState,
  type ActiveCollectionState,
} from './active';
import type {
  Collection,
  CollectionItem,
  CollectionItemInput,
  CollectionIntent,
  CollectionObservation,
  CollectionTarget,
  CollectionType,
  CollectionContextType,
} from './types';
import { makeCollectionId, makeItemId } from './types';

export type CollectionStore = {
  collections: Collection[];
  items: CollectionItem[];
  active: ActiveCollectionState;
  observations: CollectionObservation[];
};

export function emptyStore(userId = 'user'): CollectionStore {
  return {
    collections: [],
    items: [],
    active: emptyActiveState(),
    observations: [],
  };
}

function nowIso() {
  return new Date().toISOString();
}

function observe(
  store: CollectionStore,
  obs: Omit<CollectionObservation, 'createdAt'>
): void {
  store.observations.push({ ...obs, createdAt: nowIso() });
}

export type ApplyResult = {
  store: CollectionStore;
  ok: boolean;
  message: string;
  collection?: Collection | null;
  items?: CollectionItem[];
  needsClarification?: boolean;
  candidates?: Collection[];
  observations: CollectionObservation[];
};

export function applyCollectionIntent(
  store: CollectionStore,
  userId: string,
  intent: CollectionIntent
): ApplyResult {
  const observationsStart = store.observations.length;

  if (intent.type === 'clarification_required') {
    return {
      store,
      ok: false,
      message: `Which list — ${intent.candidates.map((c) => c.title).join(' or ')}?`,
      needsClarification: true,
      candidates: intent.candidates.map((c) => {
        const found = store.collections.find((x) => x.id === c.collectionId);
        return found!;
      }).filter(Boolean),
      observations: store.observations.slice(observationsStart),
    };
  }

  switch (intent.type) {
    case 'create_collection':
      return createCollection(store, userId, intent.title, intent.items, {
        collectionType: intent.collectionType,
        contextHint: intent.contextHint,
      });
    case 'append_collection':
      return appendItems(store, userId, intent.target, intent.items);
    case 'complete_collection_items':
      return completeItems(store, userId, intent.target, intent.itemReferences);
    case 'remove_collection_items':
      return removeItems(store, userId, intent.target, intent.itemReferences);
    case 'update_collection_item':
      return updateItem(
        store,
        userId,
        intent.target,
        intent.itemReference,
        intent.replacement
      );
    case 'close_collection':
      return closeCollection(store, userId, intent.target);
    case 'reopen_collection':
      return reopenCollection(store, userId, intent.target);
    case 'query_collection': {
      const res = resolveTarget(intent.target, store.collections, {
        active: store.active,
      });
      if (res.needsClarification) {
        return clarify(store, intent.target, res.candidates);
      }
      if (!res.collection) {
        return {
          store,
          ok: false,
          message: 'No matching list found.',
          observations: [],
        };
      }
      const items = store.items.filter(
        (i) => i.collectionId === res.collection!.id && i.status === 'open'
      );
      return {
        store,
        ok: true,
        message: `${res.collection.title}: ${items.length} open`,
        collection: res.collection,
        items,
        observations: [],
      };
    }
    default:
      return {
        store,
        ok: false,
        message: 'Unknown collection intent.',
        observations: [],
      };
  }
}

function clarify(
  store: CollectionStore,
  _target: CollectionTarget,
  candidates: Collection[]
): ApplyResult {
  return {
    store,
    ok: false,
    message: `Which list — ${candidates.map((c) => c.title).join(' or ')}?`,
    needsClarification: true,
    candidates,
    observations: [],
  };
}

export function createCollection(
  store: CollectionStore,
  userId: string,
  title: string,
  items: CollectionItemInput[],
  opts?: {
    collectionType?: CollectionType | string;
    contextType?: CollectionContextType;
    contextId?: string | null;
    contextHint?: string;
  }
): ApplyResult {
  const normalizedTitle = normalizeTitle(title);
  // Resume existing open collection with same normalized title instead of duplicating
  const existing = store.collections.find(
    (c) =>
      c.userId === userId &&
      c.normalizedTitle === normalizedTitle &&
      c.status === 'open'
  );
  if (existing) {
    return appendItems(store, userId, { kind: 'id', collectionId: existing.id }, items);
  }

  // Clear other active flags
  for (const c of store.collections) {
    if (c.userId === userId) c.isActive = false;
  }

  const id = makeCollectionId();
  const ts = nowIso();
  const collection: Collection = {
    id,
    userId,
    title: titleFromSpoken(title) || title.trim(),
    normalizedTitle,
    collectionType: opts?.collectionType || 'generic',
    status: 'open',
    contextType: opts?.contextType ?? null,
    contextId: opts?.contextId ?? null,
    aliases: [],
    isActive: true,
    createdAt: ts,
    updatedAt: ts,
    lastActivityAt: ts,
    closedAt: null,
  };

  // Context hint: store as alias seed only (job linking is caller responsibility)
  if (opts?.contextHint) {
    collection.aliases.push(opts.contextHint.trim());
  }

  store.collections.push(collection);
  store.active = activateCollection(store.active, id);

  const createdItems: CollectionItem[] = [];
  let pos = 0;
  for (const input of items) {
    const item = makeItem(userId, id, input, pos++);
    store.items.push(item);
    createdItems.push(item);
  }

  observe(store, {
    signal: 'collection_creation',
    resolvedCollectionId: id,
    resolvedTitle: collection.title,
    meta: { itemCount: createdItems.length },
  });

  return {
    store,
    ok: true,
    message:
      createdItems.length > 0
        ? `Created ${collection.title} with ${createdItems.length} item${createdItems.length === 1 ? '' : 's'}.`
        : `Started ${collection.title}.`,
    collection,
    items: createdItems,
    observations: store.observations.slice(-1),
  };
}

export function appendItems(
  store: CollectionStore,
  userId: string,
  target: CollectionTarget,
  inputs: CollectionItemInput[]
): ApplyResult {
  const res = resolveTarget(target, store.collections, { active: store.active });
  if (res.needsClarification) return clarify(store, target, res.candidates);
  if (!res.collection) {
    return {
      store,
      ok: false,
      message: 'No list to add to. Start a list first.',
      observations: [],
    };
  }

  let collection = res.collection;
  // Reopen if closed
  if (collection.status === 'closed') {
    collection.status = 'open';
    collection.closedAt = null;
  }

  const existing = store.items.filter(
    (i) => i.collectionId === collection.id && i.status === 'open'
  );
  const added: CollectionItem[] = [];
  const skipped: string[] = [];
  let pos = existing.reduce((m, i) => Math.max(m, i.position), -1) + 1;

  for (const input of inputs) {
    // Idempotent client op
    if (input.clientOpId) {
      const prior = store.items.find(
        (i) => i.userId === userId && i.clientOpId === input.clientOpId
      );
      if (prior) {
        added.push(prior);
        continue;
      }
    }
    // Duplicate protection
    const dup = existing.find((i) => isLikelySameItem(i.content, input.content));
    if (dup) {
      skipped.push(input.content);
      continue;
    }
    const item = makeItem(userId, collection.id, input, pos++);
    store.items.push(item);
    existing.push(item);
    added.push(item);
  }

  const ts = nowIso();
  collection.lastActivityAt = ts;
  collection.updatedAt = ts;
  collection.isActive = true;
  for (const c of store.collections) {
    if (c.id !== collection.id && c.userId === userId) c.isActive = false;
  }
  store.active = touchActive(activateCollection(store.active, collection.id));

  observe(store, {
    signal: 'collection_continuation',
    resolvedCollectionId: collection.id,
    resolvedTitle: collection.title,
    resolutionReason: res.reason,
    meta: { added: added.length, skipped: skipped.length },
  });

  let message =
    added.length > 0
      ? `Added ${added.length} item${added.length === 1 ? '' : 's'} to ${collection.title}.`
      : `Nothing new for ${collection.title}.`;
  if (skipped.length === 1) {
    message = `${skipped[0]} is already on the list.`;
  }

  return {
    store,
    ok: true,
    message,
    collection,
    items: added,
    observations: store.observations.slice(-1),
  };
}

export function completeItems(
  store: CollectionStore,
  userId: string,
  target: CollectionTarget,
  refs: string[]
): ApplyResult {
  const res = resolveTarget(target, store.collections, { active: store.active });
  if (res.needsClarification) return clarify(store, target, res.candidates);
  if (!res.collection) {
    return { store, ok: false, message: 'No matching list.', observations: [] };
  }
  const items = store.items.filter((i) => i.collectionId === res.collection!.id);
  const matches = matchItems(refs, items, { openOnly: true });
  if (matches.some((m) => m.needsClarification)) {
    return {
      store,
      ok: false,
      message: `Do you mean ${matches
        .filter((m) => m.needsClarification)
        .map((m) => m.reference)
        .join(', ')}?`,
      needsClarification: true,
      collection: res.collection,
      observations: [],
    };
  }
  const done: CollectionItem[] = [];
  const ts = nowIso();
  for (const m of matches) {
    if (!m.itemId) continue;
    const item = store.items.find((i) => i.id === m.itemId);
    if (!item) continue;
    item.status = 'completed';
    item.completedAt = ts;
    item.updatedAt = ts;
    done.push(item);
  }
  res.collection.lastActivityAt = ts;
  store.active = touchActive(store.active);
  observe(store, {
    signal: 'collection_item_completion',
    resolvedCollectionId: res.collection.id,
    meta: { count: done.length },
  });
  return {
    store,
    ok: done.length > 0,
    message:
      done.length > 0
        ? `Marked ${done.map((d) => d.content).join(', ')} as done.`
        : 'Could not match those items.',
    collection: res.collection,
    items: done,
    observations: store.observations.slice(-1),
  };
}

export function removeItems(
  store: CollectionStore,
  userId: string,
  target: CollectionTarget,
  refs: string[]
): ApplyResult {
  const res = resolveTarget(target, store.collections, { active: store.active });
  if (res.needsClarification) return clarify(store, target, res.candidates);
  if (!res.collection) {
    return { store, ok: false, message: 'No matching list.', observations: [] };
  }
  const items = store.items.filter((i) => i.collectionId === res.collection!.id);
  const matches = matchItems(refs, items, { openOnly: false });
  const removed: CollectionItem[] = [];
  const ts = nowIso();
  for (const m of matches) {
    if (!m.itemId) continue;
    const item = store.items.find((i) => i.id === m.itemId);
    if (!item) continue;
    item.status = 'removed';
    item.deletedAt = ts;
    item.updatedAt = ts;
    removed.push(item);
  }
  res.collection.lastActivityAt = ts;
  observe(store, {
    signal: 'collection_correction',
    resolvedCollectionId: res.collection.id,
    meta: { removed: removed.length },
  });
  return {
    store,
    ok: removed.length > 0,
    message:
      removed.length > 0
        ? `Removed ${removed.map((r) => r.content).join(', ')} from ${res.collection.title}.`
        : 'Could not match those items.',
    collection: res.collection,
    items: removed,
    observations: store.observations.slice(-1),
  };
}

export function updateItem(
  store: CollectionStore,
  userId: string,
  target: CollectionTarget,
  itemReference: string,
  replacement: string
): ApplyResult {
  const res = resolveTarget(target, store.collections, { active: store.active });
  if (res.needsClarification) return clarify(store, target, res.candidates);
  if (!res.collection) {
    return { store, ok: false, message: 'No matching list.', observations: [] };
  }
  const items = store.items.filter(
    (i) => i.collectionId === res.collection!.id && i.status === 'open'
  );
  const [m] = matchItems([itemReference], items);
  if (!m?.itemId) {
    return {
      store,
      ok: false,
      message: `Could not find “${itemReference}” on the list.`,
      observations: [],
    };
  }
  const item = store.items.find((i) => i.id === m.itemId)!;
  item.content = replacement.trim();
  item.normalizedContent = normalizeItemContent(replacement);
  item.updatedAt = nowIso();
  res.collection.lastActivityAt = item.updatedAt;
  return {
    store,
    ok: true,
    message: `Changed to ${item.content}.`,
    collection: res.collection,
    items: [item],
    observations: [],
  };
}

export function closeCollection(
  store: CollectionStore,
  userId: string,
  target: CollectionTarget
): ApplyResult {
  const res = resolveTarget(target, store.collections, { active: store.active });
  if (res.needsClarification) return clarify(store, target, res.candidates);
  if (!res.collection) {
    return { store, ok: false, message: 'No matching list.', observations: [] };
  }
  const ts = nowIso();
  res.collection.status = 'closed';
  res.collection.closedAt = ts;
  res.collection.isActive = false;
  res.collection.lastActivityAt = ts;
  if (store.active.collectionId === res.collection.id) {
    store.active = clearActive();
  }
  observe(store, {
    signal: 'collection_close',
    resolvedCollectionId: res.collection.id,
    resolvedTitle: res.collection.title,
  });
  return {
    store,
    ok: true,
    message: `Closed ${res.collection.title}.`,
    collection: res.collection,
    observations: store.observations.slice(-1),
  };
}

export function reopenCollection(
  store: CollectionStore,
  userId: string,
  target: CollectionTarget
): ApplyResult {
  const res = resolveTarget(target, store.collections, {
    active: store.active,
  });
  // Include closed
  if (!res.collection) {
    const title =
      target.kind === 'title'
        ? target.title
        : target.kind === 'unresolved'
          ? target.spoken
          : '';
    const closed = store.collections.find(
      (c) =>
        c.userId === userId &&
        c.normalizedTitle === normalizeTitle(title) &&
        (c.status === 'closed' || c.status === 'archived')
    );
    if (closed) {
      closed.status = 'open';
      closed.closedAt = null;
      closed.isActive = true;
      closed.lastActivityAt = nowIso();
      for (const c of store.collections) {
        if (c.id !== closed.id && c.userId === userId) c.isActive = false;
      }
      store.active = activateCollection(store.active, closed.id);
      return {
        store,
        ok: true,
        message: `Reopened ${closed.title}.`,
        collection: closed,
        observations: [],
      };
    }
    return { store, ok: false, message: 'No matching list.', observations: [] };
  }
  if (res.needsClarification) return clarify(store, target, res.candidates);
  res.collection.status = 'open';
  res.collection.closedAt = null;
  res.collection.isActive = true;
  res.collection.lastActivityAt = nowIso();
  store.active = activateCollection(store.active, res.collection.id);
  return {
    store,
    ok: true,
    message: `Reopened ${res.collection.title}.`,
    collection: res.collection,
    observations: [],
  };
}

function makeItem(
  userId: string,
  collectionId: string,
  input: CollectionItemInput,
  position: number
): CollectionItem {
  const ts = nowIso();
  return {
    id: makeItemId(),
    collectionId,
    userId,
    content: input.content.trim(),
    normalizedContent: normalizeItemContent(input.content),
    status: 'open',
    position,
    metadata: input.metadata ?? {},
    source: input.source ?? null,
    clientOpId: input.clientOpId ?? null,
    createdAt: ts,
    updatedAt: ts,
    completedAt: null,
    deletedAt: null,
  };
}
