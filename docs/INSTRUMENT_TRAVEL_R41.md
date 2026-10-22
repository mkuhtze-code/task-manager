# Dokkit Experience R4.1 — Travel visual parity

Status: implementation candidate. Automated checks and real-device visual QA must pass before merge.

## R4.1.1 — Current surface inventory and target

This is a source-based, screenshot-level block inventory. No new browser/device screenshot was captured in this implementation pass.

### Overview (/travel) before
- Legacy mobile header used `SurfaceHeaderIdentity` outside the Instrument component package.
- A featured-trip card could appear above filters while the same trip remained in the section stream.
- Filters and date carousel sat between the legacy header and the stream.
- Empty state repeated a second `Plan a trip` CTA.

### Overview target / after
- Shared Instrument identity: Place / Motion → Travel.
- Pulse: active count first, otherwise upcoming count, otherwise Clear; pulse metadata and attention remain supplied by `buildTravelSurfaceModel`.
- One full-width steel `Plan trip` primary, gated by existing `canTravel` and wired to existing `openCreate`.
- Existing date carousel and filters remain secondary controls; the trip list is the stream. Trip delete remains beside the row, outside its navigation link.
- Empty state no longer creates a competing Plan trip action.

### Trip day (/travel/[tripId]) before
- Trip identity and date edit action shared a legacy header with a peer-weight ellipsis tool button.
- Day strip used legacy surface tokens, followed by a compact panel with Add stop, window text, fit/conflict/meeting detail.
- Find place, Stay, Library, Vault and Map lived behind a trip-tools dialog, separate from the day primary.
- Stops used legacy task-row styling and metadata density.

### Trip day target / after
- Trip name stays as trip context; selected day is a dedicated Instrument identity.
- Pulse shows existing day-window/flight string, fit label, conflict count and meeting count.
- One full-width steel `Add stop` primary uses existing `setCaptureOpen(true)`.
- One horizontally scrollable, low-weight tools strip exposes Find place, Vault, Map, Stay, Dates, Sort and Library. Existing date editor and sort persistence handlers remain authoritative.
- Stops keep existing data and callbacks; only row wrapper and type/glance rhythm are restyled.

## Pulse maps

| UI field | Existing source / selector |
|---|---|
| Travel active count | `surface.active.length` from `buildTravelSurfaceModel({ trips, todayStr, stopCountByTrip })` |
| Travel upcoming count | `surface.upcoming.length` from the same surface model |
| Travel pulse metadata | `surface.pulseMeta` |
| Travel attention | `surface.pulseAttention` |
| Plan trip entitlement | `canTravel = entitlements.canUseTravel`; existing Pro redirect and `openCreate` preserved |
| Trip-day window/flight | Existing `dayAnchor` plus `hasScheduledFlight`, formatted in presentational `TripDayPanel` |
| Fit/conflicts/meetings | Existing `minutesLeftToday`, `overloaded`, `spareMins`, `fixedTimeConflicts`, `dayMeetingCount` passed into `TripDayPanel` |
| Add stop flow | Existing travel entitlement gate; primary calls `setCaptureOpen(true)` and opens the existing capture sheet |

## S1–S8 preservation

No files under `lib/travel/`, `lib/travelContext.ts`, `lib/travelPresence.ts`, `lib/travelSort.ts`, or `lib/today/travelRegime.ts` were modified. No day-anchor, arrival buffer, presence, drive-leg, vault bridge, offline queue, place bias/ranking, or Today travel regime logic was intentionally changed.

## Files changed
- `components/travel/TravelInstrument.tsx` — overview identity, pulse and primary.
- `components/travel/TravelToolsStrip.tsx` — presentational trip-day secondary tools.
- `components/TripDayPanel.tsx` — presentational day identity/pulse/primary/tools; supplied values and handlers retained.
- `components/TripStopRow.tsx` — adds presentation-only wrapper class; no handler changes.
- `app/travel/page.tsx` — mounts overview instrument, removes duplicate mobile featured card and empty-state create CTA.
- `app/travel/[tripId]/page.tsx` — wires tools to existing handlers, removes peer-weight tools dialog and moves date editing into the tools strip.
- `app/instrument-travel.css` — scoped Instrument-native Travel chrome and stop-row rhythm.
- `app/layout.tsx` — loads scoped Travel Instrument CSS.
- `components/travel/__tests__/travelInstrumentR41.test.tsx` — pulse, primary, trip-day and shared-gear regression tests.

## Travel engine files not modified
- `lib/travel/travelContext.ts`
- `lib/travel/driveLegs.ts`
- `lib/travel/placeSearch.ts`
- `lib/travel/planMutations.ts`
- `lib/travel/travelDocuments.ts`
- `lib/travel/travelOffline.ts`
- `lib/travel/travelSurface.ts`
- `lib/travel/travelVaultStorage.ts`
- `lib/travelSort.ts`
- `lib/travelPresence.ts`
- `lib/today/travelRegime.ts`

## Visual parity notes
- Travel now uses the same eyebrow/title/pulse/full-width steel-primary rhythm as Jobs and Meetings.
- Trip day uses the same orient-first hierarchy while preserving Travel-specific flight/window, fit, conflict and meeting truth.
- Horizontal day selector, flight-context string and movement tools remain domain-specific, not a separate visual system.
- No live browser screenshot or physical-device pass was available. Validate 320–390 CSS px, safe areas, horizontal tool-strip discoverability, drag/drop, sheets, dark mode and desktop grid before merge.

## Tests
- Added component tests for supplied pulse values, entitlement-gated Plan trip, Add stop, tools strip and absence of page-level GearMenu.
- Focused R4.1 test and existing travel-object, travel-context, drive-leg, place-search, offline and plan-mutation suites must pass in CI.
- CI results are pending; do not mark acceptance green until workflow succeeds.

## Residual risks
- The tools strip scrolls horizontally on narrow devices; confirm first/last actions are discoverable.
- Existing legacy styles for drag handles and `TravelLeg` may need scoped overrides after device QA.
- Component tests do not replace touch, keyboard-focus, safe-area or physical-device verification.

**STOPPED after R4.1. No Capture multi-act, dock redesign, TaskDetail migration or engine work included.**
