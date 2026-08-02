'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Thin wrapper around the browser's native SpeechRecognition API. Chrome
// (including Chrome for Android) supports this under the webkit-prefixed
// name; there's no official cross-browser standard yet, so isSupported
// gracefully hides the mic button anywhere it's missing (notably Safari)
// rather than showing something broken.

type SpeechToTextHandlers = {
  onResult: (text: string) => void;
  onError?: (error: string) => void;
};

export function useSpeechToText({ onResult, onError }: SpeechToTextHandlers) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

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
      typeof window !== 'undefined' && ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
    setIsSupported(!!SpeechRecognitionCtor);
  }, []);

  const start = useCallback(() => {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // already stopped, ignore
      }
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.lang = typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US';

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) onResultRef.current(transcript.trim());
    };
    recognition.onerror = (event: any) => {
      setIsListening(false);
      // "aborted" fires on a normal manual stop — not a real error, so
      // don't surface it as one.
      if (event?.error && event.error !== 'aborted') {
        onErrorRef.current?.(event.error);
      }
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return { isSupported, isListening, start, stop };
}
