# Travel vault + work-first trips

## What landed

1. **`travel_documents` table** — flights, bookings, tickets, emails, notes per trip (RLS by user).
2. **`trips.intent`** — `work` | `personal`, default **work**.
3. **`TravelVaultSheet`** — paste confirmation / email / speech → structured vault entry.
4. **Trip detail** — **Vault** button next to Add stop.
5. **Plan a trip** — defaults to **Work** intent and persists `intent` on create.
6. **Engine travel context** — same speech/ANSWER capacity as jobs, scoped to the active trip day.
7. **Auto flight → itinerary** — vault flights create a `activity_type: flight` stop on a matched trip day.

## Engine travel context

- `lib/travel/travelContext.ts` — day window + remaining mins from stops/drives
- `InteractionInput.context.travel` + `ReasoningContext.travel`
- `runCaptureDock` accepts `travel` + `interfaceName: 'travel'`
- Trip detail **Add stop** runs `runCaptureDock` before insert:
  - feasibility questions → **ANSWER** (no mutation; message in sheet)
  - structured phrases → interpret location/job, then insert activity
- ANSWER uses trip-day remaining capacity (same V3 fit path as work)

## Auto flight → activity

- `extractFlightSchedule` / `buildFlightActivityDraft` in `lib/travel/travelDocuments.ts`
- On vault **Save** with type **Flight** and “Add as flight on the itinerary” checked:
  1. Parse flight number, route (AKL→WLG), depart time, date / weekday against trip days
  2. Insert `activities` row (`activity_type: flight`, fixed time when known)
  3. Link `travel_documents.activity_id` + `trip_day_id`
  4. Trip page selects that day and reloads stops
- Uncheck the box to store evidence only (no itinerary row)

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
