# Dokkit CPU Pressure Test — Phase 10

**Branch:** `feat/cpu-pressure-test-phase10`  
**Baseline:** Phase 10 merged to `main`  
**Purpose:** Attempt to make the universal CPU contradict itself before adding another reasoning phase.

## Core invariants

1. **Explicit user commitment wins.** Capacity, fit, opportunity and convenience reasoning may advise, but cannot turn a clear executable commitment into a refusal.
2. **Authority is singular.** The CPU must expose one authoritative action/decision; specialist observations must not silently replace it.
3. **Understand → Context → Reason → Decide → Execute stays coherent.**
4. **Opportunities are not actions.** A discovered relationship must not mutate schedule/state unless the user has explicitly authorized the resulting action.
5. **Weak evidence must not interrupt.**
6. **Corrections must converge to one interpretation, not produce duplicate executable actions.**
7. **Interfaces are adapters.** Text, voice and Android Auto should reach the same underlying decision for the same words.
8. **Execution must be honest.** Missing/failed executors cannot be reported as successful execution.

## Torture categories

| Category | Adversarial pressure |
|---|---|
| Commitment authority | Hard commitment + zero capacity; explicit date; explicit time; pickup/drop-off; ambiguous-but-committed wording |
| Speech boundary | Fillers, self-correction, date replacement, temporal revision |
| Cross-world reasoning | Useful location convergence; unrelated location; weak memory |
| Action integrity | Exact CPU action; advisory non-execution; missing executor |
| Interface consistency | Text vs voice vs Android Auto |
| Non-regression | Input immutability; one authoritative interaction/action |

## Result classification

- 🟢 **Correct:** invariant holds.
- 🟡 **Technically works but UX needs refinement:** behavior is safe but not yet ideal.
- 🔴 **Architectural failure:** CPU contradicts authority, mutates without authority, executes a different action, or falsely claims success.

## Important interpretation

This test is deliberately aimed at the **CPU boundary**, not just individual parsers. A parser can be imperfect and still be safe if the CPU refuses to execute an uncertain result. Conversely, a parser can look good while the system is unsafe if a later layer overrides the user's decision.

## Current baseline findings to verify in CI

- The Phase 10 Grace James commitment must remain executable under zero/near-zero capacity.
- Capacity explanations must remain advisory for hard commitments.
- Opportunity surfacing must never override a hard commitment.
- Cross-world relationships must remain non-mutating.
- Execution must use the CPU-selected action rather than reinterpreting raw input.
- Advisory and unsupported decisions must not execute.
- Text/voice/Android Auto must remain interface-neutral.

## Exit criteria

Do not start the next CPU reasoning phase until:
- all 🔴 architectural failures are eliminated;
- 🟡 UX weaknesses are explicitly recorded;
- the entire CPU suite is green;
- the normal web CI build/typecheck is green.

## Test command

`npm test -- lib/cpu/__tests__/cpuPressureTest.test.ts`

Full gate:

`npm test && npm run typecheck && npm run build`


## Torture run — initial result

The isolated suite initially ran **20 tests: 16 passed, 4 failed**.

The failures were genuine CPU-bound defects:

1. **Explicit commitment classification gap:** “I need to call the client tomorrow” and “I need to drop that off at 4 today” were not consistently promoted to `HARD_COMMITMENT`, so authority could refuse them.
2. **Capacity explanation leakage:** The concrete Grace James commitment still exposed “Today looks tight; consider tomorrow morning” inside the final explanation despite the hard-commitment authority boundary.
3. **Opportunity surfacing leakage:** A hard commitment with a matching job could still produce a surfaced job opportunity.

The root cause was systemic: Phase 10 corrected the authority decision for an already-classified `HARD_COMMITMENT`, but the request parser did not reliably classify natural “I need/have/got to …” language as a hard executable commitment.

### Fix applied

The request boundary now:
- recognises generic “need/have/got to” captures as `create_task`;
- extracts the task phrase for non-movement tasks such as calls;
- promotes sufficiently structured explicit “need/have/got to” or “must” requests to `commitment: 'hard'`;
- keeps the existing authority rule as the final guard.

This lets the existing Phase 10 authority and opportunity protections operate on actual user language rather than only synthetic hard-commitment requests.

### Re-run

After the fix, the isolated CPU pressure suite ran **20/20 green**.

This is the important gate result. The repository-wide Web CI still has a separate pre-existing failing test set, so its failure must not be conflated with the CPU pressure result.
