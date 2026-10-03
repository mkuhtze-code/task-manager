'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applySpeechRecognitionEvent,
  type SpeechRecognitionEventLike,
} from '@/lib/speechCaptureAssembly';

// Thin wrapper around the browser's native SpeechRecognition API. Chrome
// (including Chrome for Android) supports this under the webkit-prefixed
// name; there's no official cross-browser standard yet, so isSupported
// gracefully hides the mic button anywhere it's missing (notably Safari)
// rather than showing something broken.
//
// continuous=true: keep listening until the user taps stop.
// Final transcripts are assembled with *replacement* semantics for progressive
// hypotheses so "check" → "check on" → "check on Monday" does not become
// "check check on check on Monday". UI receives one coherent string on stop.

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
  /** Committed finals only — never interim hypotheses. */
  const committedRef = useRef('');
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // True while we intentionally called stop() — suppresses restart onend
  const stoppingRef = useRef(false);
  // Prevent double-flush if onend fires more than once after stop
  const flushedRef = useRef(false);

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
    if (flushedRef.current) return;
    flushedRef.current = true;
    const text = committedRef.current.trim();
    committedRef.current = '';
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
    flushedRef.current = false;
    committedRef.current = '';
    clearMaxTimer();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // already stopped, ignore
      }
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    // interimResults true is fine for engine state; we never commit interims
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang =
      typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      committedRef.current = applySpeechRecognitionEvent(committedRef.current, event);
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
      // long silence. Restart unless the user explicitly stopped — committed
      // text is kept and merged with replacement semantics across restarts.
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

    maxTimerRef.current = setTimeout(() => {
      stop();
    }, maxDurationMs);
  }, [clearMaxTimer, flushResult, maxDurationMs, stop]);

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
