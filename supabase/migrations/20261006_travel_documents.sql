-- Travel documents: bookings, flights, tickets, emails, notes for a trip.
-- Work-first travel vault — structured evidence, not a second itinerary.

create table if not exists travel_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id uuid not null references trips(id) on delete cascade,
  trip_day_id uuid references trip_days(id) on delete set null,
  doc_type text not null default 'note'
    check (doc_type in ('flight', 'booking', 'ticket', 'email', 'note', 'other')),
  title text not null,
  body text,
  reference_code text,
  carrier text,
  location_text text,
  starts_at timestamptz,
  ends_at timestamptz,
  storage_path text,
  original_filename text,
  activity_id uuid references activities(id) on delete set null,
  source text not null default 'manual'
    check (source in ('manual', 'paste', 'speech', 'upload')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists travel_documents_trip_id_idx on travel_documents (trip_id);
create index if not exists travel_documents_user_id_idx on travel_documents (user_id);

alter table travel_documents enable row level security;

drop policy if exists "own travel documents" on travel_documents;
create policy "own travel documents" on travel_documents
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table trips add column if not exists intent text not null default 'work';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'trips'::regclass and conname = 'trips_intent_check'
  ) then
    alter table trips
      add constraint trips_intent_check
      check (intent in ('work', 'personal'));
  end if;
end $$;
