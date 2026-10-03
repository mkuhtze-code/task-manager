/**
 * Client-side persistence for PersonalLanguageModel.
 * localStorage only — no server round-trip in this phase.
 */

import type { PersonalLanguageModel } from './types';
import { emptyPersonalLanguageModel } from './types';

const KEY_PREFIX = 'dokkit:speechLanguageModel:';

function storageKey(userId: string): string {
  return `\( {KEY_PREFIX} \){userId || 'anon'}`;
}

export function loadSpeechLanguageModel(userId: string): PersonalLanguageModel {
  if (typeof window === 'undefined' || !window.localStorage) {
    return emptyPersonalLanguageModel(userId || 'anon');
  }
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return emptyPersonalLanguageModel(userId || 'anon');
    const parsed = JSON.parse(raw) as PersonalLanguageModel;
    if (!parsed || typeof parsed !== 'object' || !parsed.userId) {
      return emptyPersonalLanguageModel(userId || 'anon');
    }
    return {
      ...emptyPersonalLanguageModel(userId || 'anon'),
      ...parsed,
      userId: userId || parsed.userId || 'anon',
    };
  } catch {
    return emptyPersonalLanguageModel(userId || 'anon');
  }
}

export function saveSpeechLanguageModel(model: PersonalLanguageModel): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(storageKey(model.userId || 'anon'), JSON.stringify(model));
  } catch {
    // Quota / private mode — learning is best-effort
  }
}

export function clearSpeechLanguageModel(userId: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    /* ignore */
  }
}