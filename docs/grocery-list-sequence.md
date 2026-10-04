# Persistent Collections (Grocery List Sequence)

## What this is

**Persistent Collections** is a generic speech/thinking capability.

"Grocery List Sequence" is the **canonical development and acceptance scenario**, not a grocery-specific feature.

The same engine supports grocery/shopping, site snags, packing, materials, meeting questions, observations/ideas.

## Architecture

```
utterance
  → existing speech normalise / interpret
  → detectCollectionIntent (lib/collections/intent.ts)
  → resolveCollection / resolveTarget
  → applyCollectionIntent (service mutations)
  → structured observations (learning signals)
```

No LLM. Deterministic normalisation, pattern detection, token similarity, active context, confidence thresholds.

## Data model

See migration `supabase/migrations/20261004_collections.sql`.

- `collections` — title, normalized_title, type, status, context, aliases, is_active
- `collection_items` — content, status open|completed|removed, client_op_id for idempotency
- RLS: own rows only; at most one active collection per user

## Resolution priority

1. Explicit id 2. Title match 3. Alias 4. Active (TTL) 5. Context 6. Recent 7. Ask if ambiguous

Never silently merge ambiguous collections.

## Active collection

Soft TTL ~2h, hard ~24h. Enables "Start a grocery list" → "Milk." → "Bread."

## Files

| Path | Role |
|------|------|
| `lib/collections/*` | Domain engine |
| `supabase/migrations/20261004_collections.sql` | Schema + RLS |
| `docs/tests/grocery-list-sequence-test.md` | Acceptance record |
