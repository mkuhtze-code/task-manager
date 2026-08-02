'use client';

import { useSpeechToText } from '@/lib/useSpeechToText';

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" fill="currentColor" />
      <path d="M19 11a7 7 0 0 1-14 0M12 18v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

export default function MicButton({
  onResult,
  size = 'default',
}: {
  onResult: (text: string) => void;
  size?: 'default' | 'small';
}) {
  const { isSupported, isListening, start, stop } = useSpeechToText({
    onResult,
    onError: (err) => {
      // Permission-denied is the realistic failure mode here; everything
      // else (no-speech, network) is rare enough not to need its own UI —
      // the button just returns to its idle state either way.
      if (err === 'not-allowed') {
        console.warn('Dokkit: microphone permission was denied.');
      }
    },
  });

  // No SpeechRecognition support (Safari, some embedded webviews) — hide
  // the button entirely rather than show something that won't work.
  if (!isSupported) return null;

  const classes = ['mic-btn', size === 'small' ? 'mic-btn-small' : '', isListening ? 'listening' : '']
    .join(' ')
    .trim();

  return (
    <button
      type="button"
      className={classes}
      onClick={() => (isListening ? stop() : start())}
      aria-label={isListening ? 'Stop dictation' : 'Dictate by voice'}
      aria-pressed={isListening}
    >
      <MicIcon />
      {isListening && <span className="mic-btn-pulse" />}
    </button>
  );
}
