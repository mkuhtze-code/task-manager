-- Run this in the Supabase SQL editor for a fresh database.
-- For an existing database, use the migration section below instead.

create extension if not exists pgcrypto;

-- ── User settings (one row per user) ─────────────────────────────
create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  day_length_mins int not null default 480,
  work_start time not null default '08:00',
  work_end time not null default '16:00',
  work_days int[] not null default '{1,2,3,4,5}',
  notification_style text not null default 'default' check (notification_style in ('default', 'silent')),
  sort_mode text not null default 'capacity_first' check (sort_mode in ('capacity_first', 'due_today_first', 'manual', 'oldest_first', 'newest_first', 'geo_aware')),
  travel_sort_mode text not null default 'what_fits' check (travel_sort_mode in ('what_fits', 'close_to_accom', 'nearby_me', 'manual')),
  account_tier text not null default 'free' check (account_tier in ('trusted_tester', 'free', 'premium')),
  onboarded boolean not null default false,
  theme text not null default 'system',
  timezone text,
  home_location_text text,
  home_lat double precision,
  home_lng double precision,
  work_location_text text,
  work_lat double precision,
  work_lng double precision,
  updated_at timestamptz not null default now()
);

-- ── Task types (used later for time-estimate learning) ───────────
create table if not exists task_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  keywords text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ── Jobs (a persistent container for one real-world piece of work) ──
-- A Job groups Tasks across days and carries optional lightweight context
-- (client, location). It has no dates, status, priority, estimates or
-- lifecycle of its own — everything shown about a Job is either raw
-- context here or derived from its Tasks. client and location are
-- attributes of a Job, not what defines one; no CRM concepts.
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  client text,
  location_text text,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);

-- ── Tasks ────────────────────────────────────────────────────────
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'done')),
  source text not null default 'planned' check (source in ('planned', 'came_up')),
  estimate_mins int not null default 15,
  logged_mins numeric not null default 0,
  actual_mins int,
  started_at timestamptz,
  due_today boolean not null default false,
  surface_date date,
  location_text text,
  lat double precision,
  lng double precision,
  task_type_id uuid references task_types(id) on delete set null,
  -- Optional link to a Job. Purely additive: a Task's own scheduling,
  -- location, status and ordering continue to drive Today/Travel exactly
  -- as before; a Job is context, never a constraint. On job delete the
  -- tasks are detached (set null), never deleted.
  job_id uuid references jobs(id) on delete set null,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  near_notified boolean not null default false,
  over_notified boolean not null default false,
  last_overdue_ping_at timestamptz,
  drive_mins_to_next int not null default 0,
  route_polyline text,
  -- Freeform information the person would write underneath this task on
  -- paper (e.g. "1200 opening / 0.55 BMT / black screws"). Plain text,
  -- intentionally unstructured. Capture first, interpret later.
  info text
);

-- ── Subtasks ─────────────────────────────────────────────────────
create table if not exists subtasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references tasks(id) on delete cascade,
  text text not null,
  mins int not null default 0,
  done boolean not null default false,
  order_index int not null default 0,
  created_at timestamptz not null default now()
);

-- ── Meetings ─────────────────────────────────────────────────────
create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  duration_mins int not null,
  start_time timestamptz,
  source text not null default 'manual' check (source in ('manual', 'outlook')),
  created_at timestamptz not null default now()
);

-- ── Calendar connections ─────────────────────────────────────────
-- Provider-independent external calendar links (Microsoft first, Google
-- later). A user may hold several connections (work + personal). Tokens
-- are AES-256-GCM ciphertext encrypted with CALENDAR_TOKEN_ENCRYPTION_KEY
-- (see lib/calendar/tokens.ts); column names are unchanged so this stays
-- purely additive to existing installs.
create table if not exists calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'microsoft',
  provider_account_id text not null,
  connected_email text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scopes text,
  sync_status text not null default 'ok' check (sync_status in ('ok', 'error')),
  sync_error text,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ── Time logs ────────────────────────────────────────────────────
create table if not exists time_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  task_type_id uuid references task_types(id) on delete set null,
  duration_mins int not null,
  logged_at timestamptz not null default now()
);

-- ── Push subscriptions ───────────────────────────────────────────
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ── FCM web push tokens (browser Firebase Cloud Messaging) ───────
-- Separate from push_subscriptions: an FCM registration token is a
-- different artifact from a PushSubscription (plain token string vs
-- endpoint/p256dh/auth keys). One globally-unique row per token so a
-- browser re-registering idempotently updates its own row; ownership is
-- the standard "own fcm tokens" RLS policy and rows cascade away with the
-- account. Tokens belong to the authenticated Dokkit account only — a
-- registration can never be re-claimed by another user (enforced in
-- lib/fcm/registration.ts).
create table if not exists fcm_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null default 'web' check (platform in ('web')),
  user_agent text,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists fcm_tokens_token_key on fcm_tokens (token);
create index if not exists fcm_tokens_user_id_idx on fcm_tokens (user_id);

-- ── Feedback ─────────────────────────────────────────────────────
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  submitter_email text,
  message text not null,
  is_anonymous boolean not null default false,
  page_context text,
  user_last_read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── Feedback replies (threads between a user and the team) ───────
create table if not exists feedback_replies (
  id uuid primary key default gen_random_uuid(),
  feedback_id uuid not null references feedback(id) on delete cascade,
  author_type text not null check (author_type in ('user', 'admin')),
  author_id uuid references auth.users(id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);

-- ── Admins ───────────────────────────────────────────────────────
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ── Account status (signup gate + admin account controls) ───────
-- One row per authenticated user. Created lazily by
-- /api/account/initialize (open signup: every authenticated Supabase
-- user becomes 'active' on first initialization). Admins flip status to
-- 'terminated', which lib/verifyUser.ts enforces on every privileged
-- service-role route. admin_notified_at is a one-shot claim marking that
-- the "new user joined" admin push has been sent.
--
-- Accessed exclusively through the service-role client; no client-side
-- reads or writes exist, so RLS is enabled with no policies — only the
-- service role can touch this table.
create table if not exists account_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'terminated')),
  admin_notified_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ── Trips ────────────────────────────────────────────────────────
