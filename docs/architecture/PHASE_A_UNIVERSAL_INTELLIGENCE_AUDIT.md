# Phase A — Universal Intelligence Dependency and Assumption Audit

**Status:** Phase A source/dependency and hard-coded-assumption audit complete for the core capture/intelligence paths reviewed. Cross-domain performance baseline is the next phase.  
**Scope:** repository architecture and runtime paths; no production behavior changed by this audit  
**Governing rule:** [Universal Intelligence Rule](./UNIVERSAL_INTELLIGENCE_RULE.md)

## Executive finding

Dokkit already contains substantial deterministic intelligence work, including discourse handling, corrections, polarity, temporal expressions, references, confidence, evidence, contextual learning, safety decisions, and planning. The primary architectural risk is not simply missing vocabulary. It is that the repository has multiple overlapping routes that derive intent and meaning, with different representations and finite action assumptions, before the system reaches execution.

The most important finding from tracing the current source is that there are **two capture interpretation paths**:

- A speech-specific interpretation and decision path that is then adapted into text for the capture field.
- A general engine path that interprets the resulting capture text again before deciding what the operating engine should do.

That can be useful as a layered pipeline only if the first path preserves input evidence and the second consumes the same canonical meaning. Today the inspected interfaces show different semantic models and different intent/action vocabularies, so the hand-off is a likely source of meaning loss or disagreement. This must be measured before any rewrite.

## 1. Runtime dependency map

### Path A — speech capture

Observed source chain:

`MicButton / speech input`
→ `hooks/useCaptureSpeech.ts`
→ `processCaptureSpeech()` in `lib/speech/captureAdapter.ts`
→ `processSpeechText()` in `lib/speech/pipeline.ts`
→ contextual transcript repair (`lib/speech/sttRepair.ts`)
→ personal vocabulary and name aliases (`lib/speech/learning.ts`)
→ normalisation (`lib/speech/normalise.ts`)
→ `interpretSpeech()` (`lib/speech/interpret.ts`)
→ semantic composition (`lib/speech/semantic/compose.ts`, with polarity, corrections, conditions, dependencies, references, temporal spans, discourse and safety helpers)
→ `decideSpeechActions()` (`lib/speech/decision.ts`)
→ `CaptureSpeechResult` / `textForCaptureField()`
→ CaptureSheet input
→ Path B below.

The speech path also contains `lib/communication/understand.ts`, invoked from `interpretSpeech`, and the meeting flow uses `understand()` directly. That makes communication understanding a shared dependency, but not yet the single semantic authority.

### Path B — capture field to action

Observed source chain:

`components/CaptureSheet.tsx` (and the travel capture surface)
→ `runCaptureDock()` in `lib/engine/captureDock.ts`
→ `processCpuInteraction()` in `lib/cpu/index.ts`
→ `processInteractionCore()` in `lib/engine/interaction.ts`
→ `runEngineCycle()` in `lib/engine/orchestrate.ts`
→ `interpretSemanticInput()` in `lib/engine/semanticInterpreter.ts`
→ both `interpretRequestUtterance()` (`lib/engine/request.ts`) and `parseSemanticGrammar()` (`lib/engine/semanticGrammar.ts`)
→ request refinement, reference/context resolution, authority and planning
→ CPU belief/context/brain reconciliation
→ a dock outcome that the surface maps to a safe action, clarification, answer, defer, or no-op.

The CPU is a façade around the existing interaction core; it currently invokes that core first, then adds universal context, belief updates, specialist-brain observations, and reconciliation. The action dispatcher (`lib/cpu/actions/dispatcher.ts`) routes a finite set of action kinds to task, list, job, meeting, and travel executors.

### Other connected consumers

- `components/MeetingSheets.tsx` and `components/TaskDetailSheet.tsx` also call the speech capture adapter.
- `lib/communication/meeting.ts` maps utterances through `understand()`.
- The speech adversarial runner and benchmarks exercise speech interpretation directly.
- Engine, CPU, and speech test suites exercise different seams; a passing unit test at one seam does not prove end-to-end semantic consistency between the two capture paths.

