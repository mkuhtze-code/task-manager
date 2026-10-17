# Travel S3 — contextual place search

Find place is a single stop-finding surface for the selected trip day. It biases autocomplete only when the parent supplies valid coordinates (here, stay, stop, leg, or next), and sends optional locationBias/origin to Google Places. Missing coordinates leave search unbiased; the sheet does not request location permission or track location.

Categories narrow Google Places primary types. Add stop resolves place details and inserts at the requested leg slot; route recalculation remains the existing travel drive refresh. Directions opens Google Maps using the shared URL helper. No in-app navigation or Maps-style explore feed is introduced.

Acceptance: lib/travel/__tests__/placeSearch.test.ts covers bias payloads, missing coordinates, and insertion ordering. Validate selected-day add and leg insertion in the deployed app with a signed-in trip; provider credentials and Google Places response behavior remain runtime dependencies.
