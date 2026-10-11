/**
 * Bounded, content-free server telemetry for the speech capture pipeline.
 *
 * This is deliberately an allowlist, not a generic logger. Never pass transcripts,
 * audio, user IDs, IPs, task text, names, addresses, upstream error messages, or
 * arbitrary provider response data to this module.
 */
export type SpeechTelemetryProvider = 'deepgram' | 'openai' | 'generic' | 'browser' | 'unknown';
export type SpeechTelemetryOutcome =
  | 'success'
  | 'not_configured'
  | 'rate_limited'
  | 'invalid_request'
  | 'provider_error';

export type SpeechTelemetryEvent = {
  outcome: SpeechTelemetryOutcome;
  provider: SpeechTelemetryProvider;
  locale?: string;
  durationMs?: number;
};

export type SpeechTelemetryLogger = (line: string) => void;

const ALLOWED_LOCALES = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/;
const MAX_DURATION_MS = 120_000;

/** Serialize only bounded fields and send one structured line to server logs. */
export function emitSpeechTelemetry(
  event: SpeechTelemetryEvent,
  logger: SpeechTelemetryLogger = (line) => console.info(line),
): void {
  const safeEvent = {
    event: 'dokkit_speech_capture',
    schema: 1,
    outcome: event.outcome,
    provider: event.provider,
    ...(event.locale && ALLOWED_LOCALES.test(event.locale) ? { locale: event.locale } : {}),
    ...(typeof event.durationMs === 'number' && Number.isFinite(event.durationMs)
      ? { durationMs: Math.max(0, Math.min(MAX_DURATION_MS, Math.round(event.durationMs))) }
      : {}),
  };
  try {
    logger(JSON.stringify(safeEvent));
  } catch {
    // Telemetry is best-effort and must never change product behavior.
  }
}
