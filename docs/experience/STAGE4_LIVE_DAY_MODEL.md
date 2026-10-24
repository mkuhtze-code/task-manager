# Dokkit Stage 4 — Live day-model refresh

**Status:** Residual implementation in progress; Stage 4 is not exit-complete.  
**Authority:** `docs/architecture/NON_NEGOTIABLES.md`, `docs/experience/STAGE2_TODAY_FIRST_PAINT.md`, Stage 3 Reality Check reshape path.

## Shared day-model source and refresh

`lib/today/dayCapacity.ts:deriveTodayCapacity` remains the only Today capacity selector. It consumes the current task array, meetings, calendar events, clock and work window. Today row models are projected from the same live task state. No parallel capacity cache or new scheduling algorithm is introduced.

`TodayPage` now has one `refreshDayModel` invalidation callback. Row actions and task-detail edits receive it through `createTodayTaskActions`; Reality Check Done, Partial, Carry and Skip call it after each accepted local mutation. The capacity memo includes the revision, so accepted actions explicitly invalidate the Stage 2 projection while task state remains authoritative. The existing `useNow(5000)` clock keeps active elapsed-time estimates moving; no second timer is introduced.

## Primary mutation inventory

| Action | Entry point | Mutation / API | Capacity selector invalidated? | List refresh? | Failure UI | Result |
|---|---|---|---|---|---|---|
| Start task | `TodayTaskRows` → `TodayPage` → `taskActions.startTask` | `status=active`, `started_at`; durable queue or Supabase update | Yes, after accepted local apply | Same task array patched immediately | Alert on direct write failure; state unchanged | **OK** source-level |
| Stop task | Row / active-task controls → `taskActions.stopTask` | `status=pending`, clear `started_at`, accumulate `logged_mins` | Yes, after accepted local apply | Same task array patched immediately | Alert on direct write failure; state unchanged | **OK** source-level |
| Complete / Done | Row and `TaskDetailSheet` → `completeTask`; Reality Check Done → reshape | `status=done`, logged/actual minutes, completion time; remove from open set | Yes | Removed from open set immediately after acceptance | Direct write failure returns false and retains task; Reality Check stays open on failure | **OK** source-level |
| Carry | Reality Check Carry; capture overflow carry | `status=pending`, clear active timer, next work `surface_date`, `due_today=false` | Yes for Reality Check; overflow mutates same task state | Same task array patched immediately | Reality Check alerts on direct write failure; overflow direct-write failure only logs **OK**: only locally queued or remotely persisted carries leave Today; failed writes stay visible with neutral recovery copy |
| Skip / remove from today | Reality Check Skip | Same pending + next-work-date patch as Carry; outcome label retained in close summary | Yes | Same task array patched immediately | Alert on direct write failure | **OK** source-level; Skip does not mark task done |
| Estimate change | `TaskDetailSheet` → `updateTask` | `estimate_mins` and task metadata | Yes | Same task array patched immediately | Save returns false; state unchanged on direct write failure | **OK** source-level |
| Schedule / intended time | `TaskDetailSheet` → `updateTask` | `surface_date` plus task metadata; intended-time UI needs verification | Yes for `surface_date` / estimate changes | Same task array patched immediately | Save returns false on direct write failure | **Partial**: confirm intended-time editor maps to the field used by Today |
| Reality Check Reshape success | `RealityCheckSheet` → `applyRealityUpdates` | Done / Partial / Carry / Skip patches, then evidence publication and close summary | Yes after each accepted patch | Same task array patched after each accepted outcome | Failed direct write alerts and leaves sheet open; prior successful outcomes are not batch-rolled-back | **Residual**: partial-batch retry needs device exercise |

## Fixed in this pass

- Added a single explicit day-model invalidation path for row actions, task-detail edits and Reality Check outcomes.
- Kept `deriveTodayCapacity` and the live task array as the only capacity source.
- Preserved no-state-change behavior when direct persistence fails.
- Prevented Reality Check from closing while its mutation batch is busy.
- Added a regression assertion that failed task-detail persistence does not trigger day-model invalidation.
- Kept the existing five-second clock for active elapsed-time projections.

## Residuals — Stage 4 remains open

1. **Device evidence missing.** Start, stop, complete, carry, estimate and schedule changes still need recorded real-device evidence for immediate capacity/list refresh, light/dark, large text and safe area.
2. **Queued remote failure visibility.** The app chrome already renders `OfflineStatusBar` on mobile and desktop; it reports pending/failed queue state and offers Retry sync when online. Device verification is still required to prove that forced remote failure is noticed and recovered in the real interaction. Durable local queue acceptance is pending intent, not server-confirmed completion.
3. **Carry overflow failure fixed in this pass.** The UI now applies carry state only for durable queue acceptance or a successful direct write. Failed rows remain on Today and receive neutral recovery copy.
4. **Reality Check partial batch.** If a later write fails, earlier accepted writes remain applied while the sheet stays open. Learning observations are now committed in `finally` only for task writes that were accepted, so a later failure does not discard earlier evidence or train on the failed row. Device verification must confirm retry remains understandable.
5. **Intended-time mapping.** Confirm the intended-time editor persists the field consumed by Today scheduling instead of assuming the estimate/date editor covers it.

## Acceptance record

- [x] One shared refresh callback wired to row/detail task actions and Reality Check outcomes.
- [x] Stage 2 `deriveTodayCapacity` retained as capacity authority.
- [x] Failed direct task-detail write leaves task state unchanged; regression assertion added.
- [ ] Start / stop / complete / carry update visible capacity + list without reload on device.
- [ ] Estimate and intended-time edits reflect the Stage 2 capacity source on device.
- [ ] Forced network failure and failed queued sync are visible and recoverable.
- [x] Carry overflow false-success path fixed: failed writes do not mutate local task state.
- [ ] Reality Check partial-batch retry tested on device.
- [ ] Non-negotiables guard, focused tests, typecheck and production build pass on this head.
- [ ] Record device screenshots or short recording.

**Exit:** Stage 4 remains open until unchecked items are completed or assigned a dated residual owner. No autonomous replanning is introduced, and no success is claimed before the relevant persistence boundary.
