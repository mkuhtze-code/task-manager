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
- Phase AF bounded privacy-safe STT telemetry; only allowlisted outcome/provider/locale/duration are eligible, with no raw transcript/audio or identifiers
- Phase AI client-independent capture contract for typed/transcript text, explicit authorization, cancellation, and one-time in-session tickets
- Phase AJ native capture persistence idempotency (in review): stable request IDs are reused across retries, and a per-user unique database index prevents duplicate task rows

## Remaining

### A. Native capture and persistence

- [ ] Apply `supabase/migrations/20261012_native_capture_idempotency.sql` to the Supabase project before releasing the updated native app.
- [ ] Run Android Gradle unit tests/build and verify retry after a simulated lost response creates only one task.
- [ ] Connect native capture to Dokkit's deterministic semantic interpretation and explicit proposal review; current native Today capture still persists the confirmed text as a basic task and is not yet at parity with the web semantic engine.
- [ ] Verify permission denial, recognizer cancellation/interruption, offline capture, retry, accessibility, and lifecycle restoration on physical Android devices.
- [ ] Define durable request idempotency for collection/context operations before those are enabled natively.

### B. Semantic quality evidence

- [ ] Build independently reviewed validation and held-out semantic sets; draft corpus and parity replay are not gold accuracy evidence.
- [ ] Report action/non-action classification, critical-field retention, unresolved-reference behavior, and failures by scenario family.
- [ ] Use the exit thresholds in [SPEECH_ENGINE_QUALITY.md](./SPEECH_ENGINE_QUALITY.md); do not claim a threshold is met until measured with denominators.

### C. Discourse & personal learning

- [ ] Cross-session discourse memory beyond active context and vocabulary.
- [ ] Server-synced personal language model with per-user isolation and multi-device tests.
- [ ] Feed confirmed speech outcomes into Thinking Engine estimates/capacity with provenance and privacy controls.

### D. Operational quality

- [ ] Verify production and real-device native capture without requiring a cloud STT provider.
- [ ] Add aggregate dashboards only after a durable sink and retention policy are selected.
