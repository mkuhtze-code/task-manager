# Phase N — Semantic Expectation Scoring

## Purpose

This phase adds a structured, diagnostic evaluation layer to the positive-feature recall baseline. It scores explicitly reviewed assertions against both speech and engine semantic envelopes without assuming either producer is ground truth.

## Scored dimensions

- Act count bounds and expected/forbidden act kinds.
- Required and forbidden action terms (from action/commitment predicate and object fields, not the whole utterance).
- Required entity and temporal terms.
- Explicit task-creation prohibition.
- Negation, correction, condition, and dependency presence.

Each assertion is reported as pass/fail with the expected value and observed evidence. False-action expectations are explicit negative assertions rather than inferred from missing positive labels. Speech and engine scores are separate and diagnostic; differences do not authorize execution or select an authority.

## Interpretation and limitations

The 16 cases are a first reviewed evaluation slice, not a statistically representative corpus. The expected labels are visible and versioned in the test source. Because the labels still use term-level matching for some arguments and time expressions, scores are not equivalent to full semantic accuracy. A term match does not prove correct argument roles, reference resolution, date normalization, or action safety. Criteria and labels must be reviewed before thresholds are introduced.

No arbitrary minimum score is imposed in this phase. The harness records failures so they can guide reviewed label refinement. The baseline is not to be silently edited to make a producer pass. Add independent validation and held-out cases before using any score as a release gate.

## Guardrails

- No production capture path, persistence, task creation, dispatch, or execution is changed.
- No producer is selected as canonical authority.
- No domain-specific grammar or external AI/API is added.
- No automatic confidence averaging or mutation is introduced.
