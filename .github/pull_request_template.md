## Summary

<!-- What changed and why? -->

## Validation

<!-- Tests, typecheck, build, manual verification. Be explicit about what was and was not run. -->

## Universal intelligence review

**Required for changes touching speech, capture, semantics, language interpretation, memory/learning, reasoning, action selection, clarification, or execution policy.** For unrelated changes, mark N/A.

- [ ] The change preserves Dokkit's domain-neutral intelligence architecture; the motivating domain is only one test case.
- [ ] It does not add a second whole-utterance interpreter or duplicate semantic authority.
- [ ] It preserves source meaning, relevant relationships, polarity/modality, uncertainty, and evidence provenance.
- [ ] It keeps interpretation separate from permission, confirmation, capability, and execution.
- [ ] Tests include cross-domain coverage and a negative/regression case, not only the motivating niche example.
- [ ] Unknown or unsupported meaning is preserved and handled conservatively rather than silently converted into a confident incorrect action.
- [ ] If any item is not satisfied, the limitation and follow-up migration are documented below.

**Exceptions / follow-up work / N/A rationale:**

<!-- Required if any checkbox above is unchecked or the section is N/A. -->
