# Engine Dock Gate Contract

## Purpose

Engine interpretation and write permission are separate decisions. The engine may identify fit/capacity strain or request clarification, but an explicit user create action must not become a silent no-op.

## Policy

| Engine result | Class | Explicit create | Other surfaces |
|---|---|---|---|
| `act_create`, `act_update` | act | Allow create/update | Allow |
| `answer` | advisory | Allow create; show message | Do not create automatically |
| `defer` | advisory | Allow create; show message | Do not create automatically |
| `clarify` | clarify | Save as written unless a separate hard required-field gate applies | Do not create automatically |
| `fallthrough` | clarify | Save as written on explicit create | Do not create automatically |
| Empty draft, unresolved proposed/ambiguous place, missing required Travel fields, missing selected day/session | hard (surface gate) | Block with visible reason where applicable | Block |

The pure policy lives in `lib/engine/dockOutcome.ts`. Callers must run surface hard checks first, then classify the CPU/dock result and consult `allowCreate(surface, class)`. Never infer write permission from whether a message is present.

## Capture Dock

Dock is explicit create intent. ACT outcomes execute their structured action. ANSWER/DEFER/CLARIFY outcomes show their explanation and save the current user wording as a task. The existing one-shot place gate remains hard until the user confirms or skips the place. A missing-day legacy response remains a flexible task save. Completed-draft idempotency remains in force.

## Travel Add stop

Add stop is explicit create intent. ANSWER/DEFER/CLARIFY remain visible as advisory feedback but do not abort stop creation. Required text, selected day, active session/trip, work-site linkage, and fixed-time/duration validation still block. Day-window anchoring, travel calculations, and offline mutation queue semantics are unchanged. The primary label is always `Add stop`; it does not promise a bypass distinct from the actual action.

## Confirmed override

There is no generic override that bypasses hard checks. If a future UI adds an explicit “save as written” or override confirmation, it must be reachable only after the advisory was shown, preserve all hard gates, and write at most once for an unchanged draft.
