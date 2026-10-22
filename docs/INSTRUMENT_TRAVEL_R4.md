# Dokkit Experience R4 — Travel composition + layout repair

Status: implementation candidate; automated CI and device QA remain required. STOPPED after R4 scope.

## Layout repair (Track A)

### Settings access
Root cause confirmed in the R3 source: `components/today/TodayInstrument.tsx` rendered only Capture as its primary action and rendered secondary actions only when supplied by `AppChrome`. That secondary slot contained Map / Reality check / route actions but no `GearMenu`, so Today lost the previous settings entry point during composition. The mobile Jobs/Meetings shell also had no shared header tools slot.

Fix: `AppChrome` now restores the existing `GearMenu` in Today's secondary action row and supplies a stable shell tools row for other mobile lenses. It uses the existing GearMenu destination/behavior and the authenticated user ID. Travel overview already retained its existing GearMenu. Gear remains secondary and does not replace the lens primary action.

### Width / viewport
Confirmed structural risk: `AppShell` originally declared only `min-width: 0` and `min-height: 100%` on the shell/body, while the mobile frame and desktop main wrappers are separate layout owners. This allowed inherited legacy max-width/margins and parent sizing to constrain a shell whose own body did not explicitly claim the available width. The shell also had no body bottom clearance, so a fixed dock could overlap final content.

Fix: `app/instrument-shell.css` now establishes explicit border-box sizing, `width:100%`, `max-width:none`, `min-width:0`, safe-area horizontal insets and dock clearance. Mobile workspace and desktop main wrappers are explicitly allowed to use available width. `app/instrument-r4-layout.css` provides scoped lens-tool and instrument width rules and is imported after the existing shell stylesheet. This intentionally avoids a global legacy CSS reset.

### Viewport validation limits
The code audit found distinct mobile and desktop shell trees in `components/AppChrome.tsx`; the repair addresses their width/clearance constraints without introducing a second app frame or changing viewport metadata. A running-browser computed-style audit was not available during this implementation pass. Therefore the precise contribution of any upstream legacy max-width selector and actual physical-device scaling is not yet confirmed; validate at 390px, full mobile height, and desktop width before merge.

## Travel overview + trip-detail first paint (Track B)

- Overview already renders Travel identity, pulse values derived from `buildTravelSurfaceModel`, a GearMenu, trip stream and existing Plan trip creation flow. These are preserved rather than duplicated in a second presentation wrapper.
- Trip detail retains the existing `TripDayPanel`, selected-day logic and existing stop-add control; keep Add stop as the one primary action and the existing travel tools available.
- No travel math or presence logic is intentionally modified in this PR.

## Pulse maps

- Today: existing day/load signal from Today selectors; Capture remains primary.
- Jobs: existing active/open count, attention/focus/completed metadata; New job remains primary when entitled.
- Meetings: existing live/today/ahead count and pulse metadata; Record remains primary when entitled.
- Travel: existing active/upcoming counts and pulse metadata from the travel surface model; Plan trip remains primary when entitled.
- Trip day: existing selected-day schedule/stop context; Add stop remains primary.

## Entitlement policy

No entitlement rules are changed. Existing conditional primary rendering and existing Pro gating remain authoritative. Settings is a secondary utility, not a substitute for an entitlement-controlled primary.

## S1–S8 preservation

No edits to travel window, travel presence, drive estimation, vault, offline queue, place-bias, or place-search algorithm modules are intended. This is a presentation/layout-only scope. Confirm through PR diff review before merge.

## Residuals

- CI/tests have not yet been run from this environment; do not treat the acceptance checklist as passed until GitHub Actions is green.
- Manual browser/device QA remains required: 390px viewport, full phone height and safe areas, desktop width, Settings menu operation on Today/Jobs/Meetings/Travel, dock clearance, and Travel Plan trip/Add stop behavior.
- Existing legacy page styles may still impose constraints on individual inner sections; inspect computed styles if any lens remains narrow.

## STOPPED after R4

No Capture multi-act work, dock redesign, TaskDetail migration, engine changes, or native-app work is included.
