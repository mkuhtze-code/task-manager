# Phase N — Semantic Contract and Authority Audit

**Status:** Source audit started; no runtime behavior changed in this phase.
**Branch:** `phase-n-semantic-authority-audit`
**Governing constraint:** [Universal Intelligence Rule](./UNIVERSAL_INTELLIGENCE_RULE.md)
**Precondition:** Preserve the merged Phase M task-continuity behavior and existing Phase B diagnostic baseline.

## Executive finding

The current repository has a rich speech semantic representation and a separate engine semantic representation, but the inspected capture hand-off does not pass one shared semantic object through both systems. The engine also constructs its semantic result by invoking both the request parser and the semantic grammar parser, then selectively choosing fields. This is a concrete dual-source merge point.

The first safe step is to freeze the boundary and its evidence before changing runtime behavior. Do not remove interpreters, rename contracts, or change execution policy as part of this audit-only change.

## Source evidence inspected

| Layer | Current source / contract | Audit finding |
|---|---|---|
| Speech input | `lib/speech/captureAdapter.ts`, `lib/speech/pipeline.ts` | Speech has a dedicated pipeline, result, decision, confidence, and evidence trail. The capture adapter exposes both normalized text and semantic proposals. |
| Speech semantic model | `lib/speech/semantic/types.ts` | Multi-act representation includes act kind, polarity, raw span, action/object/subject, temporal data, conditions, dependencies, references, corrections, evidence, and confidence. |
| Speech decision | `lib/speech/decision.ts` | A separate decision layer maps speech acts into create/update/ask/learn/no-op outcomes. Interpretation and permission are conceptually separate, but this is a second action decision authority to compare against the engine. |
| Communication meaning | `lib/communication/understand.ts` | A further derived-meaning/action mapping is shared by speech and meeting paths; its overlap with the semantic-act model needs an explicit ownership decision. |
| Engine semantic boundary | `lib/engine/semanticInterpreter.ts` | Defines `SemanticInterpretation` v1, but calls both `interpretRequestUtterance()` and `parseSemanticGrammar()` for the same normalized utterance. |
| Engine request parser | `lib/engine/request.ts` | `EngineRequest` is a task/action-oriented request contract with object, location, date/time, urgency, commitment, constraints and raw utterances. It also contains independent interpretation rules. |
| Engine grammar | `lib/engine/semanticGrammar.ts` | Produces role slots for selected verb families; otherwise returns a sparse frame and delegates meaning back to legacy parsing. |
| Orchestration | `lib/engine/orchestrate.ts` | The engine cycle interprets semantic input and applies utterance-to-request refinement. Current behavior includes a compatibility merge, not a single semantic source feeding an adapter. |
| Interaction / CPU | `lib/engine/interaction.ts`, `lib/cpu/index.ts` | Interaction has special-case routes around the ordinary cycle. CPU adds beliefs and specialist observations after the interaction result. Execution is separately guarded by ACT + authority + a recommended action. |
| Corpus | `docs/architecture/INTELLIGENCE_CORPUS_SPEC.md` | 48 examples are currently draft development examples; there are no reviewed validation or held-out examples. This is not yet a trustworthy held-out quality score. |

## Findings and required decisions

### N1 — Canonical meaning is not yet a cross-surface contract (P0)

The speech semantic model is multi-act and evidence-oriented. The engine semantic model is a single utterance-level task-oriented object. These models overlap but are not interchangeable. Flattening speech meaning to capture text and re-interpreting that text can discard act boundaries, polarity, correction links, conditions, temporal relations, references, and evidence provenance.

**Decision:** the canonical contract must be expressive independently of task-management actions. Speech and typed input may have different input adapters, but after normalization they must produce the same versioned semantic envelope. A typed utterance and a faithful transcript of that utterance should converge on equivalent semantic acts, allowing differences only where transcript confidence or repair evidence justifies them.

### N2 — Multiple semantic authorities are active (P0)

The engine semantic interpreter invokes two parsers and selects fields based on grammar relations. Speech interpretation, semantic composition, communication understanding, speech decisions, engine request refinement, and interaction special cases can all contribute classifications or actions.

**Decision:** distinguish three responsibilities:
1. **Evidence producers** may detect spans, candidate roles, temporal phrases, references, discourse markers, and domain vocabulary. They must identify their source and must not independently decide the final meaning.
2. **Semantic composition** resolves evidence into one canonical semantic representation, retaining alternatives and uncertainty when unresolved.
3. **Policy and execution** consume canonical meaning plus context and authority. They do not re-parse the raw utterance to invent a competing meaning.

Existing modules should be migrated incrementally behind adapters. Do not delete a parser until call sites, unique capabilities, and regression coverage are mapped.

### N3 — Provenance needs stable structure, not only string arrays (P1)

Current types carry evidence in several forms: speech `SemanticEvidence`, engine `evidence: string[]`, constraints with a source string, and `LearningEvidence` payloads. This makes traceability inconsistent and difficult to compare across paths.

