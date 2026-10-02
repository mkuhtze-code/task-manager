import type { SpeechTranscriptionProvider } from '../types';
import { nullTranscriptionProvider } from './nullProvider';
import { webSpeechProvider, isWebSpeechAvailable, recognizeLive } from './webSpeechProvider';

let activeProvider: SpeechTranscriptionProvider = nullTranscriptionProvider;

export function getTranscriptionProvider(): SpeechTranscriptionProvider {
  return activeProvider;
}

export function setTranscriptionProvider(provider: SpeechTranscriptionProvider): void {
  activeProvider = provider;
}

export function resetTranscriptionProvider(): void {
  activeProvider = nullTranscriptionProvider;
}

/**
 * Prefer Web Speech when available in browser; otherwise keep null
 * (queue / fail clearly). Does not invent transcripts.
 */
export function useDefaultBrowserProvider(): SpeechTranscriptionProvider {
  if (isWebSpeechAvailable()) {
    activeProvider = webSpeechProvider;
  } else {
    activeProvider = nullTranscriptionProvider;
  }
  return activeProvider;
}

export { nullTranscriptionProvider, webSpeechProvider, isWebSpeechAvailable, recognizeLive };
export type { SpeechTranscriptionProvider };