create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now()
);

-- ── Trip days (one itinerary per calendar day of a trip) ─────────
create table if not exists trip_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  date date not null,
  day_start time not null default '08:00',
  day_end time not null default '20:00',
  base_location_text text,
  base_lat double precision,
  base_lng double precision,
  arrival_time time,
  departure_time time,
  drive_from_base_mins int not null default 0,
  route_polyline text,
  notes text,
  created_at timestamptz not null default now()
);

-- ── Activities (the slots that make up a trip day) ───────────────
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  trip_day_id uuid not null references trip_days(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  activity_type text not null default 'stop' check (activity_type in ('stop', 'drive', 'flight', 'other')),
  estimate_mins int not null default 30,
  drive_mins_to_next int not null default 0,
  location_text text,
  lat double precision,
  lng double precision,
  order_index int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'done')),
  time_type text not null default 'flexible' check (time_type in ('flexible', 'fixed')),
  fixed_time time,
  route_polyline text,
  created_at timestamptz not null default now()
);

-- ── Accommodations (a stay within a trip) ────────────────────────
create table if not exists accommodations (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  location_text text not null,
  lat double precision not null,
  lng double precision not null,
  check_in_date date not null,
  check_out_date date not null,
  arrival_time time,
  departure_time time,
  created_at timestamptz not null default now()
);

-- ── Trip Library (a trip's basket of "maybe we should do this") ───
-- Deliberately loose: no dates, times, estimates, status or ordering —
-- those belong to the scheduled activity. A Library item is only a
-- trip-specific possibility, copied into an activity when scheduled.
-- activities.library_item_id is pure provenance: deleting a Library
-- item nulls the link but never deletes the scheduled activities.
create table if not exists trip_library_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  location_text text,
  lat double precision,
  lng double precision,
  notes text,
  created_at timestamptz not null default now()
);

-- ── Waitlist signups (requesting access) ─────────────────────────
create table if not exists waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

-- ── Allowed signup emails (approval gate) ────────────────────────
create table if not exists allowed_signup_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

-- ── Error log (server + client, readable in admin) ───────────────
create table if not exists error_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  source text not null default 'server',
  route text,
  message text not null,
  stack text,
  context jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── Row Level Security ───────────────────────────────────────────
alter table user_settings enable row level security;
alter table task_types enable row level security;
alter table jobs enable row level security;
alter table tasks enable row level security;
alter table subtasks enable row level security;
alter table meetings enable row level security;
alter table calendar_connections enable row level security;
alter table time_logs enable row level security;
alter table push_subscriptions enable row level security;
alter table fcm_tokens enable row level security;
alter table feedback enable row level security;
alter table feedback_replies enable row level security;
alter table admins enable row level security;
alter table trips enable row level security;
alter table trip_days enable row level security;
alter table activities enable row level security;
alter table accommodations enable row level security;
alter table trip_library_items enable row level security;
alter table waitlist_signups enable row level security;
alter table error_logs enable row level security;
alter table allowed_signup_emails enable row level security;
alter table account_status enable row level security;

-- ── Policies: reset then recreate so this file can be rerun safely ─
drop policy if exists "own settings" on user_settings;
drop policy if exists "own task types" on task_types;
drop policy if exists "own jobs" on jobs;
drop policy if exists "own tasks" on tasks;
drop policy if exists "own subtasks" on subtasks;
drop policy if exists "own meetings" on meetings;
drop policy if exists "own calendar connections" on calendar_connections;
drop policy if exists "own time logs" on time_logs;
drop policy if exists "own push subs" on push_subscriptions;
drop policy if exists "own fcm tokens" on fcm_tokens;
drop policy if exists "own admin row" on admins;
drop policy if exists "users can submit feedback" on feedback;
drop policy if exists "admins can read feedback" on feedback;
drop policy if exists "users can read own feedback" on feedback;
drop policy if exists "users can update own feedback" on feedback;
drop policy if exists "own trips" on trips;
drop policy if exists "own trip days" on trip_days;
drop policy if exists "own activities" on activities;
drop policy if exists "own accommodations" on accommodations;
drop policy if exists "own trip library items" on trip_library_items;
drop policy if exists "admins can manage waitlist" on waitlist_signups;
drop policy if exists "admins can read errors" on error_logs;
drop policy if exists "admins can update errors" on error_logs;
drop policy if exists "own feedback replies" on feedback_replies;
drop policy if exists "users can reply to own feedback" on feedback_replies;
drop policy if exists "admins can read replies" on feedback_replies;
drop policy if exists "admins can reply to feedback" on feedback_replies;
drop policy if exists "admins can read allowed emails" on allowed_signup_emails;

create policy "own settings" on user_settings
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own task types" on task_types
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own jobs" on jobs
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own tasks" on tasks
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own subtasks" on subtasks
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own meetings" on meetings
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own calendar connections" on calendar_connections
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own time logs" on time_logs
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own push subs" on push_subscriptions
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own fcm tokens" on fcm_tokens
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own admin row" on admins
  for select using (auth.uid() = user_id);

create policy "users can submit feedback" on feedback
  for insert with check (auth.uid() = user_id or user_id is null);

create policy "users can read own feedback" on feedback
  for select using (user_id = auth.uid());

create policy "users can update own feedback" on feedback
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "admins can read feedback" on feedback
  for select using (
    exists (
      select 1
      from admins
      where admins.user_id = auth.uid()
    )
  );

create policy "own trips" on trips
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- trip_days has no user_id column; ownership flows through the parent trip.
create policy "own trip days" on trip_days
  for all using (
    exists (
      select 1 from trips
      where trips.id = trip_days.trip_id and trips.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from trips
      where trips.id = trip_days.trip_id and trips.user_id = auth.uid()
    )
  );

create policy "own activities" on activities
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own accommodations" on accommodations
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own trip library items" on trip_library_items
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "admins can manage waitlist" on waitlist_signups
  for all using (
    exists (
      select 1 from admins
      where admins.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from admins
      where admins.user_id = auth.uid()
    )
  );

