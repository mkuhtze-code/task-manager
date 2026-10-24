# Stage 4 — Primary actions update the day model live

**Status:** Source audit / implementation candidate; device acceptance outstanding  
**Authority:** `docs/architecture/NON_NEGOTIABLES.md`, `docs/LAYOUT_SYSTEM.md`, Stage 2 Today first-paint contract

## Shared day-model path

Today capacity is derived in `lib/today/dayCapacity.ts` by `deriveTodayCapacity`. It receives the current task array, meetings, calendar events, clock, work days, and work window; it produces `visibleTasks`, `availability`, and `taskCapacity`. Today header props and task row models are derived by `components/today/TodayPage.tsx` from this live state. Stage 2's contract explicitly keeps `lib/today/dayCapacity.ts` as capacity authority.

Primary task actions are assembled in `lib/today/taskActions.ts` and injected from Today:
- Start: persist/queue `status=active` and `started_at`, then patch `tasks` state; publish the active-task event.
- Stop: persist/queue `status=pending`, clear `started_at`, add elapsed minutes to `logged_mins`, then patch `tasks` state; publish the stopped event.
- Complete: persist/queue `status=done`, clear `started_at`, store logged/actual minutes and completion time, then remove from the open `tasks` state and publish completion.
- Estimate / schedule edit: persist/queue task metadata, then patch `tasks` state. The same array drives the capacity selector and row models.
- Carry / skip: Today and Reality Check currently use their existing task patch paths; these must be checked for status + `surface_date` parity before claiming the full Stage 4 contract.

## Findings and residual risks

1. The normal online path awaits Supabase success before updating React task state. A failed direct write returns early with an error alert; no success state is published.
2. When `queueTaskPatch` accepts a write, the UI applies the local task patch immediately. This is an optimistic/offline path; it is only honest if the offline queue exposes pending/failure state and reconciliation. Verify that behaviour on device and against `lib/offline` before exit.
3. Capacity should recalculate from the same task array; no parallel capacity cache should be introduced. Do not force a route remount or full app refresh.
4. The five-second `useNow` clock is used for Today derivation. Active elapsed-time display and capacity freshness are distinct: verify whether the header's capacity meaning requires a per-second tick before changing timer policy.
5. Stage 3 reshape currently patches local `tasks` state in its outcome branches. The paths should be tested against the same capacity selector; do not add a second optimiser.

## Acceptance still required

- [ ] Start / stop / complete update row and capacity without reload.
- [ ] Carry / skip remove work from today's visible set and respect next valid surface date.
- [ ] Estimate and intended-time changes recompute the same Stage 2 capacity source.
- [ ] Failed direct writes leave state unchanged and preserve editable input.
- [ ] Offline queued writes show truthful pending and recoverable failure/retry state.
- [ ] Reality Check Done / Carry and row actions agree on status and surface date.
- [ ] `scripts/check-non-negotiables.mjs`, typecheck, tests and production build pass.
- [ ] Device evidence recorded for the actions above, including light/dark and large text.

This audit is not a Stage 4 exit claim. Device acceptance and the offline queue's pending/failure UX remain open.
