# CPU Speech → Request Boundary Torture Test

**Purpose:** attack the boundary where natural speech becomes a structured request and then enters CPU authority.

## Invariants

1. Questions are never executable commitments.
2. Explicit negations are never executable commitments.
3. Explicit user commitments such as “I need to…”, “I have to…”, and “I must…” survive into CPU authority.
4. Pickup/drop-off verbs must not downgrade an already-established hard commitment.
5. Corrections converge on the final date/time rather than creating duplicate actions.
6. Tentative language such as “maybe” must not become a hard commitment.
7. Deferred/contextual intentions remain non-executable at this boundary.

## Initial torture result

The first run found **9 failures / 15 tests**.

The important architectural failure was:

> “Do I need to call the client tomorrow?” could reach CPU as executable work.

Other failures exposed classification-order issues: have-to language, commitment strength, negation/tentative language, deferred language, and pickup commitment preservation.

## Fixes

### Request boundary
- Added a question/negation guard before action extraction.
- Prevented questions containing task verbs from inheriting executable actions.
- Prevented explicit negated commitments from becoming hard commitments.
- Scoped the same guard through request merging.
- Preserved hard commitment when pickup/remind processing runs after commitment classification.

### Speech boundary
- Explicit need/have/got-to and must language now receives strong commitment strength when it is not a question, negation, or tentative statement.
- Tentative language such as maybe is explicitly non-strong.
- Questions and explicit negations are not treated as strong commitments.

## Final isolated result

**15/15 speech → CPU boundary tests green.**

This is the safety gate for the new changes.

## Repository-wide CI

The normal Web CI remains red on a broad existing test population spanning speech, thinking, travel, unified input, FCM, interaction, and other areas. Those failures are tracked separately and are not used as evidence that the isolated CPU boundary suite failed.