create policy "admins can read errors" on error_logs
  for select using (
    exists (
      select 1 from admins
      where admins.user_id = auth.uid()
    )
  );

create policy "admins can update errors" on error_logs
  for update using (
    exists (
      select 1 from admins
      where admins.user_id = auth.uid()
    )
  );

create policy "own feedback replies" on feedback_replies
  for select using (
    exists (
      select 1 from feedback
      where feedback.id = feedback_replies.feedback_id and feedback.user_id = auth.uid()
    )
  );

create policy "users can reply to own feedback" on feedback_replies
  for insert with check (
    author_type = 'user'
    and author_id = auth.uid()
    and exists (
      select 1 from feedback
      where feedback.id = feedback_replies.feedback_id and feedback.user_id = auth.uid()
    )
  );

create policy "admins can read replies" on feedback_replies
  for select using (
    exists (
      select 1 from admins
      where admins.user_id = auth.uid()
    )
  );

create policy "admins can reply to feedback" on feedback_replies
  for insert with check (
    author_type = 'admin'
    and exists (
      select 1 from admins
      where admins.user_id = auth.uid()
    )
  );

create policy "admins can read allowed emails" on allowed_signup_emails
  for select using (
    exists (
      select 1 from admins
      where admins.user_id = auth.uid()
    )
  );

-- ── Migration section for existing installs ──────────────────────
-- Safe to rerun; only adds what's missing. Does not drop or overwrite
-- existing data. Where a new column matters to existing rows, the column
-- is backfilled once with the value that preserves current behaviour.

-- FCM web push tokens: same definition as the fresh-install section
-- above, brought here for existing installs (create table if not exists
-- covers it, and the "own fcm tokens" policy is recreated idempotently in
-- the same guarded pattern as the other additive tables).
drop policy if exists "own fcm tokens" on fcm_tokens;
create table if not exists fcm_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null default 'web' check (platform in ('web')),
  user_agent text,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists fcm_tokens_token_key on fcm_tokens (token);
create index if not exists fcm_tokens_user_id_idx on fcm_tokens (user_id);
alter table fcm_tokens enable row level security;
create policy "own fcm tokens" on fcm_tokens
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table user_settings add column if not exists timezone text;
alter table user_settings add column if not exists sort_mode text;
alter table user_settings add column if not exists travel_sort_mode text not null default 'what_fits';
alter table user_settings add column if not exists account_tier text not null default 'free';
alter table user_settings add column if not exists theme text not null default 'system';
alter table user_settings add column if not exists home_location_text text;
alter table user_settings add column if not exists home_lat double precision;
alter table user_settings add column if not exists home_lng double precision;
alter table user_settings add column if not exists work_location_text text;
alter table user_settings add column if not exists work_lat double precision;
alter table user_settings add column if not exists work_lng double precision;

alter table tasks add column if not exists surface_date date;
alter table tasks add column if not exists location_text text;
alter table tasks add column if not exists lat double precision;
alter table tasks add column if not exists lng double precision;
alter table tasks add column if not exists last_overdue_ping_at timestamptz;
alter table tasks add column if not exists drive_mins_to_next int not null default 0;
alter table tasks add column if not exists route_polyline text;
alter table tasks add column if not exists info text;
alter table tasks add column if not exists job_id uuid references jobs(id) on delete set null;
-- Unified Thought Input V1: capture-time facets. original_input keeps the
-- user's raw thought verbatim (so nothing typed is ever lost even after the
-- action text is trimmed); intended_time stores a resolved clock time as a
-- plain 'HH:MM' string (the schema otherwise has no task clock-time column).
-- Both are purely additive and nullable — tasks created without the unified
-- flow simply leave them null.
alter table tasks add column if not exists original_input text;
alter table tasks add column if not exists intended_time text;

-- Meetings foundation (V1): the existing `meetings` row already IS the
-- meeting identity — Today's capacity counts it via start_time/duration_mins,
-- and Outlook sync writes source='outlook' rows into it. The foundation
-- extends that same row additively rather than creating a parallel meeting:
-- a Meeting can be about a Job, and can occur at a location, using exactly
-- the same optional job_id/location columns tasks use. Everything is
-- nullable, so existing manual/outlook meetings and Today's
-- (id, text, duration_mins, start_time) read are untouched.
-- notes holds raw capture (source evidence); summary is the derived minutes
-- seam — nullable now, populated by a future derivation step, never
-- auto-generated in V1.
alter table meetings add column if not exists job_id uuid references jobs(id) on delete set null;
alter table meetings add column if not exists location_text text;
alter table meetings add column if not exists lat double precision;
alter table meetings add column if not exists lng double precision;
alter table meetings add column if not exists notes text;
alter table meetings add column if not exists summary text;

-- Trip Library: the "own trip library items" policy above needs the table
-- to exist for existing installs too; create table if not exists covers it.
-- Provenance link from a scheduled activity back to the Library item that
-- spawned it. Purely additive — scheduling copies name/location/coords into
-- the activity, so the activity stands on its own. Deleting the Library
-- item detaches the link (set null), never the scheduled activity itself.
alter table activities add column if not exists library_item_id uuid references trip_library_items(id) on delete set null;
create index if not exists trip_library_items_trip_id_idx on trip_library_items (trip_id);

-- Grouping reads on the Jobs surface (tasks for a given job).
create index if not exists tasks_job_id_idx on tasks (job_id);

alter table feedback add column if not exists user_last_read_at timestamptz;

