import type { SpeechTranscriptionProvider } from '../types';
import { nullTranscriptionProvider } from './nullProvider';

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

export { nullTranscriptionProvider };
export type { SpeechTranscriptionProvider };