## 2. Findings and severity

### P0 — Two serial interpretations without a demonstrated shared semantic contract

The speech path creates a rich `SpeechInterpretation` / semantic-act result and a speech action decision. The capture-field hand-off then feeds text to an engine whose `SemanticInterpretation` is separately built from `EngineRequest` parsing and `GrammarFrame` parsing.

**Risk:** a semantic relationship recognized by speech may be flattened or changed before engine interpretation; alternatively, a second parser may infer a different action, object, location, or confidence. This is a source-level architectural risk, not a claim that every utterance currently fails.

**Audit requirement:** select representative utterances and log/compare raw transcript, repaired transcript, speech semantic acts, text handed to capture, engine semantic frame, final request, authority decision, and executed/proposed action.

### P0 — Multiple whole-utterance interpreters and duplicated action vocabularies

Verified components include:

- `lib/speech/interpret.ts`: finite `INTENT_PATTERNS` plus communication understanding and semantic composition.
- `lib/speech/semantic/compose.ts`: `ACTION_VERB_RE` and act-composition heuristics.
- `lib/communication/understand.ts`: independent `DerivedMeaning` interpretation and action mapping.
- `lib/engine/request.ts`: `interpretRequestUtterance()` and a large collection of request/action/constraint rules.
- `lib/engine/semanticGrammar.ts`: finite `ACTIONS` list and separate communication, delivery, movement, pickup, and fallback parsing.
- `lib/engine/semanticInterpreter.ts`: calls both request interpretation and semantic grammar parsing.
- `lib/speech/decision.ts` and `lib/engine/interaction.ts`: additional action and gating decisions.

**Risk:** coverage grows by adding rules to several places; the same phrase can be classified differently depending on entry point. Verb coverage is not the same thing as general language understanding.

### P1 — Different semantic types and action contracts

The speech path uses `SpeechInterpretation`, `SemanticUtterance`, `SemanticAct`, and `SemanticActionOutcome`. The engine uses `SemanticInterpretation`, `GrammarFrame`, `EngineRequest`, `EngineAction`, and `InteractionResult`. The dispatcher uses a finite `UniversalAction` union.

These contracts may serve different purposes, but the inspected paths do not demonstrate one versioned canonical semantic object passed end-to-end. A compatibility adapter is preferable to an abrupt replacement, but adapters should not become more independent interpreters.

### P1 — Context and learning are distributed

Observed mechanisms include speech personal vocabulary/name aliases and a speech language model; communication-profile learned phrases; engine working memory, active request, reference resolution and persisted evidence; CPU belief graph and behavior beliefs; and the separate thinking engine's user/task/context learning.

**Risk:** the same user correction or reference may update one learning system without consistently informing the others. The audit must distinguish intentional separation of evidence stores from accidental duplication of meaning or inconsistent resolution.

### P1 — Domain vocabulary exists beside general-language rules

`lib/speech/domainPacks.ts` includes trades/site, client services, knowledge operations, student, creative, personal, and general-work packs. The source describes these as soft transcript-repair/scoring evidence rather than authoritative interpretation. This is compatible with the universal rule **if** domain evidence stays optional, scoped, and unable to override stronger sentence-level evidence by itself.

The larger risk is not the existence of specialist vocabulary. It is finite action/intent lists and action-specific parser branches in the core path.

### P1 — Safety and clarification can be affected by parser coverage

The code correctly states that understanding is not permission to act and has explicit handling for negation, questions, reported speech, conditions, corrections and confirmation. However, several separate layers can classify acts, set confidence, and gate actions.

**Risk:** a request can be safe and sufficiently clear in context but be blocked because one layer does not recognise it; or a familiar surface pattern can appear actionable despite an incorrect semantic frame. The audit should separate uncertainty about meaning from authority/safety policy and missing execution capability.

