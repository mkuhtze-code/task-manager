# Phase N — Shadow Semantic Composition Model

## Purpose

The paired replay, reviewed-label baseline, semantic adapters, and shadow comparison now provide a way to inspect the same utterance through two representations. This phase adds a deterministic, reviewable composition plan without producing a canonical semantic envelope or changing capture behavior.

The goal is to make conflict and abstention explicit before any proposal to consolidate semantic authority.

## Per-signal rules

For each declared signal:

1. **Different input:** if normalized utterance text differs, abstain for every signal. No candidate is emitted.
2. **Unknown / unrepresented:** if either producer reports null, abstain. Missing representation is not negative evidence.
3. **Conflict:** if both producers report a value but disagree, preserve both values and abstain. Neither producer wins by default.
4. **Convergence:** if both producers report the same representable boolean, expose it only as a converged candidate. Agreement is not ground truth and does not authorize an action.

The plan retains each producer's observed value and the underlying comparison status. Aggregate counts are derived from per-signal outcomes.

## Explicit non-goals and guardrails

- Does not synthesize a semantic envelope.
- Does not merge acts, entities, corrections, time, conditions, or dependencies into an executable representation.
- Does not select a semantic authority, set confidence by averaging, or use a producer-priority rule.
- Does not ask the user to clarify solely because the current adapters disagree.
- Does not alter capture, persistence, task creation, dispatch, or execution.
- Does not introduce a network dependency, external LLM, or domain-specific grammar.

## Review criteria for the next step

Before a canonical composition model is considered, use paired replays and reviewed labels to review:
- false convergence: both producers agree but the label shows meaning was missed;
- conflict rates by signal and domain;
- unknown/representation-gap rates;
- whether the signal vocabulary is sufficient and domain-neutral;
- whether source evidence can be traced back to raw spans and producer provenance.

A later canonical model must preserve acts, polarity, corrections, temporal relations, conditions, dependencies, references, entities, uncertainty, and provenance. It must keep understanding separate from authority and execution. Promotion beyond shadow mode is a separate change requiring live-capture evidence and explicit review.
