/**
 * Speech ↔ Persistent Collections bridge.
 * Detects collection intents on normalised capture text.
 * Does not mutate store or Supabase — understanding ≠ act.
 * Grocery is a test scenario only; engine is generic.
 */

import {
  detectCollectionIntent,
  intentBlocksTaskCreate,
  type CollectionDetectContext,
  type CollectionIntent,
} from '@/lib/collections';

export type CaptureCollectionSummary = {
  intent: CollectionIntent;
  blocksTaskCreate: boolean;
  surfaceMessage: string;
  previewItems: string[];
  titleHint: string | null;
};

function itemsPreview(intent: CollectionIntent): string[] {
  if (intent.type === 'create_collection' || intent.type === 'append_collection') {
    return intent.items.map((i) => i.content).slice(0, 8);
  }
  if (
    intent.type === 'complete_collection_items' ||
    intent.type === 'remove_collection_items'
  ) {
    return intent.itemReferences.slice(0, 8);
  }
  if (intent.type === 'update_collection_item') {
    return [intent.itemReference, intent.replacement].filter(Boolean);
  }
  return [];
}

function titleHint(intent: CollectionIntent): string | null {
  if (intent.type === 'create_collection') return intent.title;
  if (intent.type === 'clarification_required') return intent.spoken || null;
  if ('target' in intent) {
    const t = intent.target;
    if (t.kind === 'title') return t.title;
    if (t.kind === 'unresolved') return t.spoken;
    if (t.kind === 'active') return null;
  }
  return null;
}

function surfaceMessage(intent: CollectionIntent): string {
  switch (intent.type) {
    case 'create_collection': {
      const n = intent.items.length;
      return n > 0
        ? `Start “${intent.title}” with ${n} item${n === 1 ? '' : 's'}`
        : `Start “${intent.title}”`;
    }
    case 'append_collection': {
      const n = intent.items.length;
      const label =
        intent.target.kind === 'title'
          ? intent.target.title
          : intent.target.kind === 'active'
            ? 'your list'
            : 'list';
      return n > 0
        ? `Add ${n} item${n === 1 ? '' : 's'} to ${label}`
        : `Add to ${label}`;
    }
    case 'complete_collection_items':
      return `Mark done: ${intent.itemReferences.slice(0, 3).join(', ')}`;
    case 'remove_collection_items':
      return `Remove: ${intent.itemReferences.slice(0, 3).join(', ')}`;
    case 'update_collection_item':
      return `Change “${intent.itemReference}” → “${intent.replacement}”`;
    case 'close_collection':
      return 'Close this list';
    case 'reopen_collection':
      return 'Reopen list';
    case 'query_collection':
      return 'Show list';
    case 'clarification_required':
      return `Which list — ${intent.candidates.map((c) => c.title).join(' or ')}?`;
    default:
      return 'Collection update';
  }
}

/**
 * Run collection intent detection on already-normalised (or raw) text.
 * Prefer normalisedText from the speech pipeline when available.
 */
export function detectCaptureCollection(
  text: string,
  ctx?: CollectionDetectContext | null
): CaptureCollectionSummary | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;

  const intent = detectCollectionIntent(trimmed, ctx ?? undefined);
  if (!intent) return null;

  return {
    intent,
    blocksTaskCreate: intentBlocksTaskCreate(intent),
    surfaceMessage: surfaceMessage(intent),
    previewItems: itemsPreview(intent),
    titleHint: titleHint(intent),
  };
}
