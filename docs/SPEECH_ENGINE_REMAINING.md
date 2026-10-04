# Dokkit Speech Engine — Remaining Work & Status

**Updated:** 2026-10-04

## Done (current main)

- Deterministic pipeline (repair → normalise → interpret → decide → confirm-only act)
- Adversarial / unit speech tests; Web CI runs `npm test`
- Capture / MeetingSheets / TaskDetail speech paths
- Confirm → local personal language model learning
- Persistent Collections engine + speech detect + Capture Dock apply
- Collections dual-write (local + best-effort Supabase remote)
- CollectionsPeek + clarification picker + client_op_id
- Job/meeting context linking (`for Smith Street` → contextId)
- Universal domain packs soft-scored in `sttRepair`
- **Cloud HTTP STT provider** (`createCloudTranscriptionProvider` / `cloudProviderFromEnv`)
- Targeted scripts: `test:speech`, `test:collections`, `test:engine`

## Remaining for "finished"

### A. Collections product
- [ ] Apply `20261004_collections.sql` on production Supabase
- [ ] Optional: Lists entry outside Capture (Today header)

### B. STT quality
- [ ] Production `/api/stt` proxy to Deepgram/AssemblyAI/Whisper
- [ ] Record-blob → cloud path in Capture mic UX (when Web Speech weak)
- [ ] Locale packs (NZ/AU/UK) beyond en-NZ default

### C. Discourse & learning
- [ ] Cross-session discourse memory beyond vocab
- [ ] Server-synced personal language model
- [ ] Thinking-engine training from confirmed speech outcomes

### D. Quality ops
- [x] CI: Web workflow already runs unit tests + typecheck + build
- [ ] Prod instrumentation (privacy-safe)
- [ ] Freeze SPEECH_ENGINE_QUALITY exit criteria

## Exit criteria

1. No auto-mutate from speech
2. Multi-turn lists survive refresh + multi-device
3. Personal model improves from Dock/correct
4. CI green on speech + collections
5. Cloud STT or explicit degraded-mode messaging
