# Travel S2 — Day-default surface completion

## Contract
- Opening a trip selects its initial day with `selectInitialTripDay`; selecting another day updates the day panel and that day's ordered stops.
- The day panel uses `resolveScheduledDayAnchor` as the only source of effective window boundaries. It always shows a usable-window glance, including ordinary non-flight days, available time, fit/spare, and any fixed-time conflict count.
- `Add stop` is the sole steel primary action. Day details opens the existing `DaySheet`; Vault, Map, Stay, Nearby, and Library remain secondary tools.
- Adding and editing a stop both pass the same effective day window to `presenceToSchedule`. Flight anchors apply only when a flight is scheduled on the selected itinerary day.
- `TripStopRow` retains its existing glance and state cues; no new row grammar or place-search scope is introduced.

## Acceptance checks
1. Cold-open a trip with days before, during, and after today; confirm today is selected when in range, otherwise the nearest trip boundary day.
2. Select a different day; confirm the selected day panel, flight-aware window, fit/conflicts, and stop list update together.
3. On a flight day landing at 13:00 with a 45-minute buffer and departure at 16:00, confirm all-day stop presence schedules to the 13:45–16:00 window (135 minutes).
4. Edit an existing stop to All day or Work hours and confirm the same effective window is used as when adding it.
5. On a non-flight day with stale arrival/departure fields, confirm the panel and scheduling use day_start/day_end, not flight anchors.
6. Confirm Add stop is the only steel primary action in the day instrument; Day details opens the existing DaySheet.

## Exclusions
No contextual Find place, autocomplete biasing, Today capacity line, offline behavior, multi-item capture, trip-date mutations, or S3 work.
