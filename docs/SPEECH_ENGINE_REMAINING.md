# Dokkit Speech Engine — Remaining Work & Status

**Updated:** 2026-10-04

## Done (current main)

- Deterministic speech pipeline + confirm-only act
- Persistent Collections + Capture Dock + Lists/clarification
- Job/meeting context linking
- Cloud HTTP client provider + **POST /api/stt** proxy (Deepgram/OpenAI/generic)
- **Blob capture path**: MediaRecorder → `/api/stt` (fallback when no Web Speech; optional prefer-cloud)
- Unit tests + Web CI + `test:engine` scripts

## Remaining

### A. Collections
- [ ] Apply `20261004_collections.sql` on production Supabase
- [ ] Optional Lists entry on Today header

### B. STT polish
- [ ] Wire a real `DOKKIT_STT_API_KEY` in Vercel (Deepgram recommended)
- [ ] Locale packs beyond en-NZ default

### C. Discourse & learning
- [ ] Cross-session discourse memory beyond vocab
- [ ] Server-synced personal language model
- [ ] Thinking-engine training from confirmed speech outcomes

### D. Ops
- [ ] Privacy-safe prod instrumentation
- [ ] Freeze SPEECH_ENGINE_QUALITY exit criteria

## Enable cloud STT

1. Set on Vercel (server):
   - `DOKKIT_STT_API_KEY` = Deepgram (or OpenAI) key
   - `DOKKIT_STT_PROVIDER` = `deepgram` | `openai`
2. Optional browser:
   - `NEXT_PUBLIC_DOKKIT_STT_PREFER_CLOUD=1` to force blob→`/api/stt`
3. Probe: `GET /api/stt` → `{ configured: true, provider: "deepgram" }`
