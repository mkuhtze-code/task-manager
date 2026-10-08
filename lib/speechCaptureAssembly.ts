/**
 * Pure STT transcript assembly — no React, no Web Speech API.
 *
 * Progressive recognition hypotheses are replacements, not pieces to concat.
 * True continuous segments that add new words still space-join.
 * Legitimate repeated words remain preserved.
 */

export type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0?: { transcript?: string };
};

export type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike> & { length: number };
};

function normaliseTranscript(value: string): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

function overlapToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'-]/gu, '');
}

/**
 * Find the largest word overlap where the end of the committed transcript
 * is also the beginning of the next STT segment.
 *
 * We deliberately require at least two words. A one-word overlap such as
 * "call John" + "John said..." can be a legitimate repeated word, while
 * multi-word overlap is a strong signal that Web Speech has replayed part
 * of the previous hypothesis.
 */
function trailingLeadingOverlap(a: string[], b: string[]): number {
  const max = Math.min(a.length, b.length);

  for (let size = max; size >= 2; size -= 1) {
    let matches = true;

    for (let i = 0; i < size; i += 1) {
      if (overlapToken(a[a.length - size + i]) !== overlapToken(b[i])) {
        matches = false;
        break;
      }
    }

    if (matches) return size;
  }

  return 0;
}

/**
 * Merge a newly finalized hypothesis into the committed transcript.
 *
 * - Full progressive extensions replace the previous hypothesis.
 * - Shorter progressive prefixes are ignored.
 * - Multi-word boundary overlap is de-duplicated.
 * - Otherwise the text is treated as a genuinely additive segment.
 */
export function mergeSpeechFinal(acc: string, next: string): string {
  const a = normaliseTranscript(acc);
  const b = normaliseTranscript(next);
  if (!b) return a;
  if (!a) return b;

  const aL = a.toLowerCase();
  const bL = b.toLowerCase();

  if (bL.startsWith(aL)) return b;
  if (aL.startsWith(bL)) return a;
  if (aL === bL) return a;

  const aWords = a.split(' ');
  const bWords = b.split(' ');
  const overlap = trailingLeadingOverlap(aWords, bWords);

  if (overlap > 0) {
    const originalBWords = b.split(' ');
    return `${a} ${originalBWords.slice(overlap).join(' ')}`.trim();
  }

  return `${a} ${b}`;
}

/**
 * Apply one recognition event: fold only isFinal results from resultIndex onward.
 * Interim hypotheses are ignored for the committed string.
 */
export function applySpeechRecognitionEvent(
  committed: string,
  event: SpeechRecognitionEventLike
): string {
  let next = committed;
  const start = Math.max(0, event.resultIndex | 0);

  for (let i = start; i < event.results.length; i += 1) {
    const piece = event.results[i];
    if (!piece?.isFinal) continue;

    const t = piece[0]?.transcript;
    if (t == null || !String(t).trim()) continue;

    next = mergeSpeechFinal(next, String(t));
  }

  return next;
}

/**
 * Simulate a stream of progressive final hypotheses.
 */
export function assembleProgressiveFinals(hypotheses: string[]): string {
  return hypotheses.reduce((acc, h) => mergeSpeechFinal(acc, h), '');
}
