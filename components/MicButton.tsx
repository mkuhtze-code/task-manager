'use client';

import { useMemo, useState } from 'react';
import { useSpeechToText } from '@/lib/useSpeechToText';
import {
  isBlobSpeechCaptureAvailable,
  useBlobSpeechCapture,
} from '@/lib/useBlobSpeechCapture';
import { isWebSpeechAvailable } from '@/lib/speech';

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" fill="currentColor" />
      <path d="M19 11a7 7 0 0 1-14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function preferCloudBlob(): boolean {
  if (typeof process === 'undefined') return false;
  const flag = process.env.NEXT_PUBLIC_DOKKIT_STT_PREFER_CLOUD;
  if (flag === '1' || flag === 'true') return true;
  const endpoint = process.env.NEXT_PUBLIC_DOKKIT_STT_ENDPOINT;
  return !!endpoint && endpoint.trim().length > 0;
}

/**
 * Mic for Capture.
 * - Default: Web Speech live recognition (fast, free).
 * - Fallback / preferred cloud: MediaRecorder → POST /api/stt (or configured endpoint).
 */
export default function MicButton({
  onResult,
  size = 'default',
}: {
  onResult: (text: string) => void;
  size?: 'default' | 'small';
}) {
  const [modeError, setModeError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'recording' | 'transcribing'>('idle');

  const useCloud = useMemo(() => {
    if (preferCloudBlob() && isBlobSpeechCaptureAvailable()) return true;
    if (!isWebSpeechAvailable() && isBlobSpeechCaptureAvailable()) return true;
    return false;
  }, []);

  const web = useSpeechToText({
    onResult,
    onError: (err) => {
      if (err === 'not-allowed') {
        console.warn('Dokkit: microphone permission was denied.');
      }
      setModeError(err);
    },
  });

  const blob = useBlobSpeechCapture({
    onResult,
    onError: (err) => {
      if (err === 'not-allowed') {
        console.warn('Dokkit: microphone permission was denied.');
      }
      setModeError(err);
    },
    onStatus: setStatus,
    endpoint:
      (typeof process !== 'undefined' &&
        process.env.NEXT_PUBLIC_DOKKIT_STT_ENDPOINT?.trim()) ||
      '/api/stt',
  });

  const isSupported = useCloud ? blob.isSupported : web.isSupported || blob.isSupported;
  const isListening = useCloud
    ? blob.isListening || status === 'transcribing'
    : web.isListening;
  const start = useCloud ? blob.start : web.isSupported ? web.start : blob.start;
  const stop = useCloud ? blob.stop : web.isSupported ? web.stop : blob.stop;

  if (!isSupported) return null;

  const classes = [
    'mic-btn',
    size === 'small' ? 'mic-btn-small' : '',
    isListening ? 'listening' : '',
    status === 'transcribing' ? 'transcribing' : '',
  ]
    .join(' ')
    .trim();

  const label =
    status === 'transcribing'
      ? 'Transcribing…'
      : isListening
        ? 'Stop dictation'
        : 'Dictate by voice';

  return (
    <button
      type="button"
      className={classes}
      onClick={() => (isListening ? stop() : start())}
      aria-label={label}
      aria-pressed={isListening}
      title={modeError || label}
      disabled={status === 'transcribing'}
    >
      <MicIcon />
      {isListening && status !== 'transcribing' && <span className="mic-btn-pulse" />}
    </button>
  );
}
