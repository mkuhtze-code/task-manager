# Stage 4 — Primary actions update the day model live

**Status:** Implementation candidate updated; CI and device acceptance outstanding  
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

1. Task queue acceptance now requires the operation to be written and readable from local storage. If storage rejects the write, task bridge helpers do not mutate the cache first, and Today falls back to the direct online write path; failures there must remain visible and leave React state unchanged.
2. Accepted offline writes remain optimistic because the local queue is durable. The queue's existing pending/failed states and reconnect reconciliation still need end-to-end verification, including recovery after a rejected remote write.
3. Capacity should recalculate from the same task array; no parallel capacity cache should be introduced. Do not force a route remount or full app refresh.
4. The five-second `useNow` clock is used for Today derivation. Active elapsed-time display and capacity freshness are distinct: verify whether the header's capacity meaning requires a per-second tick before changing timer policy.
5. The Stage 3 branch now routes Done / Partial / Carry / Skip writes through the same durable task queue before updating local state, with direct Supabase fallback only when queue acceptance fails. Confirm this together with Stage 3 before calling the stages exit-complete.

## Acceptance still required

- [ ] Start / stop / complete update row and capacity without reload.
- [ ] Carry / skip remove work from today's visible set and respect next valid surface date.
- [ ] Estimate and intended-time changes recompute the same Stage 2 capacity source.
- [ ] Failed direct writes leave state unchanged and preserve editable input.
- [x] Local queue writes fail closed when browser storage rejects the write; a regression test covers queue-storage failure.
- [ ] Offline queued writes show truthful pending and recoverable failure/retry state.
- [ ] Reality Check Done / Carry and row actions agree on status and surface date.
- [ ] `scripts/check-non-negotiables.mjs`, typecheck, tests and production build pass.
- [ ] Device evidence recorded for the actions above, including light/dark and large text.

This is not a Stage 4 exit claim. CI execution, full action regression coverage, device acceptance, and offline pending/failure/retry UX remain open.
