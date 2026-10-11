-- Phase AJ: durable per-user idempotency for native capture retries.
-- Existing tasks remain valid; only requests carrying a non-null request ID
-- participate in the unique constraint.
alter table public.tasks
  add column if not exists capture_request_id text;

create unique index if not exists tasks_user_capture_request_unique
  on public.tasks (user_id, capture_request_id)
  where capture_request_id is not null;
