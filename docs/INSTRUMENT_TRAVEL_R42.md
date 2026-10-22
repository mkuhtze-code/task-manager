# Dokkit Experience R4.2 — Travel visual design depth

Status: implementation candidate on `feat/instrument-travel-r42`. This phase is visual/presentational only. CI and device QA must pass before merge.

## 1. DOM/CSS audit: what still read as legacy

- The selected-day panel was composed inside a legacy `.trip-day-panel` with a separate horizontal day strip. R4.1 added Instrument classes, but its panel still carried a filled surface and oversized identity/pulse spacing.
- `TripStopRow` retained the legacy `.task-row`, `.task-main`, `.activity-meta` and `.activity-glance` presentation contract. Legacy background, 22px completion affordance, narrow drag handle and fixed-width glance rules were still inherited.
- The seven tools were outlined rounded pills, giving each tool the same visual weight and producing a button farm on narrow screens.
- The stop-capture sheet still used the global `.capture-sheet` glass/legacy token surface, legacy border and animation, and legacy text-field colors. Offline and date-editor chrome used inline legacy color/spacing values.

## 2. Trip-day hierarchy after R4.2

1. **Trip context** — existing trip title and back navigation remain in the header; date editing is still reachable from the Dates tool.
2. **Selected-day identity** — weekday and date, followed by the existing flight/day-window pulse, fit label, conflicts and meeting count. No selectors or calculations were changed.
3. **One primary** — the existing Add stop button remains the only steel primary in the day instrument.
4. **Secondary tools** — Find place, Vault, Map, Stay, Dates, Sort and Library remain available in one horizontally scrollable row. Text-only treatment, hairline separators and subdued ink demote them without hiding a capability.
5. **Stop stream** — flat full-width rows with hairline separators; kind/job context stays near the name, time/drive glance uses mono type, metadata is quieter, and completion/reorder controls have 44px targets. Maps, open-detail, completion, reorder and nearby-drive callbacks are unchanged.
6. **Depth** — the stop-capture sheet uses a scoped Instrument surface, tokenized fields, safe-area-aware padding and reduced-motion behavior. Existing stop capture semantics remain unchanged. Find place, Vault, stay/accommodation and map sheets remain on their existing components and handlers; they were not migrated to a new sheet primitive.

## 3. Overview parity

The existing TravelInstrument pattern remains: Place / Motion eyebrow, Travel identity, source-derived pulse and one entitlement-gated Plan trip primary. Trip ObjectRows, filters/date controls and adjacent delete action remain in the existing stream structure. The empty state does not add another Plan trip CTA.

## 4. Capabilities that remain reachable

- [x] Plan trip through the existing entitlement-gated flow.
- [x] Select a trip day from the existing day strip.
- [x] Add stop via the existing capture sheet.
- [x] Open a stop's detail.
- [x] Complete a stop.
- [x] Open the stop in Maps.
- [x] Reorder flexible stops in manual sort mode.
- [x] See stop kind, linked-job context, location/mapping state, fixed-time conflict and unverified drive context where applicable.
- [x] Open nearby-place search from the existing drive affordance or Find place tool.
- [x] Open Vault, Map, Stay, Dates, Sort and Library.
- [x] Open Day details / schedule and fit.
- [x] Delete a trip from the overview without wrapping delete inside the trip navigation link.

## 5. Logic preservation

No files in `lib/travel/*`, `lib/travelContext.ts`, `lib/travelPresence.ts`, `lib/travelSort.ts` or `lib/today/travelRegime.ts` were changed. No edits to `runCaptureDock`, `addActivity`, the engine gate, day-window/flight anchor math, drive legs, offline queue, Vault bridge, place-bias/ranking, calculate-day, create/update/delete/reorder semantics, or Today capture.

Changed trip-page markup only adds presentational class names and replaces inline legacy styles for the offline status and date-editor wrapper with scoped Instrument classes. All travel callbacks remain the existing callbacks.

## 6. Tests and verification

- Extended the Travel Instrument component tests for stable primary/tool test IDs and stop completion, detail opening, Maps URL and manual reorder affordances.
- CI status is not declared green until the GitHub workflow and Vercel checks complete.
- No real-device screenshot or physical-device QA is claimed by this source implementation.

## 7. Device QA checklist (required before merge)

- [ ] 390px viewport, portrait: day identity/pulse, one primary, horizontally scrollable tool strip, no horizontal page overflow.
- [ ] First and last tool reachable by touch and keyboard; every control target at least 44px.
- [ ] Dark mode: shell, stop stream, offline status and capture sheet retain contrast using Instrument tokens.
- [ ] Safe-area: capture sheet inputs and Add stop action remain above Android bottom navigation/system inset.
- [ ] Scroll-vs-dock: stream scrolls without being obscured by the shared system dock; sheet scrolls independently.
- [ ] Manual drag/reorder, complete, open detail, Maps handoff, Find place, Vault, Stay, Library, Dates and Day details.
- [ ] Reduced motion: no sheet animation or animated tool transitions.
- [ ] Desktop shell width/grid and shared GearMenu remain unchanged.

## 8. Residual visual debt

- Find place, Vault, accommodation/stay, day details and stop-detail sheets retain their existing component chrome; only the low-risk stop-capture sheet was brought into scoped Instrument styling.
- The horizontal tool strip is intentionally scrollable at narrow widths; device QA must verify discoverability and focus visibility.
- The legacy `.task-row` DOM remains as a compatibility wrapper, but its Travel appearance is reset by scoped Instrument rules. A later structural migration should only happen if needed and must not be bundled with this visual pass.

**STOPPED after R4.2 — engine gate not started.**
