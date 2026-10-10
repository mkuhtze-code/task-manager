# Phase N — Canonical Semantic Contract and Evaluation Gates

## Decision

The existing `dokkit.semantic-envelope@1` is the candidate interchange contract, not yet a production authority. Keep speech and engine outputs as evidence producers until the evaluation baseline shows what each preserves and loses. Do not add a third whole-utterance interpreter or make the envelope executable.

## Required meaning to preserve

A canonical representation must preserve, without flattening or silently discarding:

- **Acts:** one or more distinct acts, stable IDs, raw source spans, and act kind (action, question, observation, report, commitment, correction, refusal, etc.).
- **Arguments and entities:** predicate/action, object, subject/agent, entity candidates, resolved IDs when grounded, and the distinction between unresolved and absent.
- **Polarity and modality:** positive, negated, unknown; certainty, commitment, possibility, prohibition and conditionality where evidenced.
- **Time and order:** raw temporal expression, normalized value when resolvable, relation (on/by/before/after/until), timezone/date basis where applicable, and ordering of corrections.
- **Relations:** conditions, dependencies, references, purpose/embedded acts, and links between acts. Preserve unresolved targets rather than inventing one.
- **Corrections and retractions:** retain the full ordered chain and which act/facet each correction affects; later corrections supersede earlier values only when the evidence supports that relation.
- **Uncertainty and provenance:** source producer/version, input/transcript provenance, raw spans/evidence, confidence as supplied (never averaged across producers), and explicit loss notes for lossy projections.
- **Decision boundary:** interpretation must not imply task creation, persistence, dispatch, or execution authority. Those remain downstream decisions.

## Current measurement boundary

The 16-case reviewed-label baseline annotates required positive features and descriptive expected meaning. It is suitable for measuring *positive-feature recall* only. It does **not** enumerate verified negative features, exact act/argument graphs, or a complete gold interpretation. Therefore it cannot honestly report precision, false-positive rate, exact semantic accuracy, or production readiness.

The new feature-recall report must expose:
- total required feature instances, matched and missing;
- recall overall, by domain, and by feature;
- case/domain coverage and deterministic sorted output;
- duplicate-label protection;
- no inferred false positives from unlabelled features.

A high recall number is not semantic correctness: it does not verify argument roles, correction targets, temporal values, or whether an embedded purpose was incorrectly split into a second task.

## Evaluation expansion before authority migration

1. Preserve the current baseline as a diagnostic snapshot; never rewrite observed outcomes to make the score look better.
2. Expand reviewed examples across personal, communication, research, creative, travel, home, business, and unfamiliar-vocabulary domains. Include both task and non-task inputs.
3. Add explicit negative labels and structured expectations for act boundaries, predicate/arguments, polarity, corrections, time relations, conditions, dependencies, references, and prohibited actions.
4. Keep development, validation, and held-out families disjoint. Only reviewed labels may contribute to release gates; draft labels remain probes.
5. Score typed and fixed-transcript speech paths separately. Acoustic transcription quality is a separate evaluation.
6. Report harmful false actions, missed intended actions, incorrect mutations, and unnecessary clarification separately; aggregate accuracy must not hide safety-critical errors.
7. Compare on the same utterance and same context snapshot. A text mismatch is an invalid paired comparison, not a semantic disagreement.

## Promotion gates

No production capture path should consume a composed/canonical envelope until all are true:

- the schema has explicit versioning and invariants for IDs, references, source spans, correction order and provenance;
- reviewed validation and held-out sets have agreed scoring rules and minimum thresholds set before evaluating a candidate;
- no silent loss of negation, correction, condition, dependency, reference or multi-act structure in the acceptance suite;
- false task creation and prohibited-action execution are separately measured and meet explicitly agreed safety thresholds;
- typed and speech pathways show acceptable semantic consistency without treating either as ground truth;
- the new path has shadow/live-capture evidence and a rollback plan;
- legacy authorities are retired only after parity and regression evidence, not as a prerequisite for comparison.

## Non-goals

No domain-specific grammar, external LLM/API, confidence averaging, automatic task execution, or production mutation is introduced by this evaluation step.
