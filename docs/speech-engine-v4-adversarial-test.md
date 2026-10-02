# Speech Engine V4 — Adversarial Torture Test

**Corpus:** 530 cases (`lib/speech/adversarial/corpus.json`)  
**Primary score:** final action outcome via `processCaptureSpeech`.

## Result (post P0 fixes)

| Metric | Value |
|--------|------:|
| Cases | 530 |
| Passed | 505 |
| Failed | 25 |
| Pass rate | **95.3%** |
| Hard gate (`wouldMutateWithoutConfirm`) | **0 failures** |

## P0 systemic fixes

1. **polarity** — `no call|email|…`, `wait … no`, `nah/nope`
2. **canProposeTask + decision mustNot** — act-level; negated sibling must not suppress positive act
3. **compose** — `need to` without concrete action verb is not a create

## Category results

NEGATION 80/80 · DEPENDENCY 32/32 · PLAN_REVISION 27/27 · THINKING 17/17 · CAPITALIZATION 17/17  
Remaining gaps: REFERENCE (9), TEMPORAL decision (11), entity correction supersession

## SAFE FOR

Hard false-create prevention; mixed negation+positive; Capture adapter gate; confirm-before-mutate.

## NOT YET SAFE FOR

Automatic multi-act plan revision / supersession; multi-antecedent pronouns; "tell her" composition; entity *replacement* corrections.

## Re-run

```bash
npx vitest run lib/speech/__tests__/adversarial.v4.test.ts
```
