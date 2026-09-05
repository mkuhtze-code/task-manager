# Unified Thought Input V1.2 — Persistent User-Confirmed Entity Relationships

## Why this exists

Unified Thought Input V1.1 asks "Do you mean X?" when the input matches an
existing job, and remembers the answer for that one capture. But the next time
the user types the same term, it asks again. From the user's point of view the
app didn't learn: "Didn't you learn that from last time?"

The fix is not a smarter prompt or more elaborate fuzzy matching. It is
removing the repeated question entirely by turning an accepted confirmation
into **persistent application data**.

## Core principle

A user-confirmed relationship is **knowledge, not a parser rule**.

Nothing is hardcoded (no `Kitchen → Fix Kitchen` map in code). The parser and
the fuzzy resolver stay generic. When the user explicitly confirms a proposed
relationship, that relationship is stored per-user, and it becomes data the
resolver consults on later input.

This is deliberately **not** AI/ML/NLP:
- no embeddings, vector search, LLM calls, external NLP libraries, or
  probabilistic models;
- only deterministic rules driven by rows the user explicitly taught.

Dokkit remembers what the user explicitly taught it.

## Where relationships are stored

One table, `entity_aliases`:

```
user_id      uuid  → auth.users (cascade)
alias        text  (normalized trigger phrase, lower-cased)
entity_type  text  → 'job' (checked)
entity_id    uuid  → jobs (on delete cascade)
source       text  → 'user_confirmed' (checked)
active       boolean (default true)
created_at / updated_at
```

- Owned and RLS-protected by the existing `own …` conventions.
- One unique index `(user_id, alias, entity_type, entity_id)`: the same alias
  for the same entity exists once. The same user may still hold one alias for
  several entities — that is genuine ambiguity, and it is permitted.
- Deleting the target job cascades to its rows, so a relationship can never
  outlive the entity it points at.
- Alias values are normalized (lower-cased, road abbreviations expanded), so
  "Belgium Rd" and "Belgium Road" are the same stored term.

No generic relationship framework was introduced. This is the single,
narrow confirmed-term-to-entity table the feature needs.

## How a confirmation creates a relationship

In the Today capture sheet, confirming "Do you mean Fix Kitchen?" does two
things:

1. Continues the current capture exactly as before (job + location attached
   to the task being created).
2. Persists the relationship. The stored alias is the distinctive term the
   user actually typed — `deriveAliasTerm` picks the query token(s) that
   matched the candidate's matched field, so "new tap for Kitchen" stores
   `kitchen` and "Belgium Rd tomorrow at 10am" stores `belgium road`.

Persistence is best-effort and **never blocks the task**: if the write fails,
the task is still captured and the relationship is simply not learned this
time (nothing is silently pretended to have been learned).

## Resolver precedence

`resolveJobAndLocation(parts, jobs, memory)` stays generic; `memory` is an
optional view of the user's confirmed relationships. Resolution order:

1. **User-confirmed relationship** (active, unambiguous, and the input does
   not identify a different entity more strongly) → `'known'`: resolved
   automatically, **no prompt**.
2. **User-confirmed relationship, genuinely ambiguous** (same term confirmed
   for more than one active entity) → `'choose'`: the "Which one?" flow is
   shown; nothing is silently chosen.
3. **Fuzzy textual matching** — exactly V1.1 (`'proposed'` → ask, `'choose'`
   → pick, `'none'` → nothing).
4. **Unknown** — behaves exactly as before (never invents).

A confirmed term has strong authority over a merely fuzzy tie, but it must
not override a genuine conflict. Two properties keep this honest:

- If the input **explicitly names** a different entity with a strictly
  stronger textual score than the aliased entity, the confirmed relationship
  yields to the fuzzy flow (so "Johns Kitchen" is never silently overridden
  by a learned "Kitchen → Fix Kitchen").
- If the same term was confirmed for several entities, the resolver reports
  ambiguity rather than guessing.

## Ambiguity handling

There are three distinct things the resolver reasons about separately:

1. **Textual/fuzzy match** — "Kitchen" matches "Fix Kitchen": a *candidate*.
2. **User-confirmed relationship** — "Kitchen → Fix Kitchen" (confirmed):
   *learned knowledge*.
3. **Current contextual ambiguity** — both "Fix Kitchen" and "Johns Kitchen"
   are relevant right now.

Only when (2) is unambiguous *and* the text does not out-weigh it with (3)
does the resolver auto-apply. Otherwise it keeps the existing
proposed/choose/decline flow. One user's learned term never applies to
another user or another context: memory is per-user, and rows are private
under RLS.

## Entity lifecycle / invalidation

"Persistent" does not mean "eternal and irreversible".

- **Delete the entity** → row is cascade-deleted. The relationship cannot
  survive its target.
- **Entity finishes** → jobs carry no status, so "finished" uses the existing
  derived lifecycle (`isJobDone`: the job has tasks and all are done). The
  caller supplies `activeEntityIds`; a relationship to a finished entity is
  treated as expired and falls back to the normal fuzzy flow (which still
  asks). A completed job is never silently forced.
- **Take a relationship out of use** → the row is kept with `active = false`
  (resolver ignores it). Re-confirming the pairing revives it via the
  upsert. No alias-management UI is part of V1.2.

## Files

- `supabase/schema.sql` — additive `entity_aliases` migration + RLS.
- `lib/unifiedInput/resolve.ts` — `'known'` state, `EntityRelationshipMemory`,
  `aliasMatchesQuery`/`matchesForConfirmedAliases`, `deriveAliasTerm`,
  `normalizeAliasPhrase`; precedence above.
- `lib/unifiedInput/__tests__/resolve.test.ts` — the V1.2 behaviour matrix.
- `app/page.tsx` — loads aliases + done-job ids, builds `entityMemory`,
  auto-applies `'known'`, persists on confirmation (best-effort upsert).
- `components/CaptureSheet.tsx` — resolution panel surfaces for
  facet-less proposed/choose/known; `'known'` shows a quiet "In X — Not this"
  instead of a question.

## Fit with Practical Intelligence

V1.2 is the same discipline as the rest of the engine: **discrete decision
states, explicit evidence, deterministic rules**. The Thinking Engine's
capture-time predictions and the personal-gravity/decision layers all feed
the same healthy loop — here the "evidence" is an explicit user action (a
confirmed relationship), persisted per-user and consumed by a generic
resolver. The parser does not change; V1.1 behaviour (dates, times,
priorities, obligation filler, road extraction, fuzzy resolution, and the
confirmation flow itself) is preserved verbatim for anything not covered by a
confirmed relationship.