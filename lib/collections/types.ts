/**
 * Persistent Collections — domain types.
 * Generic multi-item capture objects (grocery, snag, packing, materials, questions).
 * "Grocery List Sequence" is the canonical test scenario, not a special-case feature.
 */

import type { Confidence } from '@/lib/thinking/types';
export type { Confidence };

export type CollectionStatus = 'open' | 'closed' | 'archived';
export type CollectionItemStatus = 'open' | 'completed' | 'removed';

export type CollectionContextType =
  | 'job'
  | 'meeting'
  | 'trip'
  | 'task'
  | 'generic'
  | null;

export type CollectionType =
  | 'generic'
  | 'grocery'
  | 'snag'
  | 'shopping'
  | 'packing'
  | 'materials'
  | 'questions'
  | 'observations'
  | 'ideas';

export type Collection = {
  id: string;
  userId: string;
  title: string;
  normalizedTitle: string;
  collectionType: CollectionType | string;
  status: CollectionStatus;
  contextType: CollectionContextType;
  contextId: string | null;
  aliases: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  closedAt: string | null;
};

export type CollectionItem = {
  id: string;
  collectionId: string;
  userId: string;
  content: string;
  normalizedContent: string;
  status: CollectionItemStatus;
  position: number;
  metadata: Record<string, unknown>;
  source: string | null;
  clientOpId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  deletedAt: string | null;
};

export type CollectionItemInput = {
  content: string;
  metadata?: Record<string, unknown>;
  source?: string;
  clientOpId?: string;
};

export type CollectionTarget =
  | { kind: 'id'; collectionId: string }
  | { kind: 'title'; title: string }
  | { kind: 'active' }
  | { kind: 'context'; contextType: NonNullable<CollectionContextType>; contextId: string }
  | { kind: 'unresolved'; spoken: string };

export type CollectionIntent =
  | {
      type: 'create_collection';
      title: string;
      collectionType?: CollectionType | string;
      items: CollectionItemInput[];
      contextType?: CollectionContextType;
      contextId?: string | null;
      contextHint?: string;
      confidence: Confidence;
      reasons: string[];
    }
  | {
      type: 'append_collection';
      target: CollectionTarget;
      items: CollectionItemInput[];
      confidence: Confidence;
      reasons: string[];
    }
  | {
      type: 'complete_collection_items';
      target: CollectionTarget;
      itemReferences: string[];
      confidence: Confidence;
      reasons: string[];
    }
  | {
      type: 'remove_collection_items';
      target: CollectionTarget;
      itemReferences: string[];
      confidence: Confidence;
      reasons: string[];
    }
  | {
      type: 'update_collection_item';
      target: CollectionTarget;
      itemReference: string;
      replacement: string;
      confidence: Confidence;
      reasons: string[];
    }
  | {
      type: 'close_collection';
      target: CollectionTarget;
      confidence: Confidence;
      reasons: string[];
    }
  | {
      type: 'reopen_collection';
      target: CollectionTarget;
      confidence: Confidence;
      reasons: string[];
    }
  | {
      type: 'query_collection';
      target: CollectionTarget;
      query?: string;
      confidence: Confidence;
      reasons: string[];
    }
  | {
      type: 'clarification_required';
      spoken: string;
      candidates: Array<{ collectionId: string; title: string; reason: string }>;
      pendingIntent: Exclude<CollectionIntent, { type: 'clarification_required' }> | null;
      confidence: Confidence;
      reasons: string[];
    };

export type CollectionResolutionReason =
  | 'explicit_id'
  | 'explicit_title_match'
  | 'alias_match'
  | 'active_collection'
  | 'context_match'
  | 'recent_collection'
  | 'item_context'
  | 'ambiguous'
  | 'no_match';

export type CollectionResolution = {
  collectionId: string | null;
  collection: Collection | null;
  confidence: Confidence;
  reason: CollectionResolutionReason;
  candidates: Collection[];
  needsClarification: boolean;
};

export type ActiveCollectionState = {
  collectionId: string | null;
  activatedAt: string | null;
  lastInteractionAt: string | null;
  surface?: string | null;
};

export type CollectionDetectContext = {
  activeCollectionId?: string | null;
  activeCollectionTitle?: string | null;
  collections?: Collection[];
  jobs?: Array<{ id: string; name: string }>;
  meetings?: Array<{ id: string; text: string }>;
  surface?: string | null;
  msSinceLastActivity?: number | null;
};

export type CollectionObservation = {
  signal:
    | 'collection_reference'
    | 'collection_alias'
    | 'collection_resolution'
    | 'collection_continuation'
    | 'collection_correction'
    | 'collection_item_match'
    | 'collection_item_completion'
    | 'collection_context'
    | 'collection_creation'
    | 'collection_close';
  spoken?: string;
  resolvedCollectionId?: string | null;
  resolvedTitle?: string | null;
  resolutionReason?: CollectionResolutionReason | string;
  meta?: Record<string, unknown>;
  createdAt: string;
};

export function makeCollectionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `col-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function makeItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ci-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
