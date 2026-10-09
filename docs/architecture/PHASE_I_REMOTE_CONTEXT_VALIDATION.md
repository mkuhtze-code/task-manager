# Phase I — Validate remote engine context

## Goal
Treat remote JSONB as untrusted serialized input. TypeScript casts do not validate data stored across releases, partial migrations, or corrupted rows.

## Changes
- Validate the complete version-1 working-memory shape before it can overwrite account-scoped local state.
- Validate active requests, including action, modality fields, constraints, confidence, timestamps, and utterance arrays.
- Reject oversized memory arrays and malformed nested records.
- Preserve same-account local context when the remote payload is malformed; keep an explicit remote `null` request authoritative only when the accompanying memory snapshot is valid.
- Add deterministic regression tests for malformed snapshots, bad constraints, oversized arrays, valid payloads, and remote-clear semantics.

## Boundaries
No runtime language interpretation changes, phrase-specific rules, corpus promotion, schema changes, or LLM/Whisper dependencies. This phase validates persistence boundaries only.
