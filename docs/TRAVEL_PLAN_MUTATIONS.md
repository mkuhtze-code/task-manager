# TRAVEL_PLAN_MUTATIONS — Stage S7 contract

## Date range changes

- `planTripDateRangeChange` is pure and deterministic. It validates the date range, enumerates each local calendar date without timezone drift, and identifies added dates, removed days, and activities on days that would be removed.
- Extending a trip creates only missing `trip_days`; existing day IDs and itinerary rows are retained.
- A shrink that would orphan activities requires explicit user confirmation. The confirmation states the affected day/stop counts and promises preservation.
- Every activity on a removed day is moved to the nearest retained date. Ties resolve to the earlier date. Existing activity IDs, status, text, links and timing fields are retained; order indices are appended after existing stops.
- The API creates destination days first, moves activities, verifies each removed day is empty, deletes only empty days, and updates the trip's range. It never deletes activities. Partial failures return an error and leave activity rows available for retry.

## Stop mutations and replay

- A newly created stop receives a client-generated UUID before queueing. Replay uses `upsert(..., onConflict: 'id')`, so the same queued create cannot create a second row.
- Updates, completion, reorder and cross-day move use stable activity IDs and deterministic field assignments. Replaying the same update converges on the same state.
- The shared offline queue's `clientOpId` deduplicates the same queued operation locally. Interrupted `syncing` operations remain retryable.
- Move/reorder invalidates drive values tied to the previous sequence and requests route recalculation when online. A route-refresh failure does not roll back or delete the activity.

## Offline reads

- The local travel cache is keyed by authenticated user and stores trip metadata, trip days, the last selected day, and per-day activity snapshots.
- A failed remote read falls back to the cached trip/day; the latest trip day is selected if no cached selection remains. The UI shows one quiet offline line.
- The cache uses existing localStorage utilities. It is device/browser-local and not encrypted, shared across devices, or guaranteed to survive browser storage eviction.

## Explicit limits

- Date-range edits are online-only; they are not part of the stop mutation queue.
- Travel creation queueing covers trip-detail capture, place/nearby insertion, and scheduling a Library item onto a day. Vault evidence workflows remain unchanged.
- This contract does not add background tracking, a Maps clone, multi-user collaboration, or S8 device polish.
