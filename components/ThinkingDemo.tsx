'use client';

import { useEffect, useState } from 'react';

// The second signature moment — this one demonstrates the "brain" from
// taskIntelligence.ts rather than the capacity model. A task name types
// itself out, a learned suggestion quietly appears, gets accepted, and a
// small note confirms the capacity math updated too — the whole loop the
// real capture sheet + effectiveEstimate() do together, played out.

const DEMO_TEXT = 'Revise Quote';
const TYPE_MS = 90;
const RESET_PAUSE_MS = 2200;

export default function ThinkingDemo() {
  const [typed, setTyped] = useState('');
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [showNote, setShowNote] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function schedule(fn: () => void, delay: number) {
      const id = setTimeout(() => {
        if (!cancelled) fn();
      }, delay);
      timers.push(id);
    }

    function run() {
      setTyped('');
      setShowSuggestion(false);
      setAccepted(false);
      setShowNote(false);

      DEMO_TEXT.split('').forEach((_, i) => {
        schedule(() => setTyped(DEMO_TEXT.slice(0, i + 1)), i * TYPE_MS);
      });

      const afterType = DEMO_TEXT.length * TYPE_MS;
      schedule(() => setShowSuggestion(true), afterType + 400);
      schedule(() => setAccepted(true), afterType + 1800);
      schedule(() => setShowNote(true), afterType + 2500);
      schedule(run, afterType + 2500 + RESET_PAUSE_MS);
    }

    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div
      className="thinking-demo"
      role="img"
      aria-label="Animated demonstration of Dokkit recognizing a repeated task and suggesting how long it usually takes"
    >
      <div className="thinking-demo-input">
        <span>{typed}</span>
        <span className="thinking-demo-caret" />
      </div>

      {/* All three staged elements always render, from first paint, so
          the card's height never changes as the demo plays — visibility
          is purely a class toggle (opacity/transform), not a mount. This
          keeps everything below the demo from shifting on every loop. */}
      <div
        className={`thinking-demo-chip ${showSuggestion ? 'is-shown' : ''} ${accepted ? 'accepted' : ''}`}
        aria-hidden={!showSuggestion}
      >
        ≈ 45m usual (4×)
      </div>

      <div className={`thinking-demo-field mono ${accepted ? 'is-shown' : ''}`} aria-hidden={!accepted}>
        45m
      </div>

      <div className={`thinking-demo-note ${showNote ? 'is-shown' : ''}`} aria-hidden={!showNote}>
        Capacity just got a little more honest.
      </div>
    </div>
  );
}
