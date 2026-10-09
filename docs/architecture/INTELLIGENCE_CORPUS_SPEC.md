# Cross-domain Intelligence Corpus — Specification

**Status:** development seed; semantic annotations are still draft  
**Current size:** 48 examples (10 structural pilot + 38 batch-001 development examples)  
**Target scale:** 3,000–5,000 reviewed synthetic and privacy-safe regression examples  
**Governing rule:** [Universal Intelligence Rule](./UNIVERSAL_INTELLIGENCE_RULE.md)  
**Annotation gate:** [Corpus Annotation Rubric](./CORPUS_ANNOTATION_RUBRIC.md)

## Purpose

Create a versioned evaluation corpus that measures general language understanding across domains. Examples are not locked to their surface domain: each example may test multiple reusable capabilities, and the same capability must appear in many unrelated domains.

The corpus is an evaluation and engineering instrument. It is **not** a runtime sentence lookup table, a replacement for the deterministic semantic engine, or evidence that the engine has learned merely because examples have been added.

## Layout

- `data/intelligence-corpus/manifest.json` — corpus version, status, counts, split policy and taxonomies.
- `data/intelligence-corpus/schema.json` — machine-readable record contract.
- `data/intelligence-corpus/examples/pilot.jsonl` — 10 illustrative structural fixtures.
- `data/intelligence-corpus/examples/batch-001-development.jsonl` — 38 cross-domain draft examples.
- `scripts/validate-intelligence-corpus.mjs` — dependency-free structure, taxonomy, split, and annotation-count validation.
- `npm run test:corpus-schema` — run validation locally and in CI/build.

JSONL is used so records can be reviewed, diffed, streamed and expanded without one giant JSON array. One line is one complete example.

## Record design

Every record separates:

1. **Input evidence:** original utterance, locale and synthetic/observed provenance.
2. **Surface context:** one or more domain tags; domains are descriptive metadata, not parser routes.
3. **Capabilities:** reusable skills exercised, such as correction handling, negation, temporal resolution, reference resolution, sequencing, uncertainty or distinguishing questions from actions.
4. **Expected interpretation:** one or more semantic acts with polarity, modality, arguments and relations/constraints.
5. **Expected interaction:** act, preserve, answer, clarify or no-op, plus a rationale. Understanding a request is separate from permission to execute it.
6. **Quality controls:** annotation status, reviewer note, difficulty, split and family ID for related cases.

The schema should evolve deliberately and be versioned. Do not make fields mandatory merely because one example happens to use them. Preserve ambiguity where the correct result depends on missing context.

## Domain and capability policy

- A record may have multiple domain tags and multiple capability tags.
- Domain tags describe the *subject matter*, not a separate interpretation system.
- Capability tags describe transferable language/reasoning operations.
- Include familiar and unfamiliar vocabulary, corrections, disfluencies, questions, reports, hypotheticals, negation, conditions, multi-action inputs, context-dependent references, and cases where preserving the input is correct.
- Construction/site work is one domain among many and must not dominate the dataset.
- Include examples from outside the authors' familiar domains.
- Avoid near-duplicate templates masquerading as coverage.

## Split and leakage policy

Use three disjoint splits: `development`, `validation`, and `held_out`. The held-out split is not used to author rules or tune heuristics. Keep paraphrases, template siblings, and same-scenario variants in one split; `family_id` identifies related cases. Never split siblings across development and held-out sets.

Current state: all 48 records are development examples. There are **zero** validation and held-out records. Do not report held-out performance or use corpus scores as release gates until reviewed gold labels and a leakage-controlled held-out set exist.

## Annotation and review

- Each expected interpretation needs a rationale grounded in the input.
- Label intended interaction separately from semantic content.
- Keep all current records `draft` until a human review has been performed.
- Ambiguous examples must state what context is missing; do not invent a single certain answer when multiple interpretations remain valid.
- Synthetic examples must be labelled synthetic; real user failures must be privacy-reviewed and de-identified.
- Avoid personal data, credentials, client-identifying details and confidential business information.
- Structural validity does not establish semantic-label correctness.
- Follow the [annotation rubric](./CORPUS_ANNOTATION_RUBRIC.md). Reviewed records must identify a reviewer/team.

## How it will be used

1. Establish and retain the existing Phase B 48-case diagnostic baseline separately from this semantic corpus.
2. Review corpus examples independently; correct policy disagreements before using examples as gold labels.
3. Build a corpus runner that reports the current engine's outputs without silently changing expected labels or hiding failures.
4. Classify errors by earliest failing layer: transcript repair, semantic interpretation, reference/context resolution, interaction policy, authority/confirmation or execution.
5. Fix shared capabilities rather than adding isolated domain-specific phrase rules.
6. Re-run unchanged development and validation suites; evaluate the frozen held-out set only at planned checkpoints.
7. Report aggregate metrics and per-domain/per-capability results. Never allow a strong aggregate score to hide a weak domain or critical failure class.
8. Add observed regressions only with stable expected labels and privacy review.

## Growth target

The proposed 3,000–5,000 examples are a target, not a quota to fill with low-quality data. Expand in reviewed batches. Prefer diverse, well-labelled examples over repetitive or weakly annotated examples.

## Current status and limits

Phase D adds a 38-example development batch, manifest annotation accounting, stronger taxonomy/split/semantic-shape structural checks, and an annotation rubric. The corpus now has 48 records, but all 48 remain drafts. This phase does not change runtime interpretation, establish semantic performance, or replace the Phase B 48-case diagnostic benchmark. The next step is independent annotation review and a corpus runner; do not create validation/held-out sets by randomly splitting these existing draft records.
