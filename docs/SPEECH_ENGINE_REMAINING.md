# Dokkit Speech Engine — Remaining Work & Status

**Updated:** 2026-10-04

## Done (current main)

- Deterministic pipeline (repair → normalise → interpret → decide → confirm-only act)
- Adversarial 530-case gate (wouldMutateWithoutConfirm = 0 historically)
- Capture / MeetingSheets / TaskDetail speech paths
- Confirm → local personal language model learning
- Persistent Collections engine + speech detect + Capture Dock apply (localStorage)
- Collections dual-write to Supabase (best-effort via `remote.ts`)
- Collections unit tests + CollectionsPeekSheet
- **Capture “Lists” entry** + clarification picker + client_op_id on Dock items
- Universal domain packs + soft scoring in `sttRepair`

## Remaining for “finished”

### A. Collections product
- [ ] Apply `20261004_collections.sql` on production Supabase
- [ ] Job/meeting context linking end-to-end (snag for job X)
- [ ] Optional: Lists entry outside Capture (Today header)

### B. STT quality
- [ ] Cloud STT provider behind same pipeline
- [ ] Locale (NZ/AU/UK) packs

### C. Discourse & learning
- [ ] Cross-session discourse memory beyond vocab
- [ ] Server-synced personal language model
- [ ] Thinking-engine training from confirmed speech outcomes

### D. Quality ops
- [ ] CI job: `vitest` speech + collections required
- [ ] Prod instrumentation (privacy-safe)
- [ ] Freeze SPEECH_ENGINE_QUALITY exit criteria

## Exit criteria

1. No auto-mutate from speech
2. Multi-turn lists survive refresh + multi-device
3. Personal model improves from Dock/correct
4. CI green on speech + collections
5. Cloud STT or explicit degraded-mode messaging
