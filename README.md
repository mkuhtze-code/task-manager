diff --git a/README.md b/README.md
index a3f1f66a2793edc62ae24184c6b00859f84c8f9a..5518df6446c766af7d17bfbe4b4231898531b07e 100644
--- a/README.md
+++ b/README.md
@@ -1,31 +1,36 @@
 -- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query)
 
 -- ── User settings (one row per user) ─────────────────────────────
 create table if not exists user_settings (
   user_id uuid primary key references auth.users(id) on delete cascade,
   day_length_mins int not null default 480,
+  work_start time not null default '08:00',
+  work_end time not null default '16:00',
+  work_days int[] not null default '{1,2,3,4,5}',
+  notification_style text not null default 'default' check (notification_style in ('default', 'silent')),
+  sort_mode text not null default 'capacity_first' check (sort_mode in ('capacity_first', 'due_today_first', 'manual', 'oldest_first', 'newest_first', 'geo_aware')),
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
@@ -57,25 +62,32 @@ create table if not exists time_logs (
 
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
+
+-- ── Existing installs: add task priority preferences if the settings table already exists ──
+alter table user_settings add column if not exists work_start time not null default '08:00';
+alter table user_settings add column if not exists work_end time not null default '16:00';
+alter table user_settings add column if not exists work_days int[] not null default '{1,2,3,4,5}';
+alter table user_settings add column if not exists notification_style text not null default 'default';
+alter table user_settings add column if not exists sort_mode text not null default 'capacity_first';
