# Phase K — live authenticated Supabase context verification

## Purpose

Prove the Phase H–J context persistence path against the real Supabase Data API using two real authenticated sessions. The existing Phase H–J tests use in-memory adapters and do not prove JWT authentication or production RLS enforcement.

## Safety requirements

- Use **two dedicated, active test accounts only**. Do not use personal or customer accounts: this test temporarily overwrites the two engine-context JSONB fields on test user A's existing `user_settings` row.
- Both accounts must already have a `user_settings` row. Sign in to the app once with each test account first.
- The test uses the publishable/anon key plus normal email/password sign-in. It must not use a service-role key.
- The test snapshots user A's original `engine_working_memory` and `engine_active_request` and restores them in a `finally` block. If restoration fails, the test throws a critical error.
- This test is opt-in and is not part of the default build or CI suite.

## Run

Set these environment variables locally without committing them:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `PHASE_K_USER_A_EMAIL`
- `PHASE_K_USER_A_PASSWORD`
- `PHASE_K_USER_B_EMAIL`
- `PHASE_K_USER_B_PASSWORD`
- `PHASE_K_LIVE_TESTS=true`

Then run:

```sh
npm run test:context-live
```

If `PHASE_K_LIVE_TESTS=true` but any required credential/configuration is missing, the test fails before running rather than silently skipping.

## Assertions

1. Both credentials create distinct authenticated users.
2. User A writes a context snapshot through the production `pushEngineStateRemote` helper.
3. User A reads back the persisted JSONB snapshot from the real Data API.
4. User B cannot read user A's settings row.
5. User B cannot overwrite user A's context by calling the same production upsert helper with user A's ID.
6. A fresh local cache hydrates from the real remote snapshot.
7. The production capture path resolves “Move it to Friday.” to the same persisted task ID.
8. User A's pre-test context is restored.

## Limits

The test requires credentials for two dedicated test accounts and therefore cannot be truthfully marked as live-passed until it is run in the target Supabase project. SQL catalog inspection confirms the columns and RLS policies exist, but is not a substitute for this authenticated API test. This phase changes no runtime interpretation rules, schema, or domain-specific parsing behaviour.
