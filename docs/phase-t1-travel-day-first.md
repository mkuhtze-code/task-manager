# Travel Phase T1 — Day-first trip surface

## Contract

- Opening a trip selects today when today is within the trip's day range, the first day for a future trip, and the last day for a trip that has ended.
- The selected day and its effective T0 window remain visible on the trip surface without opening Day details.
- Add stop is the single primary action. Trip tools remain secondary in the header; the duplicate bottom-of-list tools link is removed.
- Stop rows keep the existing canonical ordering and editing flow while presenting the stop title, kind, time/presence glance, drive information (including an unknown marker when the next leg cannot be estimated), and a quiet work/job association.
- Flight rows are visually locked as fixed-time anchors.
- The day instrument and stop-row markup live in `components/TripDayPanel.tsx` and `components/TripStopRow.tsx`; the trip page remains responsible for data loading, ordering, capacity, and interactions.

## Explicit exclusions

No new sorting algorithm, offline behavior, Today header changes, Maps expansion, multi-item capture, or broader trip redesign.

## Verification

The initial-day selection helper is unit-tested for in-range, future, past, and empty trips. Existing T0 arrival-window and fixed-time conflict tests remain in the same suite.
