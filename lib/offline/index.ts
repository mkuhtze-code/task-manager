export type {
  OfflineEntityKind,
  SyncOp,
  SyncOpAction,
  SyncOpStatus,
  OfflineSyncSnapshot,
} from './types';
export { makeClientOpId, makeSyncOpId } from './types';

export { isOnline, subscribeOnline } from './network';
export {
  enqueueOp,
  loadQueue,
  listPendingOps,
  pendingCount,
  markOpDone,
  markOpFailed,
  markOpSyncing,
} from './queue';
export {
  setEntityCache,
  getEntityCache,
  upsertEntityInCache,
  removeEntityFromCache,
  patchEntityInCache,
} from './entityCache';
export {
  registerSyncHandler,
  flushSyncQueue,
  startSyncOnReconnect,
  getLastFlushMeta,
} from './syncWorker';
export { getOfflineSnapshot, offlineStatusLabel } from './status';
export {
  cacheOpenTasks,
  loadCachedOpenTasks,
  localUpsertTask,
  localPatchTask,
  localRemoveTask,
  registerTaskSyncHandler,
} from './taskBridge';
