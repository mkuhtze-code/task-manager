# Dokkit Speech Engine Quality Bar

**Status:** Proposed acceptance contract; not evidence that production currently meets these targets.  
**Owner:** Speech Intelligence / Capture  
**Last reviewed:** 2026-10-12

This document defines how speech-engine quality is measured and what must be true before a capability is described as production-ready. The deterministic semantic engine remains authoritative. Transcription, semantic interpretation, proposal generation, user confirmation, and persistence are separate stages and must be measured separately.

## Non-negotiable invariants

1. **Understanding is not permission.** Interpretation may produce proposals, but only the existing explicit confirmation/authorization path may persist a task or update.
2. **No false work from non-actions.** Questions, observations, completed reports, speculation, hypotheticals, negation, and refusals must not become executable work unless the utterance contains a distinct, clearly intended action.
3. **Preserve source evidence.** Keep the original transcript. Normalization or repair must not silently erase meaningful names, numbers, dates, negation, conditions, dependencies, or correction history.
4. **Uncertainty stays visible.** An unresolved reference or consequential ambiguity must remain unresolved or request clarification; do not invent a referent.
5. **Universal Intelligence Rule.** Shared semantic behavior must be domain-neutral. Domain vocabulary can contribute evidence but must not take over whole-utterance interpretation.
6. **Privacy by design.** Production telemetry must not store raw audio, transcripts, task text, names, addresses, or free-form semantic payloads by default.
7. **No unsupported quality claims.** Draft corpus annotations, typed/transcript parity, successful builds, and ready preview deployments are not independent proof of semantic correctness or real-device STT quality.

## Evaluation layers

| Layer | What it measures | Evidence required |
|---|---|---|
| Capture / STT | Permission, recording, upload, provider response, transcript availability, fallback behavior | Real-device/browser smoke tests by supported platform and locale; provider errors and latency |
| Semantic interpretation | Action type, polarity, temporal meaning, corrections, dependencies, references, entities, uncertainty | Independently reviewed gold cases with explicit expected fields |
| Capture projection | Whether speech interpretation survives conversion into the Capture Dock input | Paired end-to-end tests from the same natural utterance |
| Safety / authority | Whether non-actions avoid executable proposals and no mutation occurs before confirmation | Negative safety suite plus mutation-boundary tests |
| Learning | Whether explicit confirmations/corrections improve future interpretations without cross-user leakage | Deterministic learning tests, persistence tests, multi-device replay |
| Thinking loop | Whether confirmed outcomes improve estimates/capacity without overriding user intent | Before/after outcome-linked tests and evidence provenance |

## Merge-gate requirements

- Keep unit and integration suites for STT routing, locale normalization, capture projection, semantic interpretation, authorization, and persistence in CI/build gates.
- Safety tests must include both positive and negative cases; a parser that blocks everything must not pass.
- Cross-path parity is diagnostic unless each expected semantic outcome is independently reviewed. Equal outputs can be equally wrong.
- Evaluation data must be split by scenario family, not just exact utterance. Exact normalized duplicates must not cross development, validation, and held-out splits.
- Only reviewed examples may count toward reported accuracy. Draft examples may guide development but must not be called gold truth.
- Any intentional change to a safety invariant requires an explicit rationale and new regression coverage.

## Initial release thresholds

These are proposed exit thresholds. They must be measured on reviewed, held-out cases and real capture smoke tests before being called achieved.

| Metric | Initial exit threshold | Notes |
|---|---:|---|
| Unauthorized persistence | 0 cases | Hard gate; any failure blocks release |
| Non-action → executable proposal | 0 cases in reviewed safety suite | Hard gate; include questions, reports, negation, speculation, and hypotheticals |
| Critical semantic anchor retention | ≥ 98% | Names/entities, negation, correction-final value, dates/times, dependencies, explicit location |
| Action / non-action classification | ≥ 95% | Report overall and by scenario family; do not hide low-performing families in averages |
| Unresolved reference handling | 100% of reviewed ambiguous cases remain unresolved or clarify | No unsupported silent resolution |
| Speech-to-capture critical-field regression | 0 new critical regressions | Pair cases by original utterance and compare expected fields |
| Capture success | ≥ 99% of supported-platform smoke attempts | Report browser/device and locale; do not infer from unit tests |
| End-to-end proposal latency | p50 ≤ 800 ms, p95 ≤ 1,200 ms on defined good-network benchmark | Measure capture stop to rendered proposal; STT provider latency is included |
| Telemetry privacy | 0 raw audio/transcript/task-content fields in default events | Verify event schema and payloads, not just documentation |

Do not report a threshold as achieved until the test set size, review status, platform matrix, measurement window, and numerator/denominator are recorded. A zero-failure result on a small suite is a gate, not a statistical guarantee.

## Privacy-safe event contract

Prefer bounded, non-content fields such as:

- event name: capture_started, capture_succeeded, capture_failed, proposal_shown, proposal_confirmed, proposal_corrected
- capture path: web_speech, cloud_blob, native, typed
- provider: configured provider identifier, never credentials
- locale: supported locale tag
- duration_ms: bounded non-negative integer
- result: success, unavailable, timeout, rejected, clarified, confirmed, corrected
- confidence_band: low, medium, high
- reason_code: allowlisted enum, not free text
- app version and coarse platform family

Do not attach raw utterances, transcripts, task summaries, contact names, locations, audio, full error bodies, or arbitrary semantic JSON. Avoid stable identifiers unless there is a documented need, access control, retention policy, and user-facing privacy basis. Keep aggregate counters separate from content-bearing application data.

## Production readiness checklist

- [ ] Cloud STT provider and credentials configured in the production environment; credentials are never exposed to client bundles.
- [ ] Provider health/configuration probe returns accurate configured/unconfigured state without leaking secrets.
- [ ] Supported browser/device capture paths have smoke-test evidence, including unsupported-Web-Speech fallback.
- [ ] Locale behavior is explicitly declared; unsupported locales degrade visibly rather than silently claiming support.
- [ ] Reviewed held-out semantic cases and scenario-family results are published with denominators.
- [ ] Safety invariants and authorization-boundary tests pass.
- [ ] Privacy-safe telemetry schema is reviewed and payload-tested.
- [ ] Failure UX covers permission denial, no speech, timeout, network loss, provider failure, and retry.
- [ ] A rollback/disable switch exists for cloud provider failures without disabling typed capture.
- [ ] Known limitations are documented; do not claim hands-free/TTS, offline semantic parity, or cross-session memory until verified.

## Reporting format

For every quality pass, report:

1. What changed (code, tests, configuration, or documentation).
2. Which suites ran and their exact results.
3. Reviewed held-out score, denominator, and per-family failures (or state that no gold score exists yet).
4. Real capture platforms/locales tested (or explicitly state none).
5. Production configuration status, separately from preview deployment status.
6. Remaining blockers and the next highest-value pass.
