import type { SpeechTranscriptionProvider } from '../types';
import { nullTranscriptionProvider } from './nullProvider';
import { webSpeechProvider, isWebSpeechAvailable, recognizeLive } from './webSpeechProvider';
import {
  createCloudTranscriptionProvider,
  cloudProviderFromEnv,
} from './cloudProvider';
import type { CloudSttConfig } from './cloudProvider';

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
 * Prefer cloud HTTP STT when endpoint configured; else Web Speech in browser;
 * otherwise null (queue / fail clearly). Does not invent transcripts.
 */
export function useDefaultBrowserProvider(): SpeechTranscriptionProvider {
  const cloud = cloudProviderFromEnv();
  if (cloud) {
    activeProvider = cloud;
    return activeProvider;
  }
  if (isWebSpeechAvailable()) {
    activeProvider = webSpeechProvider;
  } else {
    activeProvider = nullTranscriptionProvider;
  }
  return activeProvider;
}

export {
  nullTranscriptionProvider,
  webSpeechProvider,
  isWebSpeechAvailable,
  recognizeLive,
  createCloudTranscriptionProvider,
  cloudProviderFromEnv,
};
export type { SpeechTranscriptionProvider, CloudSttConfig };
