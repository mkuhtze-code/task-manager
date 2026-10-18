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

## Travel plan mutations and reliability (Stage S7)

- `planTripDateRangeChange` is a pure planner. Extending a trip creates only missing dates. Shrinking explicitly lists removed days and activities that would be orphaned.
- A shrink that affects activities requires explicit confirmation. Activities are moved to the nearest remaining date, appended after existing stops, and never deleted as part of a date-range change. Empty removed days are deleted only after a fresh query confirms no activities remain.
- The authenticated date-range endpoint creates destination days before moving stops and updates the trip range after stop preservation. The operation is retryable after partial failure: existing days are reused, moved activities no longer remain on removed days, and removed days are deleted only when empty.
- Travel create uses a client-generated stable activity UUID and queued `upsert` on that UUID. Update, completion, reorder, and move are queued as idempotent field updates. Replaying an operation therefore updates the same row rather than inserting a second stop.
- The travel snapshot stores the trip, trip days, selected day, and per-day activity lists in the existing offline entity cache. When remote reads fail, the selected cached day is shown; if no selected-day value is available, the latest trip day is selected. A quiet offline status line labels the cached view.
- Move and reorder invalidate drive estimates and request a fresh day-route calculation when online. A failed route refresh is not allowed to undo or delete the stop mutation.
- The offline cache is browser local storage, not an encrypted or cross-device database. Offline range edits and offline trip creation remain unsupported; S7 queues stop-level create/update/complete/reorder/move only.


## Wall-time and timezone contract (Stage S8)

- `trip_days.date` is a calendar date for the trip itinerary, not a UTC instant. Date-range enumeration may use UTC internally only to step through ISO calendar dates without DST-length-day drift; it must not convert a trip's clock values.
- `day_start`, `day_end`, `arrival_time`, and `departure_time` are `HH:mm` trip-local wall-clock values. The day-window helpers treat these as already-local values and calculate minute-of-day arithmetic. They must not parse them as timestamps, append a timezone, or round-trip them through `Date.toISOString()`.
- A UI/API boundary must preserve the trip-local date and clock strings as separate values. It must not silently reinterpret a destination's 13:00 landing as 13:00 in the user's home timezone or shift it by the browser's UTC offset.
- The current pure day-window helpers do not resolve an IANA timezone or convert instants between zones. Flight/commitment integrations must supply the correct trip-local date and wall-clock values. If a future integration only supplies an absolute instant, timezone conversion must be explicit and tested at that integration boundary before writing these fields.
- Arrival buffers are applied to the trip-local landing clock on the same itinerary day. If the buffered start is at or after the effective end, usable duration is zero; the helper does not silently roll planning time into the next date.
- Early departures cap the effective end. Today intersects a work-intent flight-shaped day with configured work hours; a landing after work hours yields a zero-length Today window, not morning capacity.

### S8 automated regression coverage

- `lib/travel/__tests__/travelContext.test.ts`: afternoon/evening arrivals, early departures, same-day zero usable time, and unshifted `HH:mm` arithmetic.
- `lib/today/__tests__/travelRegime.test.ts`: landing-buffer/work-hours intersection, early departure intersection, zero-length after-hours arrival, and protection against stale/personal flight anchors.
- CI/build scripts already include `test:travel-day` and `test:today-travel`; S7's `test:travel-plan` remains in the configured build/CI pipeline.
