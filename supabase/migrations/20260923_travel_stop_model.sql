-- Travel stops are places/presence, not Today tasks.
-- stop_kind: why you're there; presence: how you occupy the day; job_id: work site link.

alter table public.activities
  add column if not exists stop_kind text not null default 'leisure';

alter table public.activities
  add column if not exists presence text not null default 'duration';

alter table public.activities
  add column if not exists job_id uuid references public.jobs (id) on delete set null;

-- Tighten allowed values (safe if already constrained)
do $$
begin
  alter table public.activities
    drop constraint if exists activities_stop_kind_check;
  alter table public.activities
    add constraint activities_stop_kind_check
    check (stop_kind in ('work', 'leisure', 'food', 'stay', 'other'));

  alter table public.activities
    drop constraint if exists activities_presence_check;
  alter table public.activities
    add constraint activities_presence_check
    check (presence in ('all_day', 'work_hours', 'fixed', 'duration'));
exception
  when others then
    raise notice 'stop constraints: %', sqlerrm;
end $$;

create index if not exists activities_job_id_idx on public.activities (job_id)
  where job_id is not null;

comment on column public.activities.stop_kind is
  'Travel stop intent: work site, leisure, food, stay, other — not a Today task.';
comment on column public.activities.presence is
  'How the stop occupies the day: all_day, work_hours, fixed time, or duration.';
comment on column public.activities.job_id is
  'Optional link to a Job when this stop is a work site.';