### P2 — The planning engine is not the language-understanding foundation

The `lib/thinking` family contains meaningful temporal, spatial, sequencing, duration, lifecycle, calibration, and personal-pattern logic. This should consume validated semantic facts and contribute planning/context evidence. It should not be treated as a substitute for general semantic interpretation, nor should its task model constrain every future use of Dokkit's intelligence.

## 3. Additional call-graph evidence: where interpretations diverge

The engine cycle calls `interpretSemanticInput()` and separately calls `applyUtteranceToRequest()`. The semantic interpreter itself calls `interpretRequestUtterance()` and `parseSemanticGrammar()`. The orchestration layer then applies the legacy request parser result and conditionally overlays grammar fields only when `grammar.relations.length > 0`. This is an explicit dual-source merge, not yet a single canonical interpretation feeding a request adapter. It may be a deliberate compatibility strategy, but it must be covered by semantic-consistency tests and eventually replaced by one source of semantic truth.

The interaction layer also contains early special-case paths before or around the normal engine cycle, including deferred-intention detection and add-to-job pattern handling. These may be valid product policies/capabilities, but the audit must distinguish them from general interpretation and ensure their early returns do not bypass needed semantic evidence or produce inconsistent request state.

The CPU façade invokes `processInteractionCore()` before assembling its universal context and asking specialist brains for contributions. Specialist brains are documented as observers that cannot veto authority or execute mutations. That is a useful boundary to preserve. Separately, `executeCpuDecision()` requires an `ACT` outcome, authority permission, and a recommended action before dispatch. The execution boundary is structurally separated from interpretation, even though upstream interpretation/gating is duplicated.

The core request contract is task-shaped: `RequestAction` contains `remind`, `pickup`, `create_task`, `complete`, `append_list`, `create_list`, `move`, `defer`, `refine`, `query`, and `unknown`; `EngineRequest` is centered on task title/object/location/time/urgency/commitment and related work entities. This is a valid current capability contract, but it must not become the canonical model for every future meaning Dokkit may need to understand. The speech semantic model is richer in act types and relations, but also uses finite `ActKind`, temporal relation, and action-outcome unions. A shared semantic contract should be expressive independently of the current action executor set.

## 4. Hard-coded assumption inventory

| Location | Current assumption observed | Required treatment |
|---|---|---|
| `lib/speech/interpret.ts` | Finite intent patterns map phrase families to speech intent | Keep as evidence/features if useful; do not make it the universal semantic authority |
| `lib/speech/semantic/compose.ts` | Finite action-verb regex helps detect and compose acts | Replace over time with compositional semantic evidence; unknown verbs must not erase other meaning |
| `lib/communication/understand.ts` | Specific action mappings plus learned phrases derive a communication meaning | Unify its semantic output/inputs with the canonical contract |
| `lib/engine/semanticGrammar.ts` | Finite leading verbs dispatch to communication, delivery, movement, pickup, or fallback parsers | Remove dependence on domain/action-specific parser families from the canonical model |
| `lib/engine/request.ts` | Request meaning is extracted through many verb/phrase/constraint rules | Audit every rule for unique evidence vs duplicated interpretation; migrate behind a shared contract |
| `lib/engine/semanticInterpreter.ts` | Request parser and grammar parser are called separately for the same input | One canonical interpretation should feed request/action adapters |
| `lib/speech/domainPacks.ts` / `sttRepair.ts` | Domain terms influence transcript-repair plausibility | Retain only as scoped, soft evidence with original transcript and provenance preserved |
| `lib/cpu/actions/dispatcher.ts` and action unions | Executable capabilities are a finite known set | A finite capability registry is appropriate; it must be downstream of general understanding, with unsupported meaning preserved rather than misclassified |
| `lib/engine/interaction.ts` | Query/defer/add-to-job and authority decisions include explicit pattern checks | Classify as policy/capability evidence and test independently from semantic interpretation |

