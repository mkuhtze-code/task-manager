# Dokkit Speech Engine — Remaining Work & Status

**Updated:** 2026-10-12

## Done (current main)

- Deterministic speech pipeline + confirm-only act
- Persistent Collections + Capture Dock + Lists/clarification
- Job/meeting context linking
- Cloud HTTP client provider + **POST /api/stt** proxy (Deepgram/OpenAI/generic)
- **Blob capture path**: MediaRecorder → `/api/stt` (fallback when no Web Speech; optional prefer-cloud)
- Unit tests + Web CI + `test:engine` scripts
- Phase AB cross-path safety invariants: non-actions must not become executable work; clear actions retain key anchors through typed and speech-derived capture
- Phase AC expanded invariants: correction chains, conditional dependencies, temporal anchors, unresolved references, and unfamiliar-domain/non-action cases
- Leakage-safe corpus gates: draft labels cannot count as reviewed validation/held-out evidence; exact normalized duplicates are checked across splits
- Proposed quality exit contract in [SPEECH_ENGINE_QUALITY.md](./SPEECH_ENGINE_QUALITY.md)
- Phase AE authorization-boundary regression suite added to build/CI via `test:phaseAE`; covers non-actions, denied authority, and explicit-action positive control
- Phase AF bounded speech telemetry wired to `/api/stt`: allowlisted outcome/provider/locale/duration only; upstream error bodies and user identifiers are excluded from logs and client error responses
- Phase AG read-only production STT configuration probe added as `npm run test:stt-production`; checks endpoint shape, provider configuration, optional expected provider, timeout, and accidental response-field expansion without sending audio

## Remaining

### A. Production STT reliability

- [ ] Configure `DOKKIT_STT_API_KEY` in Vercel production (cloud STT remains disabled until a provider key is supplied).
- [ ] Verify production `GET /api/stt` reports the configured provider without exposing credentials.
- [ ] Run real-device/browser capture smoke tests, including unsupported-Web-Speech fallback, permission denial, timeout, network loss, provider failure, and retry.
- [ ] Add locale packs beyond the current en-NZ-oriented default and document actual supported coverage.

### B. Semantic quality evidence

- [ ] Build independently reviewed validation and held-out semantic sets; current draft corpus and parity replay are not gold accuracy evidence.
- [ ] Report action/non-action classification, critical-field retention, unresolved-reference behavior, and failures by scenario family.
- [x] Add CPU execution-boundary regression tests proving non-actions and denied authority do not dispatch mutations; positive control verifies explicit actions still dispatch. (Phase AE)
- [x] Add component-level Capture Dock authorization tests proving render alone does not invoke execution and the task executor is reached only after an explicit Dock interaction. (Phase AH; wired into build/CI)
- [ ] Use the exit thresholds in [SPEECH_ENGINE_QUALITY.md](./SPEECH_ENGINE_QUALITY.md); do not claim a threshold is met until measured with denominators.

### C. Discourse & personal learning

- [ ] Cross-session discourse memory beyond active context and vocabulary.
- [ ] Server-synced personal language model with per-user isolation and multi-device tests.
- [ ] Feed confirmed speech outcomes into Thinking Engine estimates/capacity with provenance and privacy controls.

### D. Operational quality

- [x] Implement bounded privacy-safe STT server telemetry using outcome/provider/locale/duration fields only; raw audio, transcript, task text, names, addresses, user IDs, IPs, and upstream error details are excluded.
- [ ] Add a durable metrics sink/dashboard and alerting; current implementation emits structured server logs only and does not yet provide aggregate dashboards.
- [ ] Establish production dashboards/alerts for capture success, provider failures, proposal latency, confirmation/correction rates, and locale.
- [ ] Keep platform/locale smoke-test results separate from unit tests and preview deployment status.

### E. Seamlessness and accessibility

- [ ] Evaluate Capture Dock accessibility: screen-reader labels, keyboard paths, focus handling, and high-contrast states.
- [ ] Evaluate optional, calm TTS only after capture and semantic reliability are measured.
- [ ] Keep offline-first capture and cross-session continuity as explicit gaps until implemented and tested.

## Enable cloud STT

1. Set in Vercel server environment:
   - `DOKKIT_STT_API_KEY` = Deepgram (or supported provider) key
   - `DOKKIT_STT_PROVIDER` = `deepgram` | `openai`
2. Optional browser setting:
   - `NEXT_PUBLIC_DOKKIT_STT_PREFER_CLOUD=1` to prefer blob → `/api/stt`
3. Probe:
   - `GET /api/stt` should return `{ configured: true, provider: "deepgram" }` when configured.
4. Do not commit credentials or report cloud STT as production-ready until the production probe and real-device smoke tests pass.

## Native-app direction and next recommended pass

Cloud STT provider setup and browser-specific production smoke tests are intentionally deferred while Dokkit moves toward a native app; a missing provider key is not a blocker for this milestone. The browser/cloud path remains a replaceable transport, not the semantic authority.

Phase AH adds a component-level regression gate around the existing web Capture Dock: rendering the sheet must not execute or persist work, and the execution adapter is reached only after an explicit Dock interaction.

Phase AI adds `lib/speech/captureContract.ts`, a client-independent lifecycle boundary for typed and transcript text. It prepares a deterministic proposal, requires explicit authorization, supports cancellation, prevents repeated authorization within one in-memory session, and refuses request-ID reuse with different input. It has no React/browser dependencies and performs no task/collection persistence. Its one-time authorization ticket is a client-side coordination mechanism, not a durable or cross-device lock; native persistence must still enforce server/database idempotency.

Next: wire a native text/transcript entry point to this contract, then add platform-specific microphone/transcription adapters without moving semantic authority into the provider. Define the persistence adapter separately and enforce idempotency at its durable boundary. Continue expanding independently reviewed semantic evaluation; do not treat draft labels or typed/speech parity as ground truth. Add aggregate dashboards only after a durable sink and retention policy are selected.
