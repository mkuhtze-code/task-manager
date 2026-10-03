/**
 * Pure STT transcript assembly — no React, no Web Speech API.
 *
 * Progressive recognition hypotheses are *replacements*, not pieces to concat:
 *   "check" → "check on" → "check on Monday whether..."
 * must become one coherent final string, never
 *   "check check on check on Monday..."
 *
 * True continuous segments that add new words still space-join.
 * Legitimate repeated words ("call John, John said") are preserved.
 */

export type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0?: { transcript?: string };
};

export type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike> & { length: number };
};

/**
 * Merge a newly finalized hypothesis into the committed transcript.
 * Replacement when `next` extends or restates `acc`; otherwise additive join.
 */
export function mergeSpeechFinal(acc: string, next: string): string {
  const a = (acc ?? '').trim().replace(/\s+/g, ' ');
  const b = (next ?? '').trim().replace(/\s+/g, ' ');
  if (!b) return a;
  if (!a) return b;

  const aL = a.toLowerCase();
  const bL = b.toLowerCase();

  // Progressive / restarted hypothesis: new final is an extension of committed
  if (bL.startsWith(aL)) return b;
  // New final is a prefix of what we already have — keep committed
  if (aL.startsWith(bL)) return a;
  // Exact duplicate tail (same final emitted twice)
  if (aL.endsWith(bL) && (aL.length === bL.length || /\s$/.test(a.slice(0, a.length - b.length)) || aL.endsWith(' ' + bL))) {
    return a;
  }
  // Whole-phrase duplicate anywhere
  if (aL === bL) return a;

  return `${a} ${b}`;
}

/**
 * Apply one recognition event: fold only isFinal results from resultIndex onward.
 * Interim hypotheses are ignored for the committed string (replacement-only UI
 * may still show them separately; capture commits finals only).
 */
export function applySpeechRecognitionEvent(
  committed: string,
  event: SpeechRecognitionEventLike
): string {
  let next = committed;
  const start = Math.max(0, event.resultIndex | 0);
  for (let i = start; i < event.results.length; i++) {
    const piece = event.results[i];
    if (!piece?.isFinal) continue;
    const t = piece[0]?.transcript;
    if (t == null || !String(t).trim()) continue;
    next = mergeSpeechFinal(next, String(t));
  }
  return next;
}

/**
 * Simulate a stream of progressive final hypotheses (the failure mode).
 * Expected: last coherent utterance only.
 */
export function assembleProgressiveFinals(hypotheses: string[]): string {
  return hypotheses.reduce((acc, h) => mergeSpeechFinal(acc, h), '');
}
