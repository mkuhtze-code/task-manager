-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query)

-- ── User settings (one row per user) ─────────────────────────────
create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  day_length_mins int not null default 480,
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

-- ── Tasks ──────────────────────────────────────────────────────
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
  completed_at timestamptz
);

-- ── Meetings (manual for now, Outlook sync comes later) ──────────
create table if not exists meetings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  text text not null,
  duration_mins int not null,
  start_time timestamptz,
  source text not null default 'manual' check (source in ('manual', 'outlook')),
  created_at timestamptz not null default now()
);

-- ── Time logs (history used to build the rolling average) ────────
create table if not exists time_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  task_type_id uuid references task_types(id) on delete set null,
  duration_mins int not null,
  logged_at timestamptz not null default now()
);

-- ── Push subscriptions (for Web Push, wired up once notifications land) ──
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- ── Row Level Security: every user only sees their own rows ──────
alter table user_settings enable row level security;
alter table task_types enable row level security;
alter table tasks enable row level security;
alter table meetings enable row level security;
alter table time_logs enable row level security;
alter table push_subscriptions enable row level security;

create policy "own settings" on user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own task types" on task_types for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own tasks" on tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own meetings" on meetings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own time logs" on time_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own push subs" on push_subscriptions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
