# Phase N — Shadow Semantic Comparison

## Purpose

The reviewed-label baseline measures which semantic features are visible in the speech and engine envelopes. This phase adds a deterministic comparison layer that reports agreements, disagreements, and representation gaps for the same utterance.

This is a measurement boundary, not the future composition authority. It deliberately does not merge producer output or decide which interpretation is correct.

## Contract

`compareSemanticEnvelopes(speech, engine)` returns a versioned `dokkit.semantic-shadow-comparison` report containing:

- normalized input identity (different utterances are never counted as agreement);
- one observation per declared signal, including producer, adapter version, and lossy-projection metadata;
- per-signal status: `agree`, `disagree`, `not_comparable`, or `different_input`;
- aggregate counts for the diagnostic report;
- explicit null authority and execution/mutation guardrails.

## Unknown is not false

The engine adapter is explicitly a lossy single-frame projection. It cannot currently represent negation, conditions, dependencies, or multiple acts with sufficient fidelity for absence to mean false. Those engine observations are therefore `null` and status `not_comparable`, rather than false. The list is an adapter capability boundary and must be revised when the contract can faithfully preserve those dimensions.

Other values remain producer observations, not ground truth. Agreement is not proof of correctness; disagreement is a review signal, not an instruction to prefer speech or engine.

## Guardrails

- No production capture, task persistence, dispatcher, or execution wiring consumes this report.
- The comparison function has no side effects and no network dependency.
- It does not choose a winning producer, synthesize an executable action, or suppress clarification.
- A mismatch in normalized utterance text prevents all semantic agreement counts.
- Build and CI run the comparison tests alongside the reviewed-label baseline.

## Next step

Use paired replay and the reviewed labels to inspect the per-signal disagreement distribution. Only after reviewing those results should the next phase define a canonical semantic composition model, its conflict/abstention rules, and a shadow-only integration point. Promotion into production capture must remain a separate, explicitly tested change.
