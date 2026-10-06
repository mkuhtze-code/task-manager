# Travel vault + work-first trips

## What landed

1. **`travel_documents` table** — flights, bookings, tickets, emails, notes per trip (RLS by user).
2. **`trips.intent`** — `work` | `personal`, default **work**.
3. **`TravelVaultSheet`** — paste confirmation / email / speech → structured vault entry.
4. **Trip detail** — **Vault** button next to Add stop.
5. **Plan a trip** — defaults to **Work** intent and persists `intent` on create.

## Apply migration

Run in Supabase SQL editor (or your migration pipeline):

`supabase/migrations/20261006_travel_documents.sql`

## Not yet (next)

- Wire Capture / `processInteraction` with full travel context (active trip, days)
- File upload to Storage on documents
- Auto-create flight **activity** from vault flight
- Native Travel shell

## Product rule

Vault stores **evidence** of the trip. Itinerary stays in days/activities. Jobs stay the home of work files; vault holds travel artefacts.
