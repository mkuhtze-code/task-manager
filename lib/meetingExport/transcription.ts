import type { MeetingTranscriptStatus } from './types';

// ── Transcription seam (V1) ───────────────────────────────────────────
// The Meetings Record CAN carry a transcript of each selected voice note.
// V1 ships the seam, not a provider: engines can register themselves here
// and the export flow will run them over exactly the media that left the
// meeting (the original, device-local bytes). A note with no transcript
// still exports — the PDF prints "Transcript unavailable — original
// recording included in the Evidence Package." and the raw recording stays
// the authoritative copy. Nothing transcribes silently: the transcription
// flag is an explicit, per-export choice and every  result is recorded on
// the ExportRecord.

export type MeetingTranscriptionAsset = {
  mediaId: string;
  localUri: string;
  mimeType: string;
  // The original bytes, resolved from device-local storage by the engine.
  blob: Blob;
  capturedAt: string;
};

export type MeetingTranscriptionProvider = {
  id: string;
  // Returns the transcript text, or null when this asset produced none.
  transcribe: (asset: MeetingTranscriptionAsset) => Promise<string | null>;
};

export type MeetingTranscriptionOutcome = {
  status: Exclude<MeetingTranscriptStatus, 'not_requested' | 'requested'>;
  // mediaId → transcript text for the assets that transcribed.
  transcripts: Map<string, string>;
  error: string | null;
};

const REGISTERED_PROVIDERS: MeetingTranscriptionProvider[] = [];

export function registerMeetingTranscriptionProvider(provider: MeetingTranscriptionProvider): void {
  if (REGISTERED_PROVIDERS.some((p) => p.id === provider.id)) return;
  REGISTERED_PROVIDERS.push(provider);
}

export function transcriptionProviders(): readonly MeetingTranscriptionProvider[] {
  return REGISTERED_PROVIDERS;
}

export async function transcribeAssets(
  assets: MeetingTranscriptionAsset[],
  providers: readonly MeetingTranscriptionProvider[] = REGISTERED_PROVIDERS
): Promise<MeetingTranscriptionOutcome> {
  if (assets.length === 0) {
    return { status: 'completed', transcripts: new Map(), error: null };
  }
  if (providers.length === 0) {
    return {
      status: 'failed',
      transcripts: new Map(),
      error: 'No transcription provider is set up yet',
    };
  }
  const transcripts = new Map<string, string>();
  let failures = 0;
  for (const asset of assets) {
    let text: string | null = null;
    for (const provider of providers) {
      try {
        text = await provider.transcribe(asset);
        if (text !== null && text.trim().length > 0) break;
      } catch {
        // A failing provider is not a failing export — move on.
      }
    }
    if (text && text.trim().length > 0) transcripts.set(asset.mediaId, text.trim());
    else failures += 1;
  }
  return {
    status: failures === 0 ? 'completed' : 'failed',
    transcripts,
    error: failures === 0 ? null : 'Some voice notes could not be transcribed',
  };
}