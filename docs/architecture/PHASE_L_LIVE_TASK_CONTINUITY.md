# Phase L — live task persistence and context continuity

## Purpose

Phase K proved authenticated remote context round-tripping and account isolation, but used a synthetic task ID. Phase L closes that gap by using the real Supabase Data API to create a temporary task row, bind the returned database ID into the engine context, restore that context into a fresh local cache, resolve a follow-up, and update the same real row.

## Run from GitHub (no local setup)

This workflow reuses the Phase K repository Actions secrets. It does not require new secrets or a local terminal.

1. Use a **dedicated test account**, not a personal or customer account. It must have signed in to Dokkit at least once so a `public.user_settings` row exists.
2. Open **Actions → Phase L Live Task Continuity Test**.
3. Click **Run workflow**, select `main`, and click the green **Run workflow** button.
4. Open the run and wait for the result. A green tick means every assertion passed. If it fails, share the non-secret error text only.

Required existing repository secrets:
- `PHASE_K_SUPABASE_URL`
- `PHASE_K_SUPABASE_ANON_KEY`
- `PHASE_K_USER_A_EMAIL`
- `PHASE_K_USER_A_PASSWORD`

Never add or use a service-role key. The test uses a normal authenticated session and the existing publishable/anon key.

## What the test does

1. Signs in as the dedicated test account and snapshots its two engine-context fields.
2. Runs the production capture interpreter on a first utterance.
3. Inserts a temporary row into `public.tasks` through the authenticated Data API and receives its real database-generated UUID.
4. Binds that UUID to working memory and the active request, then saves context using the production persistence helper.
5. Clears local storage, hydrates from remote Supabase, and checks that the same task ID returns.
6. Runs “Move it to Friday.” through the production capture path and verifies that it targets the same database task ID.
7. Applies the follow-up's resolved `surface_date` to that row and verifies the row ID, owner, title, and date.
8. Deletes the temporary task and restores the account's original engine-context fields in cleanup.

## Safety and limits

- Use a dedicated test account only. The test temporarily replaces the account's engine context and creates one temporary task.
- The temporary task is deleted in a `finally` block; context is restored in the same cleanup path. Cleanup failures are reported as critical errors.
- No schema migration or runtime interpretation change is introduced.
- This tests the real authenticated Data API for task insert/update/delete and context continuity. It does not prove all UI interactions, speech-recognition accuracy, or every task mutation path.
- The workflow is manual-only and has read-only GitHub repository permissions. All database writes are scoped to the authenticated test user's own rows; no service-role key is used.
