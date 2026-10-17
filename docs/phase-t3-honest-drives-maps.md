# Travel T3 — Honest drives and Maps handoff

## Contract

- The selected day is identified once in the day selector; the day panel does not repeat the date/day number or duplicate editable Land/Depart fields.
- Flight evidence saves to Vault only by default. The user must explicitly connect it to the itinerary; only then can flight anchors shape the day, and only when the user opts into using flight times as day boundaries.
- Ordinary days use their normal day start/end. Stored arrival/departure values without a connected itinerary flight are ignored by both the visible day context and the capture engine.
- The day panel shows flight timing only when a flight is actually scheduled; ordinary days do not display flight-specific labels or empty flight controls.

- A saved drive estimate is only trusted for the current stop order and coordinates. Recalculation clears previous leg estimates before computing the current route; failed or unmapped legs remain unknown rather than retaining stale values.
- Unknown drives must never render as `0m`. Existing schema defaults of zero are treated as the legacy unknown sentinel in the UI.
- The route calculation reports unknown legs with a source, destination, and reason so the surface can explain missing estimates.
- Each stop with coordinates or a location query offers an external Google Maps directions handoff. Coordinates take precedence over text so the intended destination is unambiguous.
- Fixed-time conflict checks must be conservative when route duration cannot be verified; unknown drives are not evidence that a schedule fits.
- No in-app turn-by-turn navigation.

## Acceptance

1. Recalculate a day with an unmapped stop between mapped stops. No stale drive duration remains for either adjacent leg; the stop is visibly marked as drive unknown.
2. Recalculate after manually reordering stops. The current order is used and old drive values are cleared before fresh estimates are applied.
3. Recalculate after changing a stop's coordinates or the day base. Previous estimates are not retained if a route cannot be recomputed.
4. Open Maps from a stop with coordinates; confirm the destination uses the stop coordinates.
5. Open Maps from a stop without coordinates but with a location string; confirm the query targets that location.
6. Confirm unknown drives never appear as `0m`, and fixed-time conflicts do not silently assume an unverifiable drive takes no time.
7. Save flight evidence without connecting it: it stays in Vault and does not change the day window. Connect it and explicitly enable flight boundaries: only that scheduled flight day may use those times.
8. Confirm the selected day date is not repeated in the day panel and ordinary days have no Land/Depart controls or flight-window label.

## Exclusions

No in-app turn-by-turn navigation, live radar, OTA booking, group collaboration, expense splits, AI itinerary generation, or broader trip redesign.
