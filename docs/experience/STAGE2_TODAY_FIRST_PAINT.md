# Dokkit Stage 2 — Today first-paint audit

**Status:** Implementation candidate; device acceptance outstanding  
**Scope:** Today mobile-web presentation and copy only  
**Capacity authority:** Existing `TodayHeader` props and `lib/today/dayCapacity.ts` selectors

## Source-level audit

### Before

- The mobile header displayed a general work-time-remaining value, a segmented capacity bar and legend (Planned / Fixed / Free), plus visible map and settings controls.
- Fixed commitments were only listed after opening the Timeline disclosure in the header.
- The flexible task list began immediately after the header, so fixed commitments did not consistently precede flexible work.
- The empty-day title was “Clear day.”

### After

- The mobile header identifies Today and makes the existing usable-capacity value the primary signal: “About … left” or “No flexible time left.”
- The segmented meter and legend no longer compete with the capacity statement on the mobile first paint.
- Map and Settings remain available through Today tools instead of competing with date/capacity.
- Fixed commitments render as a chronological, quiet list before the flexible task stream whenever commitments exist. Each row presents time, title, and duration.
- Empty-day copy now reads “Your day is clear.”
- The existing Capture path, Reality Check path, task rows, route data, and selectors remain in place.

## Capacity / engine boundary

No capacity calculation, ordering algorithm, API, schema, task mutation, or Reality Check behaviour was intentionally changed. The UI formats the existing `usableMins` / capacity values and renders the existing `activeCommitments` selection. The commitment component sorts a presentation copy of the supplied rows by start time.

## Automated validation

- Updated the mobile Today header test for the type-first capacity message and secondary Map access.
- Added focused tests for chronological commitment display, duration labels, and empty-state omission.
- CI must confirm the non-negotiables copy guard, targeted regressions, typecheck, and production build.

## Device acceptance — not yet verified

No real-phone or high-fidelity device-lab run has been performed from this implementation session. Before merge, record screenshots and verify on a real phone or high-fidelity device lab:

- Portrait cold open: date and capacity legible within five seconds.
- Day with commitments and flexible tasks: commitments precede flexible work and the user can state what fits.
- Large text (120–130%): no clipping or loss of hierarchy.
- Light and dark themes: capacity remains the first clear instrument.
- Keyboard closed and safe area: bottom navigation remains clear of the system gesture area.

**Residual:** Stage 2 is not exit-complete until the device checks above are recorded and pass.
