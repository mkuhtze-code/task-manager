-- Open signup, account status, and server-enforced termination.
-- Apply in the Supabase SQL Editor against the existing Dokkit project.
-- This migration is additive and preserves existing user data and RLS policies.

create table if not exists public.account_status (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'terminated')),
  admin_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Existing accounts remain active and never need onboarding repeated.
insert into public.account_status (user_id, status)
select id, 'active' from auth.users
on conflict (user_id) do nothing;

create or replace function public.create_account_status_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.account_status (user_id, status)
  values (new.id, 'active')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_account_status on auth.users;
create trigger on_auth_user_created_account_status
  after insert on auth.users
  for each row execute procedure public.create_account_status_for_auth_user();

-- This function is evaluated by restrictive RLS policies below. It is the
-- server-side source of truth for whether an authenticated account can read
-- or write protected Dokkit data.
create or replace function public.is_account_active(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.account_status
    where user_id = check_user_id and status = 'active'
  );
$$;

revoke all on function public.is_account_active(uuid) from public;
grant execute on function public.is_account_active(uuid) to authenticated;

alter table public.account_status enable row level security;
-- No client policy: account status is only read or changed through the
-- service-role application routes and restrictive RLS predicates.

-- Restrictive policies compose with the existing ownership/admin policies;
-- they do not replace them. A terminated user therefore loses access even
-- with a still-valid JWT, while user-to-user isolation remains unchanged.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'user_settings', 'task_types', 'jobs', 'tasks', 'subtasks', 'meetings',
    'calendar_connections', 'time_logs', 'push_subscriptions', 'feedback',
    'feedback_replies', 'admins', 'trips', 'trip_days', 'activities',
    'accommodations', 'trip_library_items', 'waitlist_signups', 'error_logs',
    'allowed_signup_emails', 'prediction_log', 'surface_events'
  ] loop
    execute format('drop policy if exists "active account required" on public.%I', table_name);
    execute format(
      'create policy "active account required" on public.%I as restrictive for all using (public.is_account_active(auth.uid())) with check (public.is_account_active(auth.uid()))',
      table_name
    );
  end loop;
end;
