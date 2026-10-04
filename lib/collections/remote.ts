/**
 * Supabase repository for persistent collections.
 * Soft-fails when offline or migration not applied — localStore remains source of truth for UX.
 */

import { supabase } from '@/lib/supabaseClient';
import type {
  Collection,
  CollectionItem,
  CollectionStatus,
  CollectionItemStatus,
  CollectionContextType,
} from './types';
import type { CollectionStore } from './service';
import { emptyActiveState } from './active';

type CollectionRow = {
  id: string;
  user_id: string;
  title: string;
  normalized_title: string;
  collection_type: string;
  status: string;
  context_type: string | null;
  context_id: string | null;
  aliases: string[] | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
  closed_at: string | null;
};

type ItemRow = {
  id: string;
  collection_id: string;
  user_id: string;
  content: string;
  normalized_content: string;
  status: string;
  position: number;
  metadata: Record<string, unknown> | null;
  source: string | null;
  client_op_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  deleted_at: string | null;
};

function rowToCollection(r: CollectionRow): Collection {
  return {
    id: r.id,
    userId: r.user_id,
    title: r.title,
    normalizedTitle: r.normalized_title,
    collectionType: r.collection_type,
    status: r.status as CollectionStatus,
    contextType: (r.context_type as CollectionContextType) ?? null,
    contextId: r.context_id,
    aliases: r.aliases ?? [],
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastActivityAt: r.last_activity_at,
    closedAt: r.closed_at,
  };
}

function rowToItem(r: ItemRow): CollectionItem {
  return {
    id: r.id,
    collectionId: r.collection_id,
    userId: r.user_id,
    content: r.content,
    normalizedContent: r.normalized_content,
    status: r.status as CollectionItemStatus,
    position: r.position,
    metadata: r.metadata ?? {},
    source: r.source,
    clientOpId: r.client_op_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
    deletedAt: r.deleted_at,
  };
}

function collectionToRow(c: Collection) {
  return {
    id: c.id,
    user_id: c.userId,
    title: c.title,
    normalized_title: c.normalizedTitle,
    collection_type: c.collectionType,
    status: c.status,
    context_type: c.contextType,
    context_id: c.contextId,
    aliases: c.aliases,
    is_active: c.isActive,
    created_at: c.createdAt,
    updated_at: c.updatedAt,
    last_activity_at: c.lastActivityAt,
    closed_at: c.closedAt,
  };
}

function itemToRow(i: CollectionItem) {
  return {
    id: i.id,
    collection_id: i.collectionId,
    user_id: i.userId,
    content: i.content,
    normalized_content: i.normalizedContent,
    status: i.status,
    position: i.position,
    metadata: i.metadata,
    source: i.source,
    client_op_id: i.clientOpId,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
    completed_at: i.completedAt,
    deleted_at: i.deletedAt,
  };
}

/** Load remote store for user. Returns null if unavailable. */
export async function fetchCollectionStoreRemote(
  userId: string
): Promise<CollectionStore | null> {
  if (!userId || userId === 'anon') return null;
  try {
    const { data: cols, error: cErr } = await supabase
      .from('collections')
      .select('*')
      .eq('user_id', userId)
      .order('last_activity_at', { ascending: false });
    if (cErr) return null;

    const { data: items, error: iErr } = await supabase
      .from('collection_items')
      .select('*')
      .eq('user_id', userId);
    if (iErr) return null;

    const collections = (cols as CollectionRow[] | null)?.map(rowToCollection) ?? [];
    const collectionItems = (items as ItemRow[] | null)?.map(rowToItem) ?? [];
    const activeCol = collections.find((c) => c.isActive) ?? null;

    return {
      collections,
      items: collectionItems,
      active: activeCol
        ? {
            collectionId: activeCol.id,
            activatedAt: activeCol.createdAt,
            lastInteractionAt: activeCol.lastActivityAt,
            surface: null,
          }
        : emptyActiveState(),
      observations: [],
    };
  } catch {
    return null;
  }
}

/** Upsert full store snapshot for user (best-effort). */
export async function pushCollectionStoreRemote(
  userId: string,
  store: CollectionStore
): Promise<boolean> {
  if (!userId || userId === 'anon') return false;
  try {
    const mine = store.collections.filter((c) => c.userId === userId);
    const myItems = store.items.filter((i) => i.userId === userId);
    if (mine.length === 0 && myItems.length === 0) return true;

    const { error: cErr } = await supabase.from('collections').upsert(
      mine.map(collectionToRow),
      { onConflict: 'id' }
    );
    if (cErr) return false;

    if (myItems.length > 0) {
      const { error: iErr } = await supabase.from('collection_items').upsert(
        myItems.map(itemToRow),
        { onConflict: 'id' }
      );
      if (iErr) return false;
    }
    return true;
  } catch {
    return false;
  }
}
