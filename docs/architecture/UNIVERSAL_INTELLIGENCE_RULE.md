# Dokkit Universal Intelligence Rule

**Status: binding architectural constraint**

## Rule

Dokkit's intelligence must be general-purpose and domain-neutral. The system must understand and reason about user meaning across domains; it must not be architected as a construction, roofing, task-management, or other single-domain language interpreter.

This rule applies to the complete system: capture, speech repair, normalisation, interpretation, semantic representation, context, memory, learning, reasoning, safety decisions, action selection, and execution.

## Required properties

1. **One general semantic foundation.** Different input surfaces may have adapters, and specialist modules may contribute evidence, but they must not independently reinterpret the whole utterance into competing meanings. Meaning must be preserved through a shared, versioned semantic contract.
2. **Composable meaning.** Represent actions and non-actions, participants, entities, objects, relations, time, place, modality, polarity, conditions, dependencies, corrections, discourse, uncertainty, and provenance. Do not reduce language to a verb allowlist plus a task title.
3. **Domain-neutral core.** Domain vocabularies and domain-specific knowledge may contribute optional, scoped evidence. They must not dictate the general semantic model, override stronger evidence without justification, or make the system work only for familiar trades or work patterns.
4. **Personalisation without overfitting.** Learn user vocabulary, references, preferences, routines, and corrections while distinguishing user-specific evidence from general language rules and current context.
5. **Preserve the input and its uncertainty.** Retain source text and evidence. Unknown or novel language must not silently become a confidently incorrect action. Clarify only when uncertainty materially affects a consequential decision.
6. **Understanding is not permission.** Keep semantic interpretation separate from authority, safety, confirmation, and execution. A parsing gap alone is not proof that the user is ambiguous or that an otherwise clear request must be blocked.
7. **Deterministic implementation constraint.** Do not solve generality by wrapping an external LLM or Whisper. Build explicit, inspectable, testable deterministic mechanisms and calibrated fallbacks.
8. **Cross-domain evidence.** Tests must cover everyday life, work, learning/research, creative activity, communication, travel/logistics, unfamiliar vocabulary, multi-clause utterances, corrections, and negative/conditional/reporting language. Construction is one test domain, not the default domain.
9. **No narrow regressions disguised as progress.** A change fails review if it improves a narrow example by adding another isolated interpreter, proliferating domain-specific special cases, discarding meaning, or creating unjustified clarification/action behavior.
10. **Traceability.** Decisions must be traceable to source evidence, semantic interpretation, context, confidence, policy, and the resulting action or non-action.

## Review gate for every intelligence change

Reviewers must be able to answer yes to all of the following:

- Does this preserve or improve the general semantic contract?
- Does it work outside the domain that motivated the change?
- Does it avoid duplicating whole-utterance interpretation?
- Does it preserve uncertainty, polarity, relationships, and relevant context?
- Does it distinguish understanding from permission to act?
- Is there cross-domain regression coverage, including a negative test for the failure mode?
- Can a developer explain why the system reached its decision from evidence rather than a hidden special case?

If any answer is no or unproven, the change is not ready to merge.

## Practical interpretation

“Universal” is the architectural direction, not a claim that deterministic software can perfectly understand every possible utterance. The required behavior for an unfamiliar input is to preserve it, reason conservatively, expose uncertainty, and request only material clarification—not to hallucinate certainty or force the user into a known phrase pattern.

This rule governs the intelligence architecture and future phases. It does not require every domain capability to ship at once.
