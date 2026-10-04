# Dokkit Offline Architecture

**Principle:** Local is source of truth while working. Cloud is sync + multi-device.

## Modules (`lib/offline/`)

| Module | Role |
|--------|------|
| `queue` | Durable sync ops with `clientOpId` idempotency |
| `entityCache` | Last-known tasks/jobs/meetings for offline read |
| `syncWorker` | Flush queue when online; per-entity handlers |
| `taskBridge` | Task cache + local mutate + Supabase flush handler |
| `status` | Pending count + human label |

## Today integration (started)

1. After successful remote task fetch → `cacheOpenTasks(userId, tasks)`
2. On fetch failure → `loadCachedOpenTasks(userId)`
3. Boot: `registerTaskSyncHandler()` + `startSyncOnReconnect(userId)`
4. UI: `<OfflineStatusBar userId={...} />`
5. Next: route complete/capture/reorder through `localPatchTask` / queue

## Collections

Already local-first via `lib/collections/localStore`. Can share the same queue later.

## Not yet

- Full mutation path offline (complete / reorder / capture)
- Conflict UI beyond last-write-wins
- IndexedDB if localStorage quota becomes an issue
