# Travel day-window contract (Stage S1)

Dokkit Travel is a movement lens for keeping usable time honest. A trip day is not automatically an airport day: flight anchors shape a day only when a flight is connected to that day's itinerary.

## Effective window

- Start with the linked flight's landing clock plus the arrival buffer (45 minutes by default; clamp configured buffer to 0–180 minutes).
- Without a shaping arrival, use `day_start`; if absent, use the deterministic 08:00 fallback.
- End at a linked flight's departure clock when present; otherwise use `day_end`, then the deterministic 20:00 fallback.
- Usable duration is `max(0, effective end - effective start)`.
- An early departure can therefore shorten a day. A landing at 13:00 with a 45-minute buffer opens usable planning time at 13:45, not at a default morning start.
- Remaining minutes subtract pending stop estimates, their planned drives, and known drive-from-base time from that same effective window. Completed stops do not consume remaining capacity.

## Conflicts and display

Fixed-time conflict checks must start at the effective window start. When the window starts after landing, the arrival buffer is part of that start. The selected-day instrument should present the flight boundary (Land/Depart), effective opens/closes, usable duration, and conflict count without duplicating the itinerary or treating every trip day as flight-driven.

## Persistence and removal

A vault flight may remain evidence-only. Connecting a flight to the itinerary enables its time to shape the boundary day: landing shapes the first trip day and departure shapes the last trip day. Re-saving matching flight evidence/activity must update the existing records rather than duplicate them. Removing the only flight that shaped a boundary requires explicit confirmation before clearing the corresponding day anchor; cancelling preserves it as a manual anchor.

## Scope boundary

This contract is deterministic and local to travel day-window arithmetic. It does not alter travelPresence leisure/work rules, add place search or a Maps product, introduce a Today regime line, or implement later Travel stages.

## Today travel regime (Stage S6)

- Today loads the authenticated user's active trip, local today's trip-day row, and that day's activities together. The activity slice used for presence and flight detection is the same trip-day/user-scoped slice.
- Leisure-only presence remains non-blocking. Work-relevant presence is allocated from task capacity left after calendar and meeting commitments; the allocated amount is counted once as required work, not as a second calendar subtractor.
- For a work-intent trip day with a scheduled flight, Today intersects `resolveScheduledDayAnchor`'s effective window (including the arrival buffer) with configured work hours. A 13:00 landing plus 45-minute buffer cannot expose morning capacity.
- Today may show one quiet regime line for the active local trip day, linking directly to `/travel/[tripId]`. It is status/wayfinding only: no map, place search, stop editing, date mutation, or second travel dashboard.
- S7 offline and date mutations remain out of scope.
