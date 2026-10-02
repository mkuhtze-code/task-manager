/**
 * Speech pipeline orchestration.
 * Capture → transcription → vocabulary → normalisation → interpretation → decision.
 */

import { saveMediaBlob } from '@/lib/mediaStore';
import { getTranscriptionProvider } from './providers';
import { normaliseSpeech } from './normalise';
import { interpretSpeech } from './interpret';
import { decideSpeechActions } from './decision';
import { applyVocabulary, applyNameAliases } from './learning';
import { emitSpeechEvent } from './instrument';
import type { PersonalCommunicationProfile } from '@/lib/communication/types';
import type {
  SpeechInput,
  SpeechPipelineResult,
  SpeechSession,
  TranscriptionResult,
} from './types';

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ss-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createSpeechSession(partial?: Partial<SpeechSession>): SpeechSession {
  const now = new Date().toISOString();
  return {
    id: partial?.id ?? makeId(),
    userId: partial?.userId,
    status: partial?.status ?? 'capturing',
    startedAt: partial?.startedAt ?? now,
    endedAt: partial?.endedAt,
    durationMs: partial?.durationMs,
    language: partial?.language,
    audioRef: partial?.audioRef,
    mimeType: partial?.mimeType,
    transcript: partial?.transcript,
    normalisation: partial?.normalisation,
    interpretation: partial?.interpretation,
    error: partial?.error,
    transcriptionAttempts: partial?.transcriptionAttempts ?? 0,
  };
}

export async function persistSpeechAudio(
  blob: Blob,
  meta?: { mime?: string | null; size?: number | null }
): Promise<string> {
  return saveMediaBlob(blob, meta);
}

export async function transcribeSession(
  session: SpeechSession,
  input?: SpeechInput
): Promise<SpeechSession> {
  const provider = getTranscriptionProvider();
  const next: SpeechSession = {
    ...session,
    status: 'transcribing',
    transcriptionAttempts: session.transcriptionAttempts + 1,
  };
  emitSpeechEvent('transcription_started', {
    sessionId: session.id,
    provider: provider.id,
  });
  try {
    const result: TranscriptionResult = await provider.transcribe(
      input ?? {
        audioRef: session.audioRef,
        mimeType: session.mimeType,
        durationMs: session.durationMs,
        sessionId: session.id,
        languageHint: session.language,
      }
    );
    emitSpeechEvent('transcription_completed', {
      sessionId: session.id,
      provider: provider.id,
      confidence: result.confidence != null ? String(result.confidence) : undefined,
      textLength: result.text?.length,
    });
    return {
      ...next,
      status: 'transcribed',
      transcript: result,
      language: result.language ?? session.language,
      error: undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transcription failed';
    emitSpeechEvent('transcription_failed', {
      sessionId: session.id,
      provider: provider.id,
      errorCode: 'transcription_failed',
    });
    return {
      ...next,
      status: 'queued_transcription',
      error: message,
    };
  }
}

export function processSpeechText(
  text: string,
  options?: {
    session?: SpeechSession;
    todayIso?: string;
    profile?: PersonalCommunicationProfile | null;
    languageModel?: import('./types').PersonalLanguageModel | null;
    understandingContext?: import('./semantic/context').SpeechUnderstandingContext | null;
  }
): SpeechPipelineResult {
  const session = options?.session ?? createSpeechSession({ status: 'transcribed' });
  let working = text;
  if (options?.languageModel) {
    const applied = applyVocabulary(working, options.languageModel);
    if (applied.applied.length > 0) {
      working = applied.text;
      emitSpeechEvent('vocabulary_applied', {
        sessionId: session.id,
        textLength: working.length,
      });
    }
    working = applyNameAliases(working, options.languageModel);
  }
  const normalisation = normaliseSpeech(working, { todayIso: options?.todayIso });
  if (normalisation.corrections.length > 0) {
    emitSpeechEvent('correction_detected', {
      sessionId: session.id,
      correctionCount: normalisation.corrections.length,
      textLength: normalisation.normalisedText.length,
    });
  }
  emitSpeechEvent('normalisation_completed', {
    sessionId: session.id,
    confidence: normalisation.confidence,
    textLength: normalisation.normalisedText.length,
  });
  const interpretation = interpretSpeech(working, {
    todayIso: options?.todayIso,
    profile: options?.profile,
    sessionId: session.id,
    normalisation,
    understandingContext: options?.understandingContext,
  });
  emitSpeechEvent('intent_detected', {
    sessionId: session.id,
    intent: interpretation.intent,
    confidence: interpretation.confidence,
    entityCount: interpretation.entities.length,
  });
  const decision = decideSpeechActions(interpretation, {
    transcriptionConfidence:
      session.transcript?.confidence != null
        ? session.transcript.confidence >= 0.85
          ? 'high'
          : session.transcript.confidence >= 0.55
            ? 'medium'
            : 'low'
        : 'medium',
  });
  const enriched = {
    ...interpretation,
    transcriptionConfidence: decision.transcriptionConfidence,
    interpretationConfidence: decision.interpretationConfidence,
    actionConfidence: decision.actionConfidence,
    requiresConfirmation: decision.requiresConfirmation,
    mustNotCreateTask: decision.mustNotCreateTask,
  };
  const completed: SpeechSession = {
    ...session,
    status: 'interpreted',
    normalisation,
    interpretation: enriched,
    endedAt: session.endedAt ?? new Date().toISOString(),
  };
  return { session: completed, interpretation: enriched, decision };
}

export async function runSpeechPipeline(
  input: SpeechInput & { text?: string },
  options?: {
    userId?: string;
    todayIso?: string;
    profile?: PersonalCommunicationProfile | null;
    languageModel?: import('./types').PersonalLanguageModel | null;
    existingSession?: SpeechSession;
    understandingContext?: import('./semantic/context').SpeechUnderstandingContext | null;
  }
): Promise<SpeechPipelineResult> {
  let session =
    options?.existingSession ??
    createSpeechSession({
      userId: options?.userId,
      status: 'captured',
      audioRef: input.audioRef,
      mimeType: input.mimeType,
      durationMs: input.durationMs,
      language: input.languageHint,
    });

  if (input.blob && !session.audioRef) {
    try {
      const ref = await persistSpeechAudio(input.blob, {
        mime: input.mimeType ?? input.blob.type,
        size: input.blob.size,
      });
      session = { ...session, audioRef: ref, mimeType: input.mimeType ?? input.blob.type };
    } catch {
      session = {
        ...session,
        status: 'failed',
        error: "Couldn't store audio on this device — try again.",
      };
      return { session, interpretation: null };
    }
  }

  if (input.text && input.text.trim()) {
    return processSpeechText(input.text, {
      session: { ...session, status: 'transcribed' },
      todayIso: options?.todayIso,
      profile: options?.profile,
      languageModel: options?.languageModel,
      understandingContext: options?.understandingContext,
    });
  }

  if (session.transcript?.text) {
    return processSpeechText(session.transcript.text, {
      session,
      todayIso: options?.todayIso,
      profile: options?.profile,
      languageModel: options?.languageModel,
      understandingContext: options?.understandingContext,
    });
  }

  session = await transcribeSession(session, input);
  if (session.status !== 'transcribed' || !session.transcript?.text) {
    return { session, interpretation: null };
  }

  return processSpeechText(session.transcript.text, {
    session,
    todayIso: options?.todayIso,
    profile: options?.profile,
    languageModel: options?.languageModel,
    understandingContext: options?.understandingContext,
  });
}