Not every finite list is a defect. A deterministic implementation needs defined capabilities, action schemas, and lexical resources. The defect is allowing such lists to become the boundary of what the system can understand, or duplicating their semantic authority across layers.

## 5. What should be preserved

Do not throw away existing work merely because the architecture needs unification. Preserve and measure:

- original input and transcript-repair evidence;
- user vocabulary, name aliases, learned phrases, and explicit corrections;
- multi-act composition and discourse supersession;
- polarity/negation, modality, conditions, dependencies, and temporal relations;
- contextual references and confidence;
- the separation between interpretation, authority, confirmation, and execution;
- action adapters for tasks, lists, jobs, meetings, and travel;
- the thinking engine's planning and personal calibration signals.

The target is to consolidate semantic authority, not to flatten all specialist capability into a simplistic parser.

## 6. Phase A completion and next phase

### Completed in Phase A — core dependency/call-graph map

Trace from each actual product entry point through interpretation, context/memory, decisions, persistence and execution. Mark each function as one of: input adapter, evidence producer, canonical interpreter, context resolver, policy/authority, planner, capability adapter, persistence, or UI mapping.

**Result:** the two primary capture paths, their interpretation seams, context/memory dependencies, action gates, and execution boundaries are mapped above. The map is limited to the core capture/intelligence paths reviewed; a repository-wide import graph and a line-by-line inventory of every regex remain follow-up engineering artifacts.

### Completed in Phase A — high-impact assumption inventory

Search core and supporting modules for finite verb/intent lists, domain terms, phrase regexes, action unions, confidence defaults, fallbacks, and clarification gates. Classify each as lexical evidence, semantic inference, safety policy, capability constraint, or presentation behavior.

**Result:** the highest-impact duplicated interpretation rules and finite contracts are identified and classified. Individual rule-by-rule ownership and exhaustive regex inventory should be added as code-level instrumentation/migration proceeds.

### Phase B — establish a cross-domain baseline before refactoring

Create a labeled set across everyday personal requests, communication, education/research, office/client work, creative work, travel/logistics, construction/site work, unfamiliar words, multi-clause instructions, corrections, negation, conditions, reported speech, references, and ambiguous cases.

Measure separately:
- transcript fidelity and repair accuracy;
- meaning/relationship preservation;
- intent and act classification;
- entity/object/location/time extraction;
- safe action precision and recall;
- unnecessary clarification rate;
- unsupported-input handling;
- consistency between speech and typed entry for equivalent text.

**Exit:** baseline results are reproducible and identify failures by layer. Do not set an arbitrary passing threshold before a real baseline exists.

### Later architecture phase — define the canonical semantic contract

Specify a versioned, domain-neutral representation with raw-source provenance, semantic acts/events, participants/entities, predicates/relations, modality/polarity, temporal/spatial constraints, conditions/dependencies, corrections/discourse, confidence/alternatives, and links to context evidence.

**Exit:** speech and typed capture can be compared in one semantic space without silently losing information. This is design work only until backward compatibility and migration are reviewed.

### Phase A deliverable

**Result:** this report records the core call graph, high-impact assumption inventory, migration risks, and recommendation. No broad parser rewrite was made. Phase A does not claim the cross-domain baseline or semantic contract is already complete.

## 7. Non-goals for Phase A

- Do not replace the deterministic approach with an LLM or Whisper.
- Do not expand construction vocabulary as the main solution.
- Do not rewrite every parser before mapping its callers and behavior.
- Do not remove working safety checks merely to make more requests executable.
- Do not claim universal performance from a niche test suite.
- Do not merge or deploy runtime changes as part of this documentation-only audit.

## 8. Initial conclusion

The first architecture-level change should not be “add more verbs.” It should be to prove where meaning is created, transformed, discarded, or independently re-inferred, then establish one semantic contract and cross-domain benchmark before consolidation. The universal intelligence rule is binding for all subsequent phases.
