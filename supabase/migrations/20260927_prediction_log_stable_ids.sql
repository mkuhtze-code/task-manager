-- Phase 2: stable prediction ↔ outcome linkage for the thinking engine.
-- Additive only. Legacy rows remain valid with null task_id / model versions.
-- Text is retained as context, not primary identity.

alter table prediction_log
  add column if not exists task_id uuid references tasks(id) on delete set null;

alter table prediction_log
  add column if not exists model_version text;

alter table prediction_log
  add column if not exists algorithm_version text;

alter table prediction_log
  add column if not exists feature_version text;

alter table prediction_log
  add column if not exists outcome_kind text
    check (
      outcome_kind is null
      or outcome_kind in ('done', 'partial', 'carry', 'skip', 'resume', 'edited')
    );

alter table prediction_log
  add column if not exists decision_id text;

-- Efficient open-prediction lookup by task (primary identity path).
create index if not exists prediction_log_user_task_open_idx
  on prediction_log (user_id, task_id)
  where actual_mins is null and task_id is not null;

create index if not exists prediction_log_task_id_idx
  on prediction_log (task_id)
  where task_id is not null;

comment on column prediction_log.task_id is
  'Stable task identity for prediction↔outcome linkage. Prefer over task_text.';
comment on column prediction_log.model_version is
  'Engine model version at prediction time (immutable historical fact).';