-- ── Meeting Export (V1): metadata for one export attempt ──────────
-- One row per export of a meeting. A successful row is an immutable
-- snapshot of what was produced (what went in, the fingerprint of the state
-- it was made from, what size it ended up at); a failed row is kept until
-- the next successful export so the flow can offer "Try again" from the
-- exact attempt that failed. Ownership is the standard "own X" RLS pattern
-- and the row cascades up through meetings → auth.users, so account
-- deletion stays automatic. This is metadata ONLY — the exported evidence
-- bytes stay device-local (idb://) exactly as recorded; nothing here is a
-- copy of the media and nothing is stored in Supabase Storage.
create table if not exists meeting_exports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meeting_id uuid not null references meetings(id) on delete cascade,
  status text not null default 'generating' check (status in ('generating', 'successful', 'failed')),
  export_type text not null check (export_type in ('pdf', 'evidence_package', 'both')),
  -- Deterministic fingerprint of the exported state the export was built
  -- from; the history marker compares the CURRENT masked state against it.
  fingerprint text,
  -- What was selected for this attempt (section mask + exact ids), so a
  -- retry can reopen the same context and change detection knows which
  -- sections the export covered.
  selected_sections jsonb,
  observation_count int not null default 0,
  photo_count int not null default 0,
  audio_count int not null default 0,
  decision_count int not null default 0,
  action_count int not null default 0,
  participant_count int not null default 0,
  transcription_requested boolean not null default false,
  transcription_status text not null default 'not_requested'
    check (transcription_status in ('not_requested', 'requested', 'completed', 'failed')),
  -- Device-local evidence that could not be resolved at generation time
  -- (bytes deleted, ref invalid). Kept out of the counts above, which only
  -- describe what WAS exported.
  missing_media_count int not null default 0,
  file_size bigint,
  error_reason text,
  created_at timestamptz not null default now()
);

alter table meeting_exports enable row level security;

do $$
begin
  begin
    drop policy if exists "own meeting exports" on meeting_exports;
  exception when undefined_object then
    null;
  end;
  create policy "own meeting exports" on meeting_exports
    for all using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
end $$;

-- The meeting surface reads exports newest-first per meeting.
create index if not exists meeting_exports_meeting_id_created_idx
  on meeting_exports (meeting_id, created_at desc);

-- Export preferences live on the existing single-row-per-user settings row
-- (hybrid model: defaults live in the app, the user's choices settle here).
-- JSONB so future export options fit without a column each; NULL means the
-- app defaults apply unchanged.
alter table user_settings add column if not exists meeting_export_prefs jsonb;

-- onboarded: backfill true only for rows that existed before the column
-- was added (existing users are already set up). Runs exactly once — a
-- later rerun sees the column already present and skips the backfill.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_settings' and column_name = 'onboarded'
  ) then
    alter table user_settings add column onboarded boolean not null default false;
    update user_settings set onboarded = true;
  end if;
end $$;

-- sort_mode: normalize any legacy values to a supported mode, then pin
-- the constraint to the app's six modes. Legacy values from the old
-- schema (oldest/newest/longest/shortest) map onto their modern
-- equivalents; anything unrecognized falls back to the default so the
-- constraint can never reject existing data.
do $$
begin
  update user_settings
    set sort_mode = case
      when sort_mode in ('capacity_first','due_today_first','manual','oldest_first','newest_first','geo_aware') then sort_mode
      when sort_mode = 'oldest' then 'oldest_first'
      when sort_mode = 'newest' then 'newest_first'
      else 'capacity_first'
    end;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'user_settings'::regclass and conname = 'user_settings_sort_mode_check'
  ) then
    alter table user_settings
      add constraint user_settings_sort_mode_check
      check (sort_mode in ('capacity_first','due_today_first','manual','oldest_first','newest_first','geo_aware'));
  end if;

  alter table user_settings alter column sort_mode set not null;
end $$;

