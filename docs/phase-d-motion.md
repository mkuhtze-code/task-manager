# Phase D — dynamic immersion

## Intent

Motion is a short response to a real state change, not decoration. Phase D reuses existing Today task progress, fit/pressure classes, capacity tracks, and surface pulse. No new runtime animation system or dependency is introduced.

## Elements and properties

| Element / selector | Animated properties | Duration |
|---|---|---:|
| `.task-card-progress-fill`, `.reveal-time-fill`, `.task-progress-fill` | `width` | 200ms, ease-out |
| `.task-card-active-dot` | `opacity`, `background-color` | 180ms, linear |
| `.task-card.surface-object::before` | `background-color`, `opacity`, `width` | 180ms, ease-out |
| TaskCard fit/overtime/due classes | `border-color`, `background-color`, `opacity` | 180ms, ease-out |
| `.meeting-row`, `.trip-row-maybach` | `background-color`, `border-color`, `box-shadow` | 160ms, ease-out |
| `.meetings-featured`, `.travel-featured` | `background-color`, `border-color`, `box-shadow` | 160ms, ease-out |
| `.surface-pulse` | `background-color`, `border-color` | 180ms, ease-out |
| Existing Today capacity track fills | `width`, `background-color` | 180–200ms, ease-out |

No transform or layout property is animated by this phase. The active-task dot's previous infinite pulse is disabled; its presence remains a static live-state signal.

## Reduced motion

Under `@media (prefers-reduced-motion: reduce)`, all Phase D transitions are set to `none !important` and animations are disabled. The shared existing reduced-motion foundation remains intact; this file adds explicit coverage for the Phase D selectors.

## Interaction and data

Transitions never gate handlers or wait for animation completion. Task timing, progress calculations, pressure classification, fit classification, capacity values, Reality Check, capture, and entitlements are unchanged. No JavaScript animation library is used.

## Explicit non-goals

- No primary navigation or Phase B header copy/structure changes.
- No Phase C collapsed row content/anatomy changes.
- No Today cockpit redesign or Phase E navigation/wayfinding work.
- No page-enter, list-reorder, sheet spring, celebration, glow, or continuous pulse animation.
- No data model, mutation path, routing, capture, Reality Check, or entitlement changes.
- No Android/native animation parity.

## Manual verification still required

Check start/stop on a timed Today task, task completion, and Meetings pressure styling with reduced motion both off and on. Confirm that list rows do not shift due to transitions. Automated repository edits do not substitute for device-level visual verification.
