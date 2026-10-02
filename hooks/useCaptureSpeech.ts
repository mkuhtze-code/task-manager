'use client';

/**
 * Capture speech intelligence — STT text → processCaptureSpeech.
 * Does not open the mic; pairs with MicButton / useSpeechToText.
 */

import { useCallback, useState } from 'react';
import {
  processCaptureSpeech,
  type CaptureSpeechResult,
  type ProcessCaptureSpeechInput,
} from '@/lib/speech';

export type CaptureSpeechStatus = {
  result: CaptureSpeechResult;
  message: string;
  tone: 'neutral' | 'safe' | 'ask' | 'propose';
} | null;

function messageFor(r: CaptureSpeechResult): {
  message: string;
  tone: 'neutral' | 'safe' | 'ask' | 'propose';
} {
  switch (r.uiMode) {
    case 'auto_safe_noop':
    case 'silent':
      if (r.mustNotCreateTask) {
        return {
          message: 'Understood — not treating that as a new task.',
          tone: 'safe',
        };
      }
      return { message: '', tone: 'neutral' };
    case 'show_observation':
      return { message: 'Noted as an observation.', tone: 'neutral' };
    case 'ask_clarification':
      return {
        message: 'Needs a bit more detail before Dock can use it.',
        tone: 'ask',
      };
    case 'confirm_update':
      return {
        message: r.surfaceSummary
          ? `Update existing: ${r.surfaceSummary}`
          : 'Looks like an update to something you already have.',
        tone: 'propose',
      };
    case 'confirm_proposals':
      if (r.proposals.length > 1) {
        return {
          message: `${r.proposals.length} actions detected — review before Dock.`,
          tone: 'propose',
        };
      }
      return {
        message: r.surfaceSummary ? `Heard: ${r.surfaceSummary}` : 'Ready to Dock when you are.',
        tone: 'propose',
      };
    default:
      return { message: '', tone: 'neutral' };
  }
}

/** Prefer proposal/surface text for the field; never discard raw on result. */
export function textForCaptureField(r: CaptureSpeechResult): string {
  if (r.mustNotCreateTask && (r.uiMode === 'auto_safe_noop' || r.uiMode === 'silent')) {
    return r.normalisedText || r.rawText;
  }
  if (r.proposals.length === 1 && r.proposals[0].summary) {
    return r.proposals[0].summary;
  }
  if (r.surfaceSummary && r.outcome !== 'DO_NOT_CREATE') {
    return r.surfaceSummary;
  }
  return r.normalisedText || r.rawText;
}

export function useCaptureSpeech() {
  const [speechStatus, setSpeechStatus] = useState<CaptureSpeechStatus>(null);

  const processSpokenText = useCallback(
    (text: string, opts?: Omit<ProcessCaptureSpeechInput, 'text'>) => {
      const trimmed = text.trim();
      if (!trimmed) return null;
      const result = processCaptureSpeech({ text: trimmed, ...opts });
      const { message, tone } = messageFor(result);
      setSpeechStatus({ result, message, tone });
      return result;
    },
    []
  );

  const clearSpeechStatus = useCallback(() => setSpeechStatus(null), []);

  return {
    speechStatus,
    processSpokenText,
    clearSpeechStatus,
    textForCaptureField,
  };
}
