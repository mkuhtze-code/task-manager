# Travel T2 — Vault bridges

## Contract

The vault remains a store of travel evidence; trip days and activities remain the itinerary. T2 bridges evidence to itinerary without adding a second itinerary UI.

- Re-saving flight evidence reuses its linked activity first, then matches a flight already present anywhere in the trip before creating a new activity.
- If the matched flight date changes, the existing activity moves to the matching trip day instead of leaving a duplicate on the previous day.
- Accommodation/booking evidence may optionally create one all-day `stop_kind: stay` activity on the exact check-in day. No fallback to the first day when the date does not match.
- Evidence is presented chronologically by event time, falling back to capture time if undated.
- Linked evidence provides a direct “View linked itinerary day” action.
- Flight arrival/departure day anchors remain governed by T0; only the first-day arrival and last-day departure can be shaped by a flight.
- No new database table or migration is required: the bridge uses existing `travel_documents.activity_id`, `travel_documents.trip_day_id`, and activity fields.

## Acceptance path

1. Save a flight with “Add as flight on the itinerary”; confirm a single flight stop appears on the matched day.
2. Save the same flight evidence again, including after changing its date; confirm the existing flight activity is reused and moved rather than duplicated.
3. Save a booking with a check-in date, check-out date, and location; leave the stay option off and confirm evidence-only behavior.
4. Enable “Add as a stay stop on the check-in day”; confirm one all-day Stay stop is linked to the evidence and shown on the matching day.
5. Expand linked evidence and use “View linked itinerary day”; confirm the trip page switches to that day.
6. Confirm the vault list is chronological, and undated evidence falls back to its capture timestamp.

## Scope exclusions

No routing/drive recalculation, Maps expansion, offline mutation support, multi-item capture, or broader trip redesign.
