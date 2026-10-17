# Travel vault + work-first trips

## What landed

1. **`travel_documents` table** — flights, bookings, tickets, emails, notes per trip (RLS by user).
2. **`trips.intent`** — `work` | `personal`, default **work**.
3. **`TravelVaultSheet`** — paste confirmation / email / speech → structured vault entry.
4. **Trip detail** — **Vault** is available through **Trip tools**; Add stop remains the single primary action.
5. **Plan a trip** — defaults to **Work** intent and persists `intent` on create.
6. **Engine travel context** — same speech/ANSWER capacity as jobs, scoped to the active trip day.
7. **Auto flight → itinerary** — vault flights create a `activity_type: flight` stop on a matched trip day.

## Trip-day temporal contract (T0)

- `resolveDayAnchor` in `lib/travel/travelContext.ts` is the single source of truth for a day's usable window.
- A local landing time starts usable time **45 minutes later** by default. The buffer is clamped to 0–180 minutes.
- If there is no landing time, use `day_start`, then 08:00. The end uses departure time, then `day_end`, then 20:00.
- Capacity, engine context, and fixed-time conflict checks use this same effective window. Arrival/departure clocks remain local wall-clock values.
- The trip-day header shows landing/departure, effective opening/closing, usable minutes, and editable arrival/departure clocks.
- Saving a flight with “Shape this day from flight times” updates the first-day arrival or last-day departure anchor. It defaults on for first/last trip days and off for middle days. Re-saving a matching flight updates its itinerary activity and vault record instead of adding duplicates. Deleting a flight that set a day anchor asks whether to clear that anchor or keep it as a manual time.

## Engine travel context

- `lib/travel/travelContext.ts` — day window + remaining mins from stops/drives
- `InteractionInput.context.travel` + `ReasoningContext.travel`
- `runCaptureDock` accepts `travel` + `interfaceName: 'travel'`
- Trip detail **Add stop** runs `runCaptureDock` before insert:
  - feasibility questions → **ANSWER** (no mutation; message in sheet)
  - structured phrases → interpret location/job, then insert activity
- ANSWER uses trip-day remaining capacity (same V3 fit path as work)

## Vault → itinerary bridges (T2)

- Flight evidence can create or update one `activity_type: flight` anchor. A re-save first reuses the document's `activity_id`, then looks for a matching flight across the trip's days before inserting. Moving the flight updates its day rather than leaving a duplicate behind.
- Flight evidence links `travel_documents.activity_id` + `trip_day_id`; **Shape this day from flight times** updates only the first-day arrival or last-day departure anchor.
- Booking evidence can optionally be added as one all-day `stop_kind: stay` stop on its check-in day. It is an itinerary place, not a task. The evidence retains the check-in/check-out window and location.
- The vault list is chronological by event time, falling back to capture time for undated evidence. Linked evidence exposes **View linked itinerary day**; the vault remains the evidence store, not a second itinerary.
- Unchecking the box to store evidence only does not create an itinerary row.

## Apply migration

Run in Supabase SQL editor (or your migration pipeline):

`supabase/migrations/20261006_travel_documents.sql`

## Not yet (next)

- File upload to Storage on documents
- Trip-day meetings into `processInteraction`
- Native Travel shell
- Continuous voice on trip surface (`speech_transcript` already supported by the contract)

## Product rule

Vault stores **evidence** of the trip. Itinerary stays in days/activities. Jobs stay the home of work files; vault holds travel artefacts. Flights may bridge both when the user opts in.

T2 acceptance tests for stay drafts, idempotent activity matching, and chronological evidence ordering live in `lib/travel/__tests__/travelDocuments.test.ts` and run through `test:travel-day`.
