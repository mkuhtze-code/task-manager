# Phase G — Persisted Capture Context Replay

**Scope:** verify that a successful task capture becomes a resolvable referent for the next capture turn. Keep interpretation deterministic and cross-domain.

## What changed

- After Today successfully inserts or updates a task row, the actual persisted task ID and title are bound into short-term working memory, and the task becomes current focus.
- The active structured request remains bound to that real task ID.
- The updated memory and request are saved to the account-scoped local cache and sent through the existing remote-sync adapter.
- Authenticated account reads/writes no longer fall back to or mirror into the legacy unscoped working-memory and active-request keys. Those shared keys could otherwise leak one account's recent task context into another account used in the same browser.
- A CI regression test runs the production capture-to-dock entry point, simulates the successful task-persistence boundary, reloads memory/request from local persistence, and checks that “Move it to Friday” updates the original task ID rather than creating a new task.
- A second test verifies account-scoped memory and request isolation.

## Exact test boundary

The test simulates the database task insert by supplying the returned task ID to the same binding helper used by Today. It exercises production interpretation and local persistence, but does not contact a live Supabase project or claim to validate remote database availability, remote hydration, or cross-device continuity. The existing remote adapter is invoked by the application, but its schema readiness and round-trip behavior remain a separate integration concern.

## North star preserved

No phrase-specific rule, construction-specific parser, nearest-sentence lookup, or LLM/Whisper dependency is added. The new binding is generic: it links any successfully persisted task to the actual row ID only after the surface confirms persistence. Missing or ambiguous references remain subject to the existing clarification/no-action boundary.
