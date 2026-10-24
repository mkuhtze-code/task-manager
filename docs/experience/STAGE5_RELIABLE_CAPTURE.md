# Dokkit Stage 5 — Reliable capture

**Status:** In progress; this slice closes the reviewed-item editing gap in the multi-item P0 path, not Stage 5 exit.
**Authority:** `docs/architecture/NON_NEGOTIABLES.md`, `docs/experience/STAGE4_LIVE_DAY_MODEL.md`, `lib/engine/captureDock.ts`.

## Implemented in this slice

- Multi-item capture proposals are presented for review before task writes.
- Each proposal can be selected or excluded; completed items are not submitted again during the mounted review.
- Per-item save failures remain visible and retryable; the original dump is retained.
- Reviewed action text is editable before commit. The edited proposal summary is the text passed into the existing task create path.
- A focused component test covers committing the edited proposal text.

## Still open — do not claim Stage 5 complete

- [ ] Run `npm run test:capture-ui` and `npm run typecheck` against the PR head.
- [ ] Exercise dump → review → edit → partial failure → retry with real Today/Capture wiring and verify no duplicate task.
- [ ] Confirm every accepted create reaches the Stage 4 `refreshDayModel` through the same task-array mutation path; verify capacity on device.
- [ ] Add explicit `timeRole` classification and review display: `act`, `event`, `deadline`, `arrival`, `unknown`. Do not silently convert booking/event times into busy task times.
- [ ] Add “Save as a Place?” proposal with name/optional keywords and explicit confirmation before any place-library write. Declining must preserve text context only.
- [ ] Verify single-item draft clearing only follows accepted persistence, including direct and durable-queue paths.
- [ ] Record device acceptance for capture, pending/failed queue state, retry and capacity refresh.
- [ ] Run the non-negotiables guard and production build after focused tests are green.

## Safety contract

- Interpretation is not permission; task writes require the explicit Dock/commit action.
- Multi-item proposals are never committed before review.
- A queued durable write may be reported as pending, not server-confirmed.
- A failed item remains retryable; accepted items are not blindly submitted again.
- No autonomous replanning, first-person agent voice, guilt copy, or silent calendar mutation.

## Current limitation

This document records source changes and remaining verification. It is not device evidence and does not close Stage 4. Stage 4's outstanding checks remain tracked in `STAGE4_LIVE_DAY_MODEL.md`.
