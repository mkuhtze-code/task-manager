# Phase H — Remote context persistence round-trip

## Goal

Make the Phase G committed-capture context survive a new browser session/device, while keeping working memory and active requests isolated to the authenticated account.

## Changes

- Add nullable JSONB columns `user_settings.engine_working_memory` and `user_settings.engine_active_request` through an additive migration and document them in `supabase/schema.sql`.
- Use an account-keyed upsert rather than update-only sync, so a first capture can create the user's settings row if one does not exist.
- Return explicit `stateSaved` and `evidenceSaved` results instead of silently presenting a remote write as successful.
- Treat a successful remote row as authoritative during hydration, including a cleared (`null`) active request. A stale local request must not be resurrected after a remote clear.
- Hydrate remote context when Capture opens and prevent Dock execution until that account's hydration attempt completes. If remote access fails, the existing account-scoped local cache remains the fallback.
- Add a remote-adapter round-trip test that writes a snapshot, clears local storage, hydrates into a fresh cache, and checks the task focus/request; test remote clear semantics and write-failure reporting.

## Security and compatibility

The migration reuses the existing `user_settings` row and its existing `auth.uid() = user_id` RLS policy; it adds no new table or policy. The payload is the engine's versioned deterministic state, not raw microphone audio. No domain-specific rules, phrase tables, LLM, or Whisper path are added.

## Validation boundary

The Phase H test uses a deterministic in-memory Supabase adapter. It verifies adapter serialization/hydration logic, not a live Supabase deployment or cross-device production traffic. The new migration must be applied to the target Supabase project before production remote round-tripping can work. Until it is applied, remote queries/writes will fail and the client will fall back to account-scoped local state.

The test does not claim evidence-event persistence: evidence uses a separate table/path and remains outside this phase.