-- Same contract pinning for the other constrained app-written fields.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'user_settings'::regclass and conname = 'user_settings_travel_sort_mode_check'
  ) then
    alter table user_settings
      add constraint user_settings_travel_sort_mode_check
      check (travel_sort_mode in ('what_fits', 'close_to_accom', 'nearby_me', 'manual'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'user_settings'::regclass and conname = 'user_settings_account_tier_check'
  ) then
    alter table user_settings
      add constraint user_settings_account_tier_check
      check (account_tier in ('trusted_tester', 'free', 'premium'));
  end if;
end $$;

-- Unique email for the waitlist: matches the app's duplicate-email
-- handling (it relies on the 23505 unique_violation code). Fails loudly
-- if pre-existing duplicate rows would violate it.
create unique index if not exists waitlist_signups_email_key on waitlist_signups (email);
create unique index if not exists allowed_signup_emails_email_key on allowed_signup_emails (email);

-- ── Prediction log (thinking engine evidence) ────────────────────
-- Records every estimate the engine made at capture time, plus the
-- actual outcome when the task completes. This is the feedback loop
-- that lets the engine measure its own accuracy and calibrate
-- confidence over time.
create table if not exists prediction_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_text text not null,
  cluster_label text,
  cluster_count int not null default 0,
  estimated_mins int not null,
  suggested_mins int,
  confidence text not null default 'low' check (confidence in ('low', 'medium', 'high')),
  actual_mins int,
  logged_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table prediction_log enable row level security;

-- ── RLS policies for prediction_log ───────────────────────────────
-- (dropped and recreated idempotently, same pattern as other tables)
do $$
begin
  -- Drop old policies if they exist (safe to rerun)
  begin
    drop policy if exists "own prediction logs" on prediction_log;
  exception when undefined_object then
    null;
  end;

  create policy "own prediction logs" on prediction_log
    for all using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
end $$;

-- Index for efficient lookup of predictions by task text (for the
-- evidence buffer's recordOutcome lookup) and by completion time
-- (for the Patterns surface's accuracy queries).
create index if not exists prediction_log_user_id_idx on prediction_log (user_id);
create index if not exists prediction_log_task_text_idx on prediction_log (task_text);
create index if not exists prediction_log_completed_at_idx on prediction_log (completed_at);

-- ── Surface events (Personal Gravity evidence) ──────────────────
-- Lightweight log of which surfaces the user opened and how. The
-- thinking engine uses this to discover which part of Dokkit the
-- user naturally gravitates toward — without inferring intent from
-- passive exposure. Only deliberate navigation carries real weight.
create table if not exists surface_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  surface text not null check (surface in ('today', 'jobs', 'travel')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table surface_events enable row level security;

do $$
begin
  begin
    drop policy if exists "own surface events" on surface_events;
  exception when undefined_object then
    null;
  end;

  create policy "own surface events" on surface_events
    for all using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
end $$;

create index if not exists surface_events_user_id_idx on surface_events (user_id);
create index if not exists surface_events_created_at_idx on surface_events (created_at);


-- ── User-confirmed entity relationships (Unified Thought Input V1.2) ────
-- One row records a relationship the user explicitly confirmed through the
-- unified-thought confirmation flow: typing `alias` refers to the entity of
-- `entity_type` whose id is `entity_id`. This is learned, deterministic user
-- knowledge — it feeds the resolver, never a parser rule, and it only ever
-- narrows what previously required a manual confirmation. It is not a generic
-- relationship framework: rows are keyed to the logged-in user and RLS keeps
-- them private. Deleting the target job removes its aliases (cascade), so a
-- relationship can never outlive the entity it points at.
create table if not exists entity_aliases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  alias text not null,
  entity_type text not null default 'job' check (entity_type in ('job')),
  entity_id uuid not null references jobs(id) on delete cascade,
  source text not null default 'user_confirmed' check (source in ('user_confirmed')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table entity_aliases enable row level security;

do $$
begin
  begin
    drop policy if exists "own entity aliases" on entity_aliases;
  exception when undefined_object then
    null;
  end;

  create policy "own entity aliases" on entity_aliases
    for all using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
end $$;

-- One user can confirm the same alias for the same entity only once. Alias
-- values are stored normalized (lower-cased trigger phrase, road abbreviations
-- expanded) so this stays a simple unique index the app can upsert against. A
-- user may still hold the same alias for several entities — that is genuine
-- ambiguity, intentionally permitted and surfaced through the existing
-- "Which one?" flow.
create unique index if not exists entity_aliases_user_alias_entity_idx
  on entity_aliases (user_id, alias, entity_type, entity_id);
create index if not exists entity_aliases_user_id_idx on entity_aliases (user_id);
create index if not exists entity_aliases_user_alias_idx on entity_aliases (user_id, alias, entity_type);

-- ── Meetings foundation (V1): relational structure ──────────────
-- A Meeting is a block of time where people came together around a Job.
-- Everything below is evidence first, interpretation later — the same
-- capture-first contract tasks use. Each related table is an additive,
-- rerunnable unit: ownership is enforced by the standard "own X" RLS
-- policy, and every row cascades up through meetings → auth.users, so
-- account deletion stays automatic with no per-table cleanup.
--
-- meeting_observations: ONE contextual observation (a photo + a voice
-- note + a line of text are a single observation, not three records).
--   → media attaches to an observation via meeting_media.observation_id.
-- meeting_decisions: "the flashing gets replaced, not repaired".
-- meeting_actions: "reprice the flashing"; carries a nullable task_id
--   seam so a promoted action is ONE underlying action linked to the
--   meeting (and via the meeting's job_id, to the Job and Today), never
--   a duplicated copy.
-- meeting_media: DEVICE-LOCAL references ONLY in V1 — local_uri points
--   at the file/object on the device; nothing is uploaded to Supabase.
--   The reference survives, the bytes stay where the user made them.

create table if not exists meeting_participants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meeting_id uuid not null references meetings(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists meeting_observations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meeting_id uuid not null references meetings(id) on delete cascade,
  text text not null,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists meeting_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meeting_id uuid not null references meetings(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now()
);

create table if not exists meeting_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meeting_id uuid not null references meetings(id) on delete cascade,
  text text not null,
  created_at timestamptz not null default now(),
  task_id uuid references tasks(id) on delete set null
);

create table if not exists meeting_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meeting_id uuid not null references meetings(id) on delete cascade,
  observation_id uuid references meeting_observations(id) on delete set null,
  media_type text not null check (media_type in ('photo', 'audio', 'document')),
  local_uri text not null,
  mime_type text,
  size_bytes bigint,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table meeting_participants enable row level security;
alter table meeting_observations enable row level security;
alter table meeting_decisions enable row level security;
alter table meeting_actions enable row level security;
alter table meeting_media enable row level security;

do $$
begin
  begin
    drop policy if exists "own meeting participants" on meeting_participants;
  exception when undefined_object then
    null;
  end;
  create policy "own meeting participants" on meeting_participants
    for all using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
end $$;

do $$
begin
  begin
    drop policy if exists "own meeting observations" on meeting_observations;
  exception when undefined_object then
    null;
  end;
  create policy "own meeting observations" on meeting_observations
    for all using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
end $$;

do $$
begin
  begin
    drop policy if exists "own meeting decisions" on meeting_decisions;
  exception when undefined_object then
    null;
  end;
  create policy "own meeting decisions" on meeting_decisions
    for all using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
end $$;

do $$
begin
  begin
    drop policy if exists "own meeting actions" on meeting_actions;
  exception when undefined_object then
    null;
  end;
  create policy "own meeting actions" on meeting_actions
    for all using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
end $$;

do $$
begin
  begin
    drop policy if exists "own meeting media" on meeting_media;
  exception when undefined_object then
    null;
  end;
  create policy "own meeting media" on meeting_media
    for all using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
end $$;

create index if not exists meeting_participants_meeting_id_idx on meeting_participants (meeting_id);
create index if not exists meeting_observations_meeting_id_idx on meeting_observations (meeting_id);
create index if not exists meeting_decisions_meeting_id_idx on meeting_decisions (meeting_id);
create index if not exists meeting_actions_meeting_id_idx on meeting_actions (meeting_id);
create index if not exists meeting_media_meeting_id_idx on meeting_media (meeting_id);
create index if not exists meeting_media_observation_id_idx on meeting_media (observation_id);

-- ── Account status (signup gate + admin account controls) ───────
-- Same definition as the fresh-install section above. Accessed only via
-- the service-role client (initialize gate, verifyUser enforcement,
-- admin account controls), so RLS is enabled with no policies.
create table if not exists account_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'terminated')),
  admin_notified_at timestamptz,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table account_status enable row level security;

-- ── Hot Today query indexes ──────────────────────────────────────
-- Covers the queries Today runs on every load and the privileged API
-- routes behind it. RLS injects a user_id equality into every client
-- query, so each index leads with user_id; the trailing columns match
-- the filter/order shape of the actual queries:
--   * open tasks in manual order        → tasks(user_id, status, order_index)
--     (app/page.tsx loadEverything)
--   * completed history for learning    → tasks(user_id, status, completed_at DESC)
--     (app/page.tsx historyPromise: status = done ORDER BY completed_at DESC LIMIT 500)
--   * subtasks per task card            → subtasks(task_id)
--     (app/page.tsx .in('task_id', ids))
--   * today's meeting window            → meetings(user_id, start_time)
--     (app/page.tsx meetingsPromise start_time range/IS NULL filter)
--   * gravity's recent-events lookup    → surface_events(user_id, created_at DESC)
--     (app/page.tsx surface_events effect: eq user_id + gte created_at
--     ORDER BY created_at DESC LIMIT 50 — supersedes the practical use
--     of the older single-column surface_events_created_at_idx, which is
--     kept to avoid touching existing installs unnecessarily)
create index if not exists tasks_user_id_status_order_idx on tasks (user_id, status, order_index);
create index if not exists tasks_user_id_status_completed_idx on tasks (user_id, status, completed_at desc);
create index if not exists subtasks_task_id_idx on subtasks (task_id);
create index if not exists meetings_user_id_start_time_idx on meetings (user_id, start_time);
-- Meetings about a job (Jobs surface reads meetings by job_id).
create index if not exists meetings_job_id_idx on meetings (job_id);
create index if not exists surface_events_user_id_created_at_idx on surface_events (user_id, created_at desc);

-- ── External Calendar (V1): provider-independent commitments ────
-- Upgrades the prototype's single-row, plaintext Microsoft connection to
-- the production shape (multi-connection, encrypted tokens, sync health).
-- Fresh installs already have this shape from the create-table block
-- above, so every statement here must evaluate to a no-op on a fresh
-- database:
--   * id uuid becomes the PK (legacy PK was user_id — one row per user)
--   * provider_account_id keys the check "one connection per calendar"
--   * access_token/refresh_token columns are UNCHANGED and now hold
--     "enc:"-prefixed AES-256-GCM ciphertext; legacy plaintext values
--     created before encryption are read transparently and re-encrypted
--     on the next token write.
alter table calendar_connections add column if not exists id uuid;
update calendar_connections set id = gen_random_uuid() where id is null;
alter table calendar_connections alter column id set not null;

-- Promote id to the primary key. The legacy PK (user_id) blocks multiple
-- connections per user, so it must be replaced by PRIMARY KEY (id). The old
-- constraint is dropped under whatever name it carries, then id is promoted
-- (a fresh database already has PRIMARY KEY (id), where both steps no-op and
-- the "drop" must never fire on it). Every data-routing FK below
-- (external_calendars.connection_id, calendar_events.connection_id) depends
-- on id being unique, so this MUST end with calendar_connections_pkey on id.
do $$
declare
  pkey_def text;
  pkey_name text;
begin
  select pg_get_constraintdef(oid), conname into pkey_def, pkey_name
    from pg_constraint
    where conrelid = 'calendar_connections'::regclass and contype = 'p';
  if pkey_def is not null and pkey_def not ilike '%(id)%' then
    execute format('alter table calendar_connections drop constraint %I', pkey_name);
  end if;
  if pkey_def is null or pkey_def not ilike '%(id)%' then
    alter table calendar_connections add constraint calendar_connections_pkey
      primary key (id);
  end if;
end $$;

alter table calendar_connections add column if not exists provider_account_id text;
alter table calendar_connections add column if not exists scopes text;
alter table calendar_connections add column if not exists last_sync_at timestamptz;
alter table calendar_connections add column if not exists sync_status text
  not null default 'ok' check (sync_status in ('ok', 'error'));
alter table calendar_connections add column if not exists sync_error text;

-- Existing rows get a stable account key; the connected email is the best
-- proxy we have (legacy rows recorded it), falling back to a per-user
-- placeholder so the unique index below can be enforced.
update calendar_connections
  set provider_account_id = coalesce(nullif(connected_email, ''), 'legacy-' || user_id::text)
  where provider_account_id is null or provider_account_id = '';
alter table calendar_connections alter column provider_account_id set not null;

-- One connection per calendar account: a second Microsoft account creates
-- a new row instead of overwriting the first one.
create unique index if not exists calendar_connections_user_provider_account_idx
  on calendar_connections (user_id, provider, provider_account_id);
create index if not exists calendar_connections_user_id_idx on calendar_connections (user_id);

-- ── External calendars (selectable calendars inside each connection) ──
-- One row per calendar inside a connected account. Identity is the
-- provider's stable calendar ID (never the name). `selected` decides which
-- calendars contribute External Commitments: the account's default calendar
-- is auto-selected on first connection, while birthdays, holidays and shared
-- informational calendars are discovered but left unselected so they never
-- silently consume Today's capacity. A user's choice is preserved across
-- syncs. Rows cascade away with their connection (and up through
-- auth.users), so disconnect/account-deletion need no extra cleanup.
create table if not exists external_calendars (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references calendar_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'microsoft' check (provider in ('microsoft', 'google')),
  provider_calendar_id text not null,
  name text not null,
  is_default boolean not null default false,
  selected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, provider, provider_calendar_id)
);

alter table external_calendars enable row level security;

do $$
begin
  begin
    drop policy if exists "own external calendars" on external_calendars;
  exception when undefined_object then
    null;
  end;
  create policy "own external calendars" on external_calendars
    for all using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
end $$;

create index if not exists external_calendars_connection_id_idx on external_calendars (connection_id);
create index if not exists external_calendars_user_id_idx on external_calendars (user_id);

-- ── Calendar events (synced external commitments) ───────────────
-- The distilled, normalized result of a calendar sync. One row per
-- external event that overlaps the sync window. Each event points at the
-- external_calendars row it came from (never a calendar name); sync only
-- fetches selected calendars, so an event linked to a deselected calendar
-- is not re-fetched and its cached row is reconciled to cancelled — it
-- stops consuming Today capacity without deleting the Microsoft event.
-- status 'cancelled' removes an event from Today's capacity without
-- deleting the row, so a cancelled-then-revived event retains identity.
-- Rows cascade away with their calendar/connection (and up through
-- auth.users), so disconnect/account-deletion need no extra cleanup.
create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references calendar_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'microsoft' check (provider in ('microsoft', 'google')),
  calendar_id uuid references external_calendars(id) on delete cascade,
  provider_event_id text not null,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  location text,
  description text,
  status text not null default 'confirmed'
    check (status in ('confirmed', 'tentative', 'cancelled')),
  source_url text,
  last_modified text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (connection_id, provider, provider_event_id)
);

alter table calendar_events enable row level security;

do $$
begin
  begin
    drop policy if exists "own calendar events" on calendar_events;
  exception when undefined_object then
    null;
  end;
  create policy "own calendar events" on calendar_events
    for all using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
end $$;

-- Existing installs created calendar_events before external_calendars
-- existed, so the link column is added idempotently (a fresh database
-- already has it inline above). The add must run BEFORE the calendar_id
-- index below, or an existing install would try to index a missing column.
alter table calendar_events add column if not exists calendar_id uuid
  references external_calendars(id) on delete cascade;

-- Today's overlap scan (RLS adds user_id equality): events overlapping
-- the local day via (start_at < dayEnd AND end_at > dayStart).
create index if not exists calendar_events_user_id_start_at_idx on calendar_events (user_id, start_at);
create index if not exists calendar_events_user_id_end_at_idx on calendar_events (user_id, end_at);
create index if not exists calendar_events_connection_id_idx on calendar_events (connection_id);
create index if not exists calendar_events_calendar_id_idx on calendar_events (calendar_id);

-- ── Admin overview aggregates ─────────────────────────────────────
-- One service-role-only RPC answering every counting/window question the
-- Admin Overview (app/api/admin/overview) needs, so one authorised
-- request no longer issues ~40 database round trips. The route passes the
-- same UTC cutoff timestamps it used to embed in per-query filters, so
-- every window is identical; the function returns a single jsonb holding
-- all totals, bounded slices and windowed groups. Anything that would
-- otherwise read an unbounded table (prediction_log outcomes, the whole
-- feedback_replies table, all of feedback, all push_subscriptions, the
-- 200-row error sample) is reduced here to SQL aggregates and LIMIT-n
-- slices.
--
-- SECURITY: called exclusively through the service-role client
-- (lib/supabaseAdmin.ts) after the route's verifyUser/requireAdmin gate.
-- It is SECURITY INVOKER (the default): the service role bypasses RLS and
-- reads every table directly, while a session token can never invoke it —
-- EXECUTE is revoked from PUBLIC and granted only to service_role.
create or replace function public.admin_overview_aggregates(
  p_d7 text,
  p_d14 text,
  p_d30 text,
  p_h24 text,
  p_today text
)
returns jsonb
language sql
stable
as $$
  with prediction_ratios as (
    select actual_mins::float8 / greatest(estimated_mins, 1)::float8 as r
    from prediction_log
    where actual_mins is not null
  ),
  prediction_agg as (
    select
      count(*)::int as outcomes,
      coalesce(avg(r), 1.0) as average_ratio,
      coalesce(percentile_cont(0.5) within group (order by r), 1.0) as median_ratio
    from prediction_ratios
  ),
  feedback_window as (
    select id
    from feedback
    order by created_at desc
    limit 200
  ),
  feedback_recent as (
    select id, submitter_email, is_anonymous, message, page_context, created_at
    from feedback
    order by created_at desc
    limit 6
  )
  select jsonb_build_object(
    'tasks', jsonb_build_object(
      'total', (select count(*)::int from tasks),
      'open', (select count(*)::int from tasks where status <> 'done'),
      'dueToday', (select count(*)::int from tasks where due_today and status <> 'done'),
      'created30d', (select count(*)::int from tasks where created_at >= p_d30::timestamptz),
      'completed7d', (select count(*)::int from tasks where completed_at >= p_d7::timestamptz),
      'completed24h', (select count(*)::int from tasks where completed_at >= p_h24::timestamptz),
      'completed30d', (select count(*)::int from tasks where completed_at >= p_d30::timestamptz),
      'doneTotal', (select count(*)::int from tasks where status = 'done')
    ),
    'activeUsers7d', (select count(distinct user_id)::int from tasks where created_at >= p_d7::timestamptz or completed_at >= p_d7::timestamptz),
    'jobs', jsonb_build_object(
      'total', (select count(*)::int from jobs),
      'created30d', (select count(*)::int from jobs where created_at >= p_d30::timestamptz),
      'active30d', (select count(distinct job_id)::int from tasks where job_id is not null and created_at >= p_d30::timestamptz)
    ),
    'meetings', jsonb_build_object(
      'total', (select count(*)::int from meetings),
      'm30d', (select count(*)::int from meetings where created_at >= p_d30::timestamptz),
      'w7d', (select count(*)::int from meetings where start_time >= p_d7::timestamptz),
      'manual', (select count(*)::int from meetings where source = 'manual'),
      'outlook', (select count(*)::int from meetings where source = 'outlook')
    ),
    'meetingEvidence', jsonb_build_object(
      'observations', (select count(*)::int from meeting_observations),
      'decisions', (select count(*)::int from meeting_decisions),
      'actions', (select count(*)::int from meeting_actions),
      'media', (select count(*)::int from meeting_media),
      'participants', (select count(*)::int from meeting_participants)
    ),
    'travel', jsonb_build_object(
      'tripsTotal', (select count(*)::int from trips),
      'trips30d', (select count(*)::int from trips where created_at >= p_d30::timestamptz),
      'tripsActive', (select count(*)::int from trips where start_date <= p_today::date and end_date >= p_today::date),
      'tripDays', (select count(*)::int from trip_days),
      'activitiesTotal', (select count(*)::int from activities),
      'activitiesDone', (select count(*)::int from activities where status = 'done'),
      'accommodationsTotal', (select count(*)::int from accommodations)
    ),
    'predictions', (select jsonb_build_object(
      'total', (select count(*)::int from prediction_log),
      'outcomes', p.outcomes,
      'averageRatio', p.average_ratio,
      'accuracyPercent', case
        when p.outcomes = 0 then 100
        else floor(least(100.0, (1.0 / greatest(p.average_ratio, 0.01)) * 100.0) + 0.5)::int
      end,
      'medianRatio', p.median_ratio
    ) from prediction_agg p),
    'accounts', (select jsonb_build_object(
      'active', count(*) filter (where status = 'active')::int,
      'terminated', count(*) filter (where status = 'terminated')::int,
      'recentChanges', (select coalesce(jsonb_agg(jsonb_build_object(
        'user_id', c.user_id, 'status', c.status, 'updated_at', c.updated_at
      ) order by c.updated_at desc), '[]'::jsonb)
        from (
          select user_id, status, updated_at
          from account_status
          where updated_at > created_at + interval '1 second'
          order by updated_at desc
          limit 6
        ) c)
    ) from account_status),
    'userSettings', (select jsonb_build_object(
      'tiers', jsonb_build_object(
        'trusted_tester', count(*) filter (where account_tier = 'trusted_tester')::int,
        'free', count(*) filter (where account_tier = 'free')::int,
        'premium', count(*) filter (where account_tier = 'premium')::int
      ),
      'notOnboarded', count(*) filter (where not onboarded)::int
    ) from user_settings),
    'surfaces', (select jsonb_build_object(
      'today', count(*) filter (where surface = 'today')::int,
      'jobs', count(*) filter (where surface = 'jobs')::int,
      'travel', count(*) filter (where surface = 'travel')::int
    ) from surface_events where created_at >= p_d14::timestamptz),
    'errors', jsonb_build_object(
      'h24', (select count(*)::int from error_logs where created_at >= p_h24::timestamptz),
      'd7', (select count(*)::int from error_logs where created_at >= p_d7::timestamptz),
      'unresolved', (select count(*)::int from error_logs where not resolved),
      'dayBuckets', (select coalesce(jsonb_agg(jsonb_build_object('day', d, 'value', n) order by d), '[]'::jsonb)
        from (
          select to_char((created_at at time zone 'UTC')::date, 'YYYY-MM-DD') as d, count(*)::int as n
          from error_logs
          where created_at >= p_d14::timestamptz
          group by 1
        ) e),
      'recent', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'source', r.source, 'route', r.route, 'message', r.message, 'created_at', r.created_at
      ) order by r.created_at desc), '[]'::jsonb)
        from (
          select id, source, route, message, created_at
          from error_logs
          where created_at >= p_d14::timestamptz
          order by created_at desc
          limit 3
        ) r)
    ),
    'feedback', jsonb_build_object(
      'total', least((select count(*)::int from feedback), 200),
      'replied', (select count(*)::int
        from feedback_window w
        where exists (
          select 1 from feedback_replies rr
          where rr.feedback_id = w.id and rr.author_type = 'admin'
        )),
      'recent', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id,
        'submitter_email', r.submitter_email,
        'is_anonymous', r.is_anonymous,
        'message', r.message,
        'page_context', r.page_context,
        'created_at', r.created_at,
        'replies', (select count(*)::int from feedback_replies rr where rr.feedback_id = r.id)
      ) order by r.created_at desc), '[]'::jsonb) from feedback_recent r),
      'adminRepliesRecent', (select coalesce(jsonb_agg(jsonb_build_object(
        'feedback_id', a.feedback_id, 'created_at', a.created_at
      ) order by a.created_at desc), '[]'::jsonb)
        from (
          select feedback_id, created_at
          from feedback_replies
          where author_type = 'admin'
          order by created_at desc
          limit 2
        ) a)
    ),
    'integrations', jsonb_build_object(
      'adminSubscriptions', (select count(*)::int
        from push_subscriptions
        where user_id in (select user_id from admins))
    )
  );
