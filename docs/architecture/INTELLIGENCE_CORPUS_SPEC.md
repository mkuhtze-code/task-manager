# Cross-domain Intelligence Corpus — Skeleton Specification

**Status:** structural foundation; pilot examples only  
**Target scale:** 3,000–5,000 reviewed synthetic and privacy-safe regression examples  
**Governing rule:** [Universal Intelligence Rule](./UNIVERSAL_INTELLIGENCE_RULE.md)

## Purpose

Create a versioned evaluation corpus that measures general language understanding across domains. Examples are not locked to their surface domain: each example may test multiple reusable capabilities, and the same capability must appear in many unrelated domains.

The corpus is an evaluation and engineering instrument. It is **not** a runtime sentence lookup table, a replacement for the deterministic semantic engine, or evidence that the engine has learned merely because examples have been added.

## Layout

- `data/intelligence-corpus/manifest.json` — corpus version, status, counts, split policy and taxonomy version.
- `data/intelligence-corpus/schema.json` — machine-readable record contract.
- `data/intelligence-corpus/examples/pilot.jsonl` — small, hand-authored structural pilot; not a performance claim.
- `scripts/validate-intelligence-corpus.mjs` — dependency-free structural validation.
- `npm run test:corpus-schema` — run validation locally and in CI/build.

JSONL is used so records can be reviewed, diffed, streamed and expanded without one giant JSON array. One line is one complete example.

## Record design

Every record separates:

1. **Input evidence:** original utterance, locale and synthetic/observed provenance.
2. **Surface context:** one or more domain tags; domains are descriptive metadata, not parser routes.
3. **Capabilities:** reusable skills exercised, such as correction handling, negation, temporal resolution, reference resolution, sequencing, uncertainty or distinguishing questions from actions.
4. **Expected interpretation:** one or more semantic acts with polarity, modality, arguments and relations/constraints.
5. **Expected interaction:** act, preserve, answer, clarify or no-op, plus a rationale. Understanding a request is separate from permission to execute it.
6. **Quality controls:** annotation status, reviewer note, difficulty, split and optional family ID for related paraphrases.

The schema should evolve deliberately and be versioned. Do not make fields mandatory merely because one example happens to use them. Use explicit null/omission semantics and preserve ambiguity where the correct result depends on missing context.

## Domain and capability policy

- A record may have multiple domain tags and multiple capability tags.
- Domain tags describe the *subject matter*, not a separate interpretation system.
- Capability tags describe transferable language/reasoning operations.
- Include familiar and unfamiliar vocabulary, colloquial language, corrections, disfluencies, questions, reports, hypotheticals, negation, conditions, multi-action inputs, context-dependent references, and cases where preserving the input is correct.
- Construction/site work is one domain among many and must not dominate the dataset.
- Include examples from outside the current corpus authors' familiar domains.
- Avoid near-duplicate templates masquerading as coverage.

## Split and leakage policy

Use three disjoint splits: `development`, `validation`, and `held_out`. The held-out split is not used to author rules or tune heuristics. Keep paraphrases, template siblings, and same-scenario variants in the same split; `family_id` identifies related cases. Never split siblings across development and held-out sets.

The pilot contains development examples only. The manifest must not imply a held-out score until a reviewed held-out set exists. When scaling, use scenario-family separation and lexical/template similarity checks, not random line-level splitting alone.

## Annotation and review

- Each expected interpretation needs a short rationale grounded in the input.
- Label the intended interaction separately from semantic content.
- Use `review_status: "draft"` until reviewed by a human.
- Ambiguous examples must state what context is missing; do not invent a single certain answer when multiple interpretations remain valid.
- Record source provenance. Synthetic examples must be labelled synthetic; real user failures must be privacy-reviewed and de-identified before inclusion.
- Avoid personal data, credentials, client-identifying details and confidential business information.
- Keep generated examples diverse; manually review edge cases and a sample of every generation batch.
- When multiple outputs are valid, represent alternatives explicitly in the annotation rationale or extend the schema rather than overfitting to one phrasing.

## How it will be used

1. Run the current engine against the corpus and save a versioned baseline.
2. Classify errors by earliest failing layer: transcript repair, semantic interpretation, reference/context resolution, interaction policy, authority/confirmation or execution.
3. Fix shared capabilities rather than adding isolated domain-specific phrase rules.
4. Re-run the unchanged regression set and a separate held-out set.
5. Report aggregate metrics *and* per-domain/per-capability results. Never allow a strong aggregate score to hide a weak domain or critical failure class.
6. Add real regressions only with stable expected labels and privacy review.

## Growth target

The proposed 3,000–5,000 examples are a target, not a quota to fill with low-quality data. Expand in reviewed batches. Prefer 3,000 diverse, well-labelled examples over 5,000 repetitive or weakly annotated examples.

## Current status

This PR establishes the structure, validation and a tiny illustrative pilot. It does not change runtime interpretation, claim an intelligence improvement, or replace the Phase B 48-case diagnostic benchmark. The next corpus phase should validate the schema with reviewers, add balanced examples, and establish the held-out split before using scores as release gates.
