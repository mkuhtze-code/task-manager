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

The 16 cases are candidate expectation assertions authored for evaluation development; they have not yet been independently human-reviewed and must not be treated as gold labels. The expected assertions are visible and versioned in the test source. The runner explicitly reports them as pending human review. Because the labels still use term-level matching for some arguments and time expressions, scores are not equivalent to full semantic accuracy. A term match does not prove correct argument roles, reference resolution, date normalization, or action safety. Criteria and labels must be reviewed before thresholds are introduced.

No arbitrary minimum score is imposed in this phase. Candidate labels do not contribute to release gates until a reviewer confirms or revises each assertion. The harness records failures so they can guide reviewed label refinement. The baseline is not to be silently edited to make a producer pass. Add independent validation and held-out cases before using any score as a release gate.

## Guardrails

- No production capture path, persistence, task creation, dispatch, or execution is changed.
- No producer is selected as canonical authority.
- No domain-specific grammar or external AI/API is added.
- No automatic confidence averaging or mutation is introduced.


## Role-aware scoring extension

The role-aware scorer reports predicate, object, subject, person-mention, relation, and correction-facet assertions separately. A word in the object no longer satisfies a predicate expectation. Person mentions are not assumed to be recipients or speakers; those roles need dedicated schema support before they can be scored as such. This remains diagnostic, and candidate labels require human review.
