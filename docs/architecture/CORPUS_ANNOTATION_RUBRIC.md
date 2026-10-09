# Intelligence Corpus Annotation Rubric

Use this rubric before changing a corpus record from `draft` to `reviewed`. Review is about the correctness and usefulness of the labels, not whether the current engine already handles the example.

## Required review checks

1. **Meaning fidelity:** Every asserted semantic act is supported by the utterance or explicit context. Do not add a task because a sentence merely mentions a problem, action, imperative, or deadline.
2. **Action boundaries:** Split distinct actions when their permissions, timing, conditions, or outcomes differ. Do not split one compositional action into arbitrary fragments.
3. **Polarity and scope:** Preserve negation, exclusions, exceptions, and what each one applies to. “Do X, but not Y” must not become either “do X and Y” or “do nothing.”
4. **Modality and commitment:** Separate facts, reports, quotations, preferences, intentions, possibilities, hypotheticals, requests, and prohibitions. A third party's promise is not the user's commitment.
5. **Arguments and binding:** Bind quantities, objects, recipients, destinations, times, and conditions to the correct action. Shared constraints must not be attached to the wrong item.
6. **Time and order:** Preserve corrected values, deadlines, “before/after/only then,” and conditional sequencing. Superseded values remain evidence but are not active final values.
7. **Context and ambiguity:** Use only supplied context. If a material referent is missing, label the needed clarification; do not invent a likely object, person, place, list, or option.
8. **Interaction mode:** Select `act`, `preserve`, `answer`, `clarify`, or `no_op` based on the user's communicative intent. Semantic understanding is not execution authority.
9. **Cross-domain transfer:** Ask whether the same capability would be labeled the same way in an unrelated domain. Domain tags describe subject matter; they must not dictate the semantic representation.
10. **Rationale and alternatives:** Explain the decisive evidence and uncertainty in plain language. Where multiple labels are genuinely acceptable, record the acceptable alternatives or leave the example in draft pending schema/policy clarification.

## Review status

- `draft`: not independently reviewed; never use as gold truth or a release gate.
- `reviewed`: reviewed against all checks above and a reviewer/team is recorded.
- `needs_revision`: meaningful issue found; retain the record for repair, but exclude it from gold evaluation.
- `rejected`: invalid, unsafe, duplicate, or not useful for the target capability; retain only if useful for audit.

## Split discipline

- Keep a scenario and its close paraphrases in one split using `family_id`.
- Develop and debug with `development`.
- Use `validation` for iteration only after examples have been reviewed.
- Keep `held_out` inaccessible to rule authors until a planned evaluation. Do not move examples between splits to improve a score.
- Do not mark an example reviewed simply because its JSON is valid. Structural validation and semantic review are different gates.

## Batch review checklist

For every batch, record:
- the batch/source identifier and authoring method;
- coverage by domain, capability, difficulty, and interaction mode;
- duplicate or near-duplicate review;
- records accepted, revised, rejected, and left unresolved;
- reviewer identity as a team handle or role, not personal data;
- known policy questions that prevent a gold label.

A batch with unresolved policy disagreements can still be useful development material, but it must not be presented as validated benchmark truth.
