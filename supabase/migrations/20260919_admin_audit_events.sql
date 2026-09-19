-- Admin audit trail + privacy notes.
-- Apply in Supabase SQL editor (or migration runner) before relying on
-- writeAdminAudit in production. Service-role only — no client policies.

create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_events_created_at_idx
  on public.admin_audit_events (created_at desc);

create index if not exists admin_audit_events_actor_id_idx
  on public.admin_audit_events (actor_id);

alter table public.admin_audit_events enable row level security;

-- No policies: only the service role (bypasses RLS) can read/write.
-- Admins never query this table from the browser client.

comment on table public.admin_audit_events is
  'Immutable-style log of privileged admin actions. Written by server routes only.';