**Decision:** canonical facts/acts need machine-readable provenance: source input ID, source kind (typed/transcript/repair/context/learning), exact span where available, producer, evidence kind, confidence, and any derived-from links. Do not put raw sensitive transcript text into production telemetry by default; provenance IDs and redacted summaries should be sufficient for operational metrics.

### N4 — Semantic content and executable capability are coupled (P1)

`RequestAction`, `EngineAction`, and the CPU's `UniversalAction` union describe what the current product can execute. They must not constrain what the semantic layer can understand. An utterance may be a question, observation, report, conditional intention, correction, or unsupported request without being a create-task action.

**Decision:** represent meaning first, then map it to a supported operation through a separately testable capability adapter. Unknown execution support must not erase understood content or force a false clarification about language meaning.

### N5 — Learning is distributed and update ownership is unclear (P1)

Speech vocabulary/correction learning, communication profiles, working memory/active requests, CPU belief graphs, behavior beliefs, and thinking-engine observations have different data models.

**Decision:** do not merge storage systems indiscriminately. Establish one typed learning event / correction fact with provenance and explicit subscribers or adapters. Each subsystem must state which evidence it owns, whether it is durable, and how corrections invalidate or supersede prior beliefs. Prevent one correction from being interpreted independently into conflicting updates.

### N6 — Quality baseline is not yet strong enough for a large refactor (P0)

The semantic corpus currently has 48 draft development examples and no held-out split. The Phase B 48-case diagnostic baseline is specified as separate from the corpus and must remain unchanged. Passing isolated speech or engine tests does not prove cross-path parity.

**Decision:** before the first behavior-changing consolidation:
- preserve and run the existing Phase B diagnostic baseline;
- add paired typed/transcript fixtures with equivalent source meaning;
- capture intermediate results from speech and engine paths;
- agree gold labels independently before using corpus examples as release gates;
- report semantic equivalence, safe-action precision, unnecessary clarification rate, and per-domain failures;
- do not call draft corpus performance a held-out score.

## Proposed canonical semantic envelope (design target, not yet implemented)

The envelope should be versioned and domain-neutral. A first implementation should prefer a small stable outer contract with composable acts and evidence, rather than flattening every concept into one large task object.

Required concepts:

- `contractVersion` and stable `utteranceId`;
- immutable input evidence references, including input mode and original text reference;
- one or more acts, each with kind, raw span, polarity, modality/commitment, and confidence;
- typed participants, entities, objects and relations, with stable entity/reference links where available;
- temporal and spatial expressions as explicit facts, preserving raw phrase and normalized value separately;
- conditions, dependencies, corrections/retractions, discourse links and act ordering;
- uncertainty and alternatives where evidence is insufficient;
- provenance for every derived fact;
- a clear separation between semantic interpretation and proposed operation, authority decision, and execution result.

Avoid making every field mandatory when it is not applicable. Avoid a finite universal verb allowlist. Avoid embedding task-title formatting or CPU action unions in the semantic contract.

## Safe migration sequence

1. **Freeze baseline:** identify exact commands and fixtures for Phase B, Phase M continuity, speech adversarial tests, engine tests, and corpus validation.
2. **Build paired replay harness:** run the same input through typed and speech-semantic seams without mutating state; compare normalized canonical meaning and intermediate evidence.
3. **Define contract and adapters:** type the envelope and map existing speech/engine structures into it without changing execution.
4. **Shadow mode:** generate canonical output alongside current output; record differences in test artifacts, not raw production transcripts.
5. **Select one composition authority:** after capability and discrepancy review, make one composer authoritative; all legacy parsers become evidence producers/adapters or are retired.
6. **Unify correction/learning events:** route confirmed corrections through the shared event contract with explicit subsystem ownership.
7. **Remove duplicate whole-utterance interpretation only after parity gates pass.**

## Acceptance criteria for the implementation phase

- Equivalent typed and transcribed inputs produce equivalent canonical acts and relations, apart from explicitly modelled transcription uncertainty.
- The canonical semantic contract is independent of current executor/action unions and domain vocabulary.
- Every consequential derived fact has inspectable provenance.
- Speech, engine, and communication modules no longer independently compete to author final utterance meaning.
- Questions, observations, negation, conditions, reported speech, corrections, and multi-act utterances retain their semantics through to policy.
- Safe-action precision does not regress; unnecessary clarification is measured and does not rise without a documented safety reason.
- Phase B and Phase M regressions remain green; a reviewed cross-domain validation set is required before claiming general quality improvement.
- The app remains deterministic and does not introduce an external LLM, cloud language model, or third-party interpretation dependency.

## Scope of this phase

This change records source evidence, authority boundaries, migration order, and measurable gates only. It deliberately does not change runtime behavior. The next implementation phase should add the paired replay harness and baseline reporting before changing semantic authority.
