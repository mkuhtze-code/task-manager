# Phase J — Remote capture-to-follow-up replay

## Goal
Exercise the production capture and persistence functions together across a simulated fresh session, not just isolated hydration helpers.

## Flow under test
1. Interpret a first utterance through `runCaptureDock`.
2. Simulate a successful task insert by binding its real task ID to the request and working memory.
3. Persist request and memory through `pushEngineStateRemote`.
4. Discard all local storage and hydrate through a separate client instance sharing only the remote row.
5. Interpret “Move it to Friday.” through the production capture path and verify it updates the same task ID.
6. Verify account separation through independent remote client sessions.

## Limits
The remote database is an in-memory Supabase-shaped adapter. This proves the application persistence and capture pipeline contract, not a live authenticated browser-to-Supabase round trip, device networking, or production RLS enforcement. No runtime interpretation rules or domain-specific shortcuts are introduced.
