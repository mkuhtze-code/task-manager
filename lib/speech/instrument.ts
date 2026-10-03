/**
 * Speech instrumentation — safe metadata only.
 * Never log raw speech content in production sinks.
 */

export type SpeechInstrumentEvent =
  | 'capture_started'
  | 'capture_completed'
  | 'capture_failed'
  | 'capture_cancelled'
  | 'transcription_started'
  | 'transcription_completed'
  | 'transcription_failed'
  | 'transcript_repaired'
  | 'normalisation_completed'
  | 'correction_detected'
  | 'intent_detected'
  | 'entity_detected'
  | 'interpretation_confirmed'
  | 'interpretation_corrected'
  | 'learning_event_created'
  | 'learning_event_reused'
  | 'vocabulary_applied';

export type SpeechInstrumentPayload = {
  event: SpeechInstrumentEvent;
  sessionId?: string;
  provider?: string;
  durationMs?: number;
  confidence?: string;
  intent?: string;
  correctionCount?: number;
  repairCount?: number;
  entityCount?: number;
  errorCode?: string;

  /**
   * Opaque counts only — never raw transcript.
   */
  textLength?: number;

  at?: string;
};

export type SpeechInstrumentSink = (
  payload: SpeechInstrumentPayload
) => void;

const defaultSink: SpeechInstrumentSink = (
  payload
) => {
  if (
    typeof process !== 'undefined' &&
    process.env?.NODE_ENV === 'development'
  ) {
    // eslint-disable-next-line no-console
    console.debug('[speech]', payload.event, {
      sessionId: payload.sessionId,
      provider: payload.provider,
      confidence: payload.confidence,
      intent: payload.intent,
      errorCode: payload.errorCode,
      repairCount: payload.repairCount,
      correctionCount: payload.correctionCount,
      entityCount: payload.entityCount,
    });
  }
};

let sink: SpeechInstrumentSink =
  defaultSink;

export function setSpeechInstrumentSink(
  next: SpeechInstrumentSink | null
): void {
  sink =
    next ??
    defaultSink;
}

export function emitSpeechEvent(
  event: SpeechInstrumentEvent,
  fields: Omit<
    SpeechInstrumentPayload,
    'event' | 'at'
  > = {}
): void {
  try {
    sink({
      event,
      at: new Date().toISOString(),
      ...fields,
    });
  } catch {
    /*
     * Instrumentation must never break the
     * speech pipeline.
     */
  }
}