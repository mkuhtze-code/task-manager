/**
 * Persistent Collections — public API.
 * Generic multi-item capture. Grocery is a test scenario, not a special case.
 */

export type {
  Collection,
  CollectionItem,
  CollectionItemInput,
  CollectionIntent,
  CollectionTarget,
  CollectionStatus,
  CollectionItemStatus,
  CollectionType,
  CollectionContextType,
  CollectionResolution,
  CollectionResolutionReason,
  CollectionDetectContext,
  CollectionObservation,
  ActiveCollectionState,
} from './types';

export { makeCollectionId, makeItemId } from './types';

export {
  normalizeKey,
  normalizeTitle,
  normalizeItemContent,
  titleFromSpoken,
  inferCollectionType,
  tokenSimilarity,
  isLikelySameItem,
  COLLECTION_ALIAS_SEEDS,
} from './normalize';

export { splitItemEnumeration, itemsFromText, looksLikeImplicitItem } from './items';

export {
  emptyActiveState,
  activateCollection,
  touchActive,
  clearActive,
  evaluateActiveEligibility,
  canUseActiveForImplicit,
  pickActiveCollection,
  ACTIVE_SOFT_TTL_MS,
  ACTIVE_HARD_TTL_MS,
} from './active';

export {
  resolveCollection,
  resolveTarget,
  matchItems,
  contextFromDetect,
} from './resolve';

export { detectCollectionIntent, intentBlocksTaskCreate } from './intent';

export { tryStructuralMultiItemCapture } from './structuralCapture';
export type { StructuralCapture } from './structuralCapture';

export {
  emptyStore,
  applyCollectionIntent,
  createCollection,
  appendItems,
  completeItems,
  removeItems,
  updateItem,
  closeCollection,
  reopenCollection,
} from './service';
export type { CollectionStore, ApplyResult } from './service';

export {
  loadCollectionStore,
  saveCollectionStore,
  detectContextFromStore,
  applyAndPersistCollectionIntent,
  listOpenCollections,
  hydrateCollectionsFromRemote,
} from './localStore';

export {
  fetchCollectionStoreRemote,
  pushCollectionStoreRemote,
} from './remote';

export { resolveContextLink } from './contextLink';
export type { ContextLink } from './contextLink';
