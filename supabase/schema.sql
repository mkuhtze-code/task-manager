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
create table if not exists calendar_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  provider text not null default 'microsoft',
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  connected_email text,
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
create index if not exists surface_events_user_id_created_at_idx on surface_events (user_id, created_at desc);

-- ── FCM device tokens (mobile push registration) ─────────────────
-- Stores the Firebase Cloud Messaging token for each user/device
-- combination. A user may have multiple devices; each device registers
-- its own FCM token. Tokens are upserted on registration and deleted
-- on sign-out or token rotation.
create table if not exists fcm_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fcm_token text not null,
  platform text not null default 'android' check (platform in ('android', 'ios', 'web')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, fcm_token)
);

alter table fcm_tokens enable row level security;

do $$
begin
  begin
    drop policy if exists "own fcm tokens" on fcm_tokens;
  exception when undefined_object then
    null;
  end;

  create policy "own fcm tokens" on fcm_tokens
    for all using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
end $$;

create index if not exists fcm_tokens_user_id_idx on fcm_tokens (user_id);
create index if not exists fcm_tokens_fcm_token_idx on fcm_tokens (fcm_token);
