# TRAVEL_ACCEPTANCE — Stage S8 final hardening

## Purpose and stop condition

This is the acceptance record for the Dokkit Travel movement lens. It is not a travel-product roadmap. S8 adds regression protection and operational checks only. After S8 is accepted, stop: no S9, feature expansion, native-app work, continuous geolocation, Maps product, collaboration, OTA, or redesign of the overview/Today task list.

## Contract references

- [Travel day-window and Today regime contract](./TRAVEL_DAY_WINDOW.md)
- [S2 day-default surface contract](./phase-s2-day-default-surface.md)
- [Travel Vault contract](./TRAVEL_VAULT.md)
- [Travel Vault bridge contract](./phase-t2-travel-vault-bridges.md) — effective day boundaries, linked-flight shaping, Today work-hours intersection, and trip-local wall time.
- [Travel plan mutations and offline reliability](./TRAVEL_PLAN_MUTATIONS.md) — date-range preservation, confirmation, idempotent queue, cached plan and route invalidation.
- [Travel object experience](../components/__tests__/travelObjectExperience.test.tsx) — shared travel object visual/interaction contract.
- [Travel context tests](../lib/travel/__tests__/travelContext.test.ts) — clock arithmetic, effective windows, capacity and initial-day selection.
- [Today travel regime tests](../lib/today/__tests__/travelRegime.test.ts) — leisure/work distinction, work-hours intersection and capacity allocation.
- [Travel plan/offline tests](../lib/travel/__tests__/planMutations.test.ts) and [offline reconciliation tests](../lib/travel/__tests__/travelOffline.test.ts).
- [Offline queue tests](../lib/offline/__tests__/queue.test.ts) — replay/idempotency contract.

## Wall-time contract

Trip days are calendar dates in the itinerary's local context. The `HH:mm` fields `day_start`, `day_end`, `arrival_time`, and `departure_time` are trip-local wall-clock values supplied to the helpers; they are not UTC timestamps. Do not convert them through the browser/home timezone or round-trip them through `Date.toISOString()`. Date-range enumeration may use UTC for calendar-date stepping only. The pure helpers do not currently resolve an IANA timezone; any integration converting absolute instants to trip-local clock values must do so explicitly at the boundary.

Arrival buffer is applied on the same trip-local day. If landing plus buffer is at/after the effective end, that day has zero usable time; it must not silently roll to another date. Early departure caps the day. Today intersects a work-intent flight window with configured work hours and never creates morning capacity before a mid-afternoon landing.

## North-star acceptance checklist

- [x] **Land at 13:00:** linked landing with a 45-minute buffer opens usable planning at 13:45, not the default morning start.
- [x] **Day default:** without a linked flight anchor, the day uses configured `day_start`/`day_end`, then deterministic 08:00/20:00 fallbacks. Stale flight fields do not shape an ordinary day.
- [x] **Find place contract retained:** place search supports adding/locating a stop using current/day context; this stage does not redesign search or add map-product behavior.
- [x] **Vault bridge retained:** flight evidence can remain evidence-only; only a linked itinerary flight shapes a day. Existing evidence reconciliation/confirmation behavior remains in scope as a regression invariant.
- [x] **Drives/offline:** route estimates are invalidated after reorder/move; route refresh failure does not undo a stop mutation. Cached plan is labelled as offline; queued stop mutations reconcile by stable identity. Date-range edits remain online-only.
- [x] **Leisure is not a Today block:** leisure-only presence does not block task capacity. Work presence is allocated only from remaining capacity after calendar/meeting commitments and is counted once.
- [x] **Evening landing:** landing at 18:30 with a 45-minute buffer starts at 19:15; a 20:00 end leaves 45 minutes. If landing plus buffer is beyond the effective end, usable time is zero.
- [x] **Early departure:** a 09:00 departure caps the day; Today uses the intersection with configured work hours.
- [x] **Timezone safety:** trip-local `HH:mm` values remain wall-clock values and are not silently shifted to home/browser timezone.
- [ ] **Manual device/browser smoke:** follow the runbook below and record the observed build/device/browser before release. This was not executed by the automated repository workflow.

## Automated CI coverage audit

The configured `package.json` build and `ci` scripts include:
- `test:travel-day` — travel context and travel document pure tests.
- `test:today-travel` — Today travel regime and capacity composition.
- `test:travel-plan` — date-range planner and offline mutation reconciliation.
- `test:offline` — shared queue replay/idempotency tests.
- `test:travel-object` — Travel object experience regression.
- `typecheck` (CI) and `next build` (build).

The S8 additions extend existing test files already referenced by these scripts, so no new test command can accidentally be omitted from CI. A green CI run is required for merge; test inclusion alone is not evidence that the current run passed.

## Manual smoke runbook

Record date, commit/deployment, browser/device, and result for each item. Do not mark an item passed without performing it.

### Desktop browser — online then offline

1. Open a multi-day trip and select a day with a linked flight. Verify the displayed boundary and usable window match the trip-local clock.
2. Use a 13:00 landing. Verify the usable start is 13:45 with the default buffer and that no morning capacity is shown.
3. Test an early departure. Verify the day closes at departure and Today is intersected with work hours.
4. Open Find place using the current/day context; add a stop and verify it appears on the selected trip day without changing the day window.
5. Verify a vault flight saved as evidence-only does not shape the day until linked to the itinerary. Confirm the existing removal-confirmation behavior for a shaping flight.
6. Reorder and move a stop across days. Verify ordering, stable stop identity, and refreshed drive estimates; a route refresh failure must not lose the stop.
7. Shrink a date range containing stops. Confirm the warning lists affected stops; confirm and verify stops move to retained days and are not deleted.
8. With a saved trip loaded, disable network access. Verify the offline cue appears, cached trip/day/stops remain visible, and a create/update/complete/reorder/move action queues locally. Restore network and verify the queued action syncs once without duplicates.
9. Verify a leisure-only day does not reduce Today task capacity. Verify work presence only consumes remaining capacity after calendar/meeting commitments.
10. Restore network and reload. Verify persisted plan and route state are coherent.

### Mobile browser — online then offline

1. Repeat the 13:00 landing and early-departure checks in a narrow viewport; verify the day boundaries remain legible and unchanged.
2. Use Find place and add a stop; verify selection context is preserved and the sheet does not cause a different day to be edited.
3. Reorder/move a stop and verify the source/destination lists update without duplicate rows.
4. Enable airplane mode or browser offline emulation after loading the trip. Verify the cached plan/offline cue and queued stop mutation behavior.
5. Reconnect, wait for queue sync, and reload. Verify no duplicate stop and no lost completion/order/move.
6. Verify date-range mutation remains clearly unavailable offline rather than appearing to succeed.

### Manual result record

- Desktop browser/build: **NOT RUN — pending manual acceptance**
- Mobile browser/build: **NOT RUN — pending manual acceptance**
- Offline reconnect/replay: **NOT RUN — pending manual acceptance**

## Residual limits (intentional)

- Pure wall-clock helpers do not resolve IANA timezone identifiers or convert absolute flight instants. Inputs must already be in the trip-local date/time context.
- Offline snapshots use browser local storage; they are device-local, unencrypted by this feature, and may be evicted.
- Date-range edits remain online-only. The S7 date-range API uses retry-safe sequential writes rather than a single transaction; concurrent range edits can race because there is no unique constraint on `trip_days(trip_id, date)`.
- Stop deletion is not in the S7 offline queue. This acceptance stage does not change that behavior.
- Automated tests cannot establish visual or real-network device behavior; the manual smoke runbook remains outstanding until actually performed.
