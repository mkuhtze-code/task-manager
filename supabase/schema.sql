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
  task_sort_mode text not null default 'manual' check (task_sort_mode in ('manual', 'oldest', 'newest', 'longest', 'shortest')),
  timezone text,
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
  task_type_id uuid references task_types(id) on delete set null,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  near_notified boolean not null default false,
  over_notified boolean not null default false,
  last_overdue_ping_at timestamptz
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
  created_at timestamptz not null default now()
);

-- ── Admins ───────────────────────────────────────────────────────
create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ── Row Level Security ───────────────────────────────────────────
alter table user_settings enable row level security;
alter table task_types enable row level security;
alter table tasks enable row level security;
alter table subtasks enable row level security;
alter table meetings enable row level security;
alter table calendar_connections enable row level security;
alter table time_logs enable row level security;
alter table push_subscriptions enable row level security;
alter table feedback enable row level security;
alter table admins enable row level security;

-- ── Policies: reset then recreate so this file can be rerun safely ─
drop policy if exists "own settings" on user_settings;
drop policy if exists "own task types" on task_types;
drop policy if exists "own tasks" on tasks;
drop policy if exists "own subtasks" on subtasks;
drop policy if exists "own meetings" on meetings;
drop policy if exists "own calendar connections" on calendar_connections;
drop policy if exists "own time logs" on time_logs;
drop policy if exists "own push subs" on push_subscriptions;
drop policy if exists "own admin row" on admins;
drop policy if exists "users can submit feedback" on feedback;
drop policy if exists "admins can read feedback" on feedback;

create policy "own settings" on user_settings
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "own task types" on task_types
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

create policy "admins can read feedback" on feedback
  for select using (
    exists (
      select 1
      from admins
      where admins.user_id = auth.uid()
    )
  );

-- ── Migration section for existing installs ──────────────────────
-- Safe to rerun; only adds what's missing.
alter table user_settings add column if not exists timezone text;
alter table tasks add column if not exists last_overdue_ping_at timestamptz;
