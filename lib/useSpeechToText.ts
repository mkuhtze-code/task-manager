'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Thin wrapper around the browser's native SpeechRecognition API. Chrome
// (including Chrome for Android) supports this under the webkit-prefixed
// name; there's no official cross-browser standard yet, so isSupported
// gracefully hides the mic button anywhere it's missing (notably Safari)
// rather than showing something broken.
//
// continuous=true: keep listening until the user taps stop. Non-continuous
// mode ends after a short pause (~few seconds on Chrome), which felt like
// a hard 5s cap in Today capture.

type SpeechToTextHandlers = {
  onResult: (text: string) => void;
  onError?: (error: string) => void;
  /** Soft ceiling so a forgotten mic does not run forever. Default 120s. */
  maxDurationMs?: number;
};

const DEFAULT_MAX_DURATION_MS = 120_000;

export function useSpeechToText({
  onResult,
  onError,
  maxDurationMs = DEFAULT_MAX_DURATION_MS,
}: SpeechToTextHandlers) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const accumulatedRef = useRef('');
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while we intentionally called stop() — suppresses restart onend
  const stoppingRef = useRef(false);

  // Keep the latest callbacks in refs so `start` doesn't need to be
  // recreated (and doesn't go stale) every time the parent re-renders.
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const SpeechRecognitionCtor =
      typeof window !== 'undefined' &&
      ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    setIsSupported(!!SpeechRecognitionCtor);
  }, []);

  const clearMaxTimer = useCallback(() => {
    if (maxTimerRef.current != null) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
  }, []);

  const flushResult = useCallback(() => {
    const text = accumulatedRef.current.trim();
    accumulatedRef.current = '';
    if (text) onResultRef.current(text);
  }, []);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    clearMaxTimer();
    try {
      recognitionRef.current?.stop();
    } catch {
      // already stopped
    }
  }, [clearMaxTimer]);

  const start = useCallback(() => {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    stoppingRef.current = false;
    accumulatedRef.current = '';
    clearMaxTimer();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // already stopped, ignore
      }
    }

    const recognition = new SpeechRecognitionCtor();
    // continuous: keep the session open across pauses so the user can
    // speak naturally and stop only when they tap the mic again.
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang =
      typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';

    recognition.onresult = (event: any) => {
      let finals = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const piece = event.results[i];
        if (piece?.isFinal) {
          const t = piece[0]?.transcript;
          if (t) finals += (finals ? ' ' : '') + String(t).trim();
        }
      }
      if (finals) {
        accumulatedRef.current = accumulatedRef.current
          ? `${accumulatedRef.current} ${finals}`
          : finals;
      }
    };

    recognition.onerror = (event: any) => {
      const err = event?.error as string | undefined;
      // no-speech / aborted are normal when continuous and the user pauses
      // or taps stop — do not treat as hard failures.
      if (err === 'aborted' || err === 'no-speech') {
        return;
      }
      setIsListening(false);
      clearMaxTimer();
      if (err) onErrorRef.current?.(err);
    };

    recognition.onend = () => {
      // Chrome sometimes ends continuous sessions after network blips or
      // long silence. Restart unless the user explicitly stopped.
      if (!stoppingRef.current && recognitionRef.current === recognition) {
        try {
          recognition.start();
          return;
        } catch {
          // cannot restart — fall through to idle
        }
      }
      recognitionRef.current = null;
      setIsListening(false);
      clearMaxTimer();
      flushResult();
      stoppingRef.current = false;
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    try {
      recognition.start();
    } catch (e) {
      setIsListening(false);
      recognitionRef.current = null;
      onErrorRef.current?.(String(e));
      return;
    }

    // Safety ceiling only — not a short dictation window
    maxTimerRef.current = setTimeout(() => {
      stop();
    }, maxDurationMs);
  }, [clearMaxTimer, flushResult, maxDurationMs, stop]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stoppingRef.current = true;
      clearMaxTimer();
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
    };
  }, [clearMaxTimer]);

  return { isSupported, isListening, start, stop };
}
