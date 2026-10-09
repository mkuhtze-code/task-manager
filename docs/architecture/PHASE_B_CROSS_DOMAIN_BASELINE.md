# Phase B — Cross-domain intelligence baseline

**Benchmark ID:** `phase-b-cross-domain-baseline-v1`  
**Status:** corpus and reproducible diagnostic harness implemented; measured baseline pending CI execution  
**Rule:** [Universal Intelligence Rule](./UNIVERSAL_INTELLIGENCE_RULE.md)

## Purpose

Measure current deterministic language/capture behavior across unrelated domains **before** changing the interpretation architecture. This benchmark is diagnostic: it records failures and disagreements instead of disguising them as passing assertions or making today's weak behavior the target contract.

The corpus intentionally mixes direct actions, questions, observations, past reports, negation, corrections, uncertainty, conditions, multiple clauses, contextual references, and unfamiliar vocabulary. Construction/site work is one domain among ten.

## Coverage

The harness contains 48 fixed-text cases in these domains:

- everyday personal life
- communication and relationships
- education and research
- office and client work
- creative activity
- travel and logistics
- construction and site work
- unfamiliar vocabulary
- corrections and discourse
- context-dependent / ambiguous references

Each case has expected semantic anchors and an expected interaction mode: `task`, `non_task`, or `preserve`. `preserve` means the benchmark should inspect what the system retained without pretending context-free execution is always appropriate.

## Paths measured

For each identical input, the harness records:

1. `processCaptureSpeech` → `textForCaptureField` (speech/capture interpretation, with fixed text supplied as transcript)
2. capture text → `runCaptureDock(inputType: speech_transcript)`
3. original text → `runCaptureDock(inputType: text)`

This exposes where information is lost in the speech-to-capture handoff and where speech and typed input disagree at the Dock boundary.

**Important limit:** this does not measure acoustic speech recognition, microphone capture, or word-error rate. Those require audio fixtures and must be reported as a separate benchmark. Transcript repair is exercised only insofar as it operates on the supplied text.

## Metrics

- **Anchor recall:** proportion of expected source-meaning anchors present in the capture line and in each Dock result's text/location/date/message. This is a transparent proxy for information retention, not a complete semantic score.
- **Task-mode accuracy:** for cases explicitly labeled `task` or `non_task`, whether the result is an executable `act_create` / `act_update` versus another outcome. Ambiguous/conditional cases marked `preserve` are excluded from this single metric.
- **Speech/typed disagreement:** case IDs where speech-to-Dock and typed-to-Dock differ on task-mode correctness.
- **Per-domain anchor recall:** prevents a strong score in one domain from hiding poor coverage elsewhere.
- **Case-level failures:** missing anchors and mode mismatches are emitted with inputs and outputs so they can be classified by layer.

No universal-performance threshold is asserted before observing the first baseline. A diagnostic test can exit successfully while recording serious product failures; its green status means the harness ran, not that the intelligence passed.

## First baseline result

**Not yet measured.** CI must run `npm run test:phaseB`. The test emits one machine-readable `PHASE_B_CROSS_DOMAIN_BASELINE=` JSON record in the Vitest log. Preserve the initial output as the pre-refactor baseline and compare later changes against the same corpus and metric definitions.

If CI fails before emitting the record, classify that as a harness/build failure rather than a product score. If the test runs but metrics are poor, keep those failures visible and use them to prioritize the architecture work.

## Interpretation safeguards

- Do not tune the system only to these exact strings; use them as a stable regression set and add held-out paraphrases.
- Do not treat lexical anchor recall as proof of full understanding.
- Do not penalize conservative non-action for an observation or question.
- Do not reward a task being created when the input is negated, reported, retracted, or only speculative.
- Keep speech recognition, transcript repair, semantic interpretation, contextual resolution, authority/safety, and execution errors separate.
- Any later canonical semantic contract must preserve the source input and expose evidence, alternatives, confidence, and unresolved references.
- Add personalized-context fixtures separately; the context-dependent cases here intentionally establish a no-context baseline first.

## Next step after measurement

Review every false positive, false negative, missing anchor, and speech/typed disagreement. Classify each by the earliest layer where it appears. Then design the versioned canonical semantic contract and migration plan against those observed failures. Do not add more domain-specific verbs as a substitute for this analysis.
