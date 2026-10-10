# Phase N — Semantic Corpus Review Protocol

## Current state

The cross-domain intelligence corpus is a **development seed**, not a validated benchmark. Version 0.3.0 contains 106 synthetic examples: 10 pilot, 38 batch-001, and 58 batch-002. All 106 are draft annotations in the development split. There are no reviewed labels, validation records, or held-out records yet.

The larger Phase N expectation scorer is a separate diagnostic set. Its 16 cases also remain candidate labels pending human review. Do not describe either set as gold truth or use aggregate scores as product accuracy.

## Review sequence

Review one scenario family at a time. A reviewer should assess the utterance and expected interpretation without seeing speech/engine outputs first; otherwise current producer behaviour can bias the label.

1. **Interaction mode:** choose act, preserve, answer, clarify, or no_op based on the utterance and explicit context. Do not infer a task from a report, hypothetical, preference, or question alone.
2. **Act segmentation:** identify every distinct act. Preserve order where sequence matters. Keep a purpose clause attached to its parent action when it is explanatory rather than a separate instruction.
3. **Predicate and arguments:** validate the action/state/question predicate and each argument role independently. Do not let an object word satisfy an action predicate.
4. **Polarity and modality:** mark negation, prohibition, uncertainty, reported speech, hypothetical conditions, and unconfirmed commitments explicitly.
5. **Temporal meaning:** distinguish date, time, interval, deadline, relative offset, and event anchor. Confirm which value supersedes another after a correction.
6. **Relations and constraints:** preserve before/after/until, conditions, alternatives, spatial relations, protected content, and explicit exclusions.
7. **References:** note which entities require prior context. If context is insufficient, label the need to clarify rather than invent a referent.
8. **Safety and policy boundary:** distinguish a requested action from a quoted command, a reported request, or a prohibited mutation.
9. **Alternatives and uncertainty:** record acceptable semantic variants when wording is genuinely underspecified; do not silently widen labels merely to make a producer pass.
10. **Review decision:** set review_status to reviewed, needs_revision, or rejected; add a concise review_note. A reviewed record must identify the reviewer/team in reviewer.

## Independence and disagreement

- Prefer a second independent reviewer for high-impact, adversarial, correction, negation, or ambiguous-reference cases.
- If reviewers disagree on segmentation, argument roles, modality, or interaction mode, keep the record out of a scored validation set until the disagreement is resolved and the rationale is recorded.
- Reviewers must not use current model output as the definition of expected meaning.
- A change from draft to reviewed means the annotation was reviewed; it does not establish that the engine passes it.

## Split policy

- development: may be used to diagnose and improve the semantic system.
- validation: use reviewed scenario families to compare candidate implementations and make design decisions. Keep close paraphrases and all members of a family_id together.
- held_out: freeze reviewed families before tuning. Do not inspect their outputs while changing rules. Run only at designated evaluation points and record the exact commit, corpus version, and results.
- Never move a family across splits by changing only one record. Do not populate validation/held-out merely to make the manifest look complete.
- Keep synthetic and privacy-reviewed observed examples clearly distinguished in provenance; never add identifiable user data.

## Required report fields before accuracy claims

Record the corpus version, source commit, split, annotation status counts, family counts, domain/capability coverage, per-case failures, and both typed and fixed-transcript speech-path observations. Report speech/engine differences separately. Do not collapse role-specific criteria into a single accuracy figure, and do not treat unknown/missing evidence as false unless the contract explicitly supports that inference.

A held-out score is meaningful only after the labels and split have been frozen independently. No release threshold is introduced by this protocol.
