/**
 * Shared speech locale handling for browser and cloud transcription.
 * Locale selection is configuration, not a grammar/domain assumption.
 */

export const DEFAULT_SPEECH_LOCALE = 'en-NZ';

export function normalizeSpeechLocale(
  value: string | null | undefined,
  fallback = DEFAULT_SPEECH_LOCALE,
): string {
  const raw = (value ?? '').trim().replace(/_/g, '-');
  const candidate = /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/.test(raw) && raw.length <= 35
    ? raw
    : fallback;
  return candidate
    .split('-')
    .map((part, index) => {
      if (index === 0) return part.toLowerCase();
      if (part.length === 2) return part.toUpperCase();
      if (part.length === 4) return part[0].toUpperCase() + part.slice(1).toLowerCase();
      return part;
    })
    .join('-');
}
