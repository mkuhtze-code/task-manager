import { describe, expect, it } from 'vitest';
import { DEFAULT_SPEECH_LOCALE, normalizeSpeechLocale } from '../locale';

describe('speech locale normalization', () => {
  it('defaults to New Zealand English', () => {
    expect(normalizeSpeechLocale(undefined)).toBe('en-NZ');
    expect(DEFAULT_SPEECH_LOCALE).toBe('en-NZ');
  });

  it('normalizes common BCP-47 locale casing and separators', () => {
    expect(normalizeSpeechLocale('EN_nz')).toBe('en-NZ');
    expect(normalizeSpeechLocale('zh-hant-tw')).toBe('zh-Hant-TW');
    expect(normalizeSpeechLocale('mi-NZ')).toBe('mi-NZ');
  });

  it('rejects malformed or excessive locale input and uses fallback', () => {
    expect(normalizeSpeechLocale('not a locale')).toBe('en-NZ');
    expect(normalizeSpeechLocale('en-' + 'x'.repeat(40), 'en-AU')).toBe('en-AU');
    expect(normalizeSpeechLocale('bad input', 'en-AU')).toBe('en-AU');
  });
});
