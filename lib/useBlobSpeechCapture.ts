'use client';

/**
 * MediaRecorder-based capture → cloud STT via /api/stt (or configured endpoint).
 * Used when Web Speech is unavailable or cloud is preferred.
 * Does not invent transcripts — empty/failed upstream surfaces as error.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export type BlobSpeechHandlers = {
  onResult: (text: string) => void;
  onError?: (error: string) => void;
  onStatus?: (status: 'idle' | 'recording' | 'transcribing') => void;
  /** STT endpoint. Default: /api/stt */
  endpoint?: string;
  language?: string;
  maxDurationMs?: number;
};

const DEFAULT_MAX_MS = 120_000;

function pickMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return 'audio/webm';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return 'audio/webm';
}

export function isBlobSpeechCaptureAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== 'undefined'
  );
}

export function useBlobSpeechCapture({
  onResult,
  onError,
  onStatus,
  endpoint = '/api/stt',
  language = 'en-NZ',
  maxDurationMs = DEFAULT_MAX_MS,
}: BlobSpeechHandlers) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const onStatusRef = useRef(onStatus);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);
  useEffect(() => {
    onStatusRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    setIsSupported(isBlobSpeechCaptureAvailable());
  }, []);

  const cleanupStream = useCallback(() => {
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  const transcribeBlob = useCallback(
    async (blob: Blob) => {
      onStatusRef.current?.('transcribing');
      let token: string | undefined;
      try {
        const { data } = await supabase.auth.getSession();
        token = data.session?.access_token;
      } catch {
        /* ignore */
      }

      const form = new FormData();
      form.append('audio', blob, 'speech.webm');
      form.append('language', language);

      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: form,
      });

      const body = (await res.json().catch(() => ({}))) as {
        text?: string;
        error?: string;
        not_configured?: boolean;
      };

      if (!res.ok) {
        throw new Error(
          body.error ||
            (body.not_configured
              ? 'Cloud speech is not configured on the server.'
              : `Speech failed (${res.status})`)
        );
      }
      const text = (body.text ?? '').trim();
      if (!text) throw new Error('No speech recognised.');
      onResultRef.current(text);
    },
    [endpoint, language]
  );

  const stop = useCallback(() => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== 'inactive') {
      try {
        rec.stop();
      } catch {
        /* ignore */
      }
    } else {
      setIsListening(false);
      cleanupStream();
      onStatusRef.current?.('idle');
    }
  }, [cleanupStream]);

  const start = useCallback(async () => {
    if (!isBlobSpeechCaptureAvailable()) {
      onErrorRef.current?.('Recording is not supported in this browser.');
      return;
    }

    chunksRef.current = [];
    cleanupStream();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMimeType();
      const recorder = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };

      recorder.onstop = async () => {
        setIsListening(false);
        const parts = chunksRef.current;
        chunksRef.current = [];
        const blob = new Blob(parts, { type: mime });
        cleanupStream();
        if (blob.size < 64) {
          onErrorRef.current?.('Recording was too short.');
          onStatusRef.current?.('idle');
          return;
        }
        try {
          await transcribeBlob(blob);
        } catch (err) {
          onErrorRef.current?.(
            err instanceof Error ? err.message : 'Could not transcribe speech.'
          );
        } finally {
          onStatusRef.current?.('idle');
        }
      };

      recorder.start(250);
      setIsListening(true);
      onStatusRef.current?.('recording');
      maxTimerRef.current = setTimeout(() => stop(), maxDurationMs);
    } catch (err) {
      cleanupStream();
      setIsListening(false);
      onStatusRef.current?.('idle');
      const msg = err instanceof Error ? err.message : String(err);
      if (/Permission|NotAllowed|denied/i.test(msg)) {
        onErrorRef.current?.('not-allowed');
      } else {
        onErrorRef.current?.(msg);
      }
    }
  }, [cleanupStream, maxDurationMs, stop, transcribeBlob]);

  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* ignore */
      }
      cleanupStream();
    };
  }, [cleanupStream]);

  return { isSupported, isListening, start, stop };
}
