# Phase F — Context Replay and Annotation Risk Audit

**Status:** implementation and first-pass review aid; no corpus labels promoted to gold  
**North star:** universal deterministic interpretation across domains; no phrase lookup, domain-specific parser routes, or LLM/Whisper dependency.

## Context replay coverage

The versioned fixture set is `data/intelligence-corpus/context-replay-v1.json`. The test harness uses the production CPU reference resolver and interaction boundary with explicit working-memory/context snapshots.

It checks:
- resolving “it” to an available task;
- resolving “there” to an available location rather than a task focus;
- refusing to choose between two plausible jobs;
- preserving an unknown referent as unresolved;
- not mistaking a temporal phrase for a referential expression;
- preventing stale focus from hijacking a complete, explicit new capture.

### Measurement boundary

These fixtures inject explicit prior-turn facts into the same working-memory contract the engine consumes. They **do not** yet prove that a real user turn is automatically extracted, persisted, reloaded, and then resolved end-to-end. They also do not test database retrieval, cross-session persistence, or acoustic transcription. Those require a later integration phase with the actual capture persistence boundary.

## Annotation risk audit — do not promote labels yet

The corpus still contains 48 development examples, all marked `draft`. This is a first-pass risk audit, not independent human approval and not an engine accuracy score. The records below should receive explicit adjudication before they are used as gold evaluation data.

| Record | Risk to adjudicate | Why it matters |
| --- | --- | --- |
| `pilot-site-005` | Context-dependent act versus clarification | “Add two tubes of sealant to that list as well” requires an identifiable target list. The expected mode is `act`, while the fixture does not provide the target list itself. Decide whether the expected context is assumed or the mode should be `clarify` when context is absent. |
| `pilot-travel-004` | Missing target booking | “Move the hotel booking to Thursday, not Friday” is compositional, but the booking identity is unresolved if more than one booking exists. State the context assumption or expected clarification boundary. |
| `pilot-learn-003` | Dependency and action segmentation | “Save the stronger source” appears to depend on the deferred comparison decision. Adjudicate whether saving can occur before sample sizes are checked, or whether that action also needs a dependency. |
| `d001-life-02` | Completion versus deletion | “I picked up the parcel already, so remove that errand from my list” contains a completed-event report plus a requested list mutation. Confirm whether removal means mark complete or delete the item; these are not equivalent state changes. |
| `d001-life-03` | Conditional reminder semantics | The reminder depends on paint still being wet when the speaker gets home. Confirm that the annotation represents an event/condition gate, not an unconditional reminder. |
| `d001-comm-01` | Mixed permission within one utterance | Saving the email as a draft is permitted now; sending is prohibited pending explicit approval. Keep these separate and ensure the top-level `act` label cannot be interpreted as authorization to send. |
| `d001-office-01` | Conditional future action | Preparing the invoice is immediate, but releasing it depends on Morgan confirming hours. Adjudicate whether `act` describes a plan with a gate or overstates immediate action authority. |
| `d001-site-01` | Quantity-to-item binding | One semantic act currently contains two item/quantity pairs plus a shared size. Decide whether the schema can unambiguously bind each quantity to its own item and the shared size to both, or whether separate linked acts are needed. |
| `d001-site-02` | Report, authorized action, and prohibition | The observation, photo capture, and “don't patch before the inspector arrives” restriction must remain distinct. Verify that a top-level `act` does not erase the prohibition's scope or timing. |
| `d001-sequence-01` | Destructive action gate | Deleting the temporary copy is allowed only after export and verification. Confirm that the annotation distinguishes understanding the requested sequence from permission to execute deletion immediately. |
| `d001-family-01` | Missing list with mixed add/exclude | Adding batteries and excluding the charger are clear, but the target list is unavailable. Confirm the clarification targets only the missing list and preserves both positive and negative item constraints. |
| `d001-context-02` | Preserve without a resolved referent | “Don't change it yet” is a meaningful constraint despite the unknown referent. Ensure the annotation records the prohibition without inventing an object or creating an arbitrary task. |

## Review protocol before gold status

1. A reviewer examines the utterance and explicit context **without seeing the engine's observed output**.
2. The reviewer records their own interaction mode and semantic acts first.
3. Only then compare that annotation with the current draft and record the reason for any disagreement.
4. Resolve policy questions before changing the record to `reviewed`; otherwise use `needs_revision` and retain a note.
5. Do not create validation or held-out data from close paraphrases of these development families. Keep each scenario family in one split.
6. Keep reviewed status separate from whether the current engine passes the case.

## Next gate

Do not claim reference-resolution performance or gold-corpus accuracy from this phase. The next meaningful test should drive a real capture through memory extraction/persistence, replay the next turn using the persisted snapshot, and assert both correct target binding and no action on missing/ambiguous evidence. The annotation set needs a genuinely separate reviewer before any record is promoted from `draft`.
