import { describe, expect, it, vi } from 'vitest';
import { emitSpeechTelemetry } from '../telemetry';

describe('privacy-safe speech telemetry', () => {
  it('emits only allowlisted bounded fields', () => {
    const logger = vi.fn();
    emitSpeechTelemetry({
      outcome: 'provider_error',
      provider: 'deepgram',
      locale: 'en-NZ',
      durationMs: 120_001,
      // @ts-expect-error arbitrary content must not be part of the event contract
      transcript: 'private words',
      // @ts-expect-error identity must not be part of the event contract
      userId: 'private-user',
    }, logger);

    expect(logger).toHaveBeenCalledTimes(1);
    const line = logger.mock.calls[0][0];
    expect(JSON.parse(line)).toEqual({
      event: 'dokkit_speech_capture',
      schema: 1,
      outcome: 'provider_error',
      provider: 'deepgram',
      locale: 'en-NZ',
      durationMs: 120_000,
    });
    expect(line).not.toContain('private words');
    expect(line).not.toContain('private-user');
  });

  it('drops malformed locale and invalid duration instead of logging them', () => {
    const logger = vi.fn();
    emitSpeechTelemetry({
      outcome: 'success',
      provider: 'browser',
      locale: 'name@example.com',
      durationMs: Number.NaN,
    }, logger);

    expect(JSON.parse(logger.mock.calls[0][0])).toEqual({
      event: 'dokkit_speech_capture',
      schema: 1,
      outcome: 'success',
      provider: 'browser',
    });
  });

  it('does not throw if the log sink throws', () => {
    // Logging must not change capture success/failure semantics.
    expect(() => emitSpeechTelemetry(
      { outcome: 'success', provider: 'browser' },
      () => { throw new Error('sink unavailable'); },
    )).not.toThrow();
  });
});