$$;

revoke execute on function public.admin_overview_aggregates(text, text, text, text, text) from public;
grant execute on function public.admin_overview_aggregates(text, text, text, text, text) to service_role;

-- ── Admin overview query indexes ──────────────────────────────────
-- The overview RPC aggregates across ALL users (service-role scans, so
-- the existing user_id-led Today indexes cannot serve these filters).
-- These btree indexes match the WHERE/ORDER shapes of the aggregate
-- subqueries above, letting Postgres answer each bounded aggregate with
-- an index scan instead of a full table scan:
--   * tasks: status partitions (open vs done), completion/creation
--     ranges, and the "due today, not done" filter
--   * meetings: created and start_time ranges
--   * jobs: creation range
--   * feedback: the 200-window and 6-recent ORDER BY created_at DESC
--   * feedback_replies: per-feedback_id reply tallies + newest-reply scan
--   * error_logs: 24h/7d/14d-window counts, per-day grouping, newest-3
--     scan, and the unresolved-only aggregate
--   * push_subscriptions: subscriptions scan for the admin keyword list
create index if not exists tasks_status_idx on tasks (status);
create index if not exists tasks_created_at_idx on tasks (created_at);
create index if not exists tasks_completed_at_idx on tasks (completed_at);
create index if not exists tasks_due_today_status_idx on tasks (due_today, status);
create index if not exists meetings_created_at_idx on meetings (created_at);
create index if not exists meetings_start_time_idx on meetings (start_time);
create index if not exists jobs_created_at_idx on jobs (created_at);
create index if not exists feedback_created_at_idx on feedback (created_at desc);
create index if not exists feedback_replies_feedback_id_idx on feedback_replies (feedback_id);
create index if not exists feedback_replies_created_at_idx on feedback_replies (created_at);
create index if not exists error_logs_created_at_idx on error_logs (created_at);
create index if not exists error_logs_unresolved_partial_idx on error_logs (resolved) where not resolved;
create index if not exists push_subscriptions_user_id_idx on push_subscriptions (user_id);
