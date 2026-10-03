'use client';

/**
 * Capture speech intelligence — STT text → processCaptureSpeech.
 * Does not open the mic; pairs with MicButton / useSpeechToText.
 * On Dock after speech: confirmCaptureSpeech → personal language model (localStorage).
 */

import { useCallback, useRef, useState } from 'react';
import {
  processCaptureSpeech,
  confirmCaptureSpeech,
  rejectOrCorrectCaptureSpeech,
  type CaptureSpeechResult,
  type ProcessCaptureSpeechInput,
  type PersonalLanguageModel,
  emptyPersonalLanguageModel,
} from '@/lib/speech';
import {
  loadSpeechLanguageModel,
  saveSpeechLanguageModel,
} from '@/lib/speech/speechModelStore';
import {
  defaultPersonalCommunicationProfile,
  type PersonalCommunicationProfile,
} from '@/lib/communication/types';

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

export type UseCaptureSpeechOptions = {
  userId?: string | null;
};

export function useCaptureSpeech(options?: UseCaptureSpeechOptions) {
  const userId = options?.userId ?? 'anon';
  const [speechStatus, setSpeechStatus] = useState<CaptureSpeechStatus>(null);
  const lastResultRef = useRef<CaptureSpeechResult | null>(null);
  const modelRef = useRef<PersonalLanguageModel | null>(null);

  const getModel = useCallback((): PersonalLanguageModel => {
    if (!modelRef.current) {
      modelRef.current = loadSpeechLanguageModel(userId);
    }
    return modelRef.current;
  }, [userId]);

  const processSpokenText = useCallback(
    (text: string, opts?: Omit<ProcessCaptureSpeechInput, 'text'>) => {
      const trimmed = text.trim();
      if (!trimmed) return null;
      const languageModel = getModel();
      const result = processCaptureSpeech({
        text: trimmed,
        languageModel,
        ...opts,
      });
      const { message, tone } = messageFor(result);
      lastResultRef.current = result;
      setSpeechStatus({ result, message, tone });
      return result;
    },
    [getModel]
  );

  /**
   * Call when the user Docks / saves after speech.
   * Learns from confirmed interpretation only — never from a rejected guess alone.
   */
  const confirmSpeechLearning = useCallback(() => {
    const result = lastResultRef.current;
    if (!result) return null;
    if (result.mustNotCreateTask && result.outcome === 'DO_NOT_CREATE') {
      lastResultRef.current = null;
      return null;
    }
    const model = getModel();
    const { model: next, event } = confirmCaptureSpeech(model, result);
    modelRef.current = next;
    saveSpeechLanguageModel(next);
    lastResultRef.current = null;
    return event;
  }, [getModel]);

  const correctSpeechLearning = useCallback(
    (correctedSummary: string) => {
      const result = lastResultRef.current;
      if (!result) return null;
      const model = getModel();
      const profile: PersonalCommunicationProfile =
        defaultPersonalCommunicationProfile(userId);
      const { model: next, event } = rejectOrCorrectCaptureSpeech(model, profile, {
        result,
        correctedSummary,
      });
      modelRef.current = next;
      saveSpeechLanguageModel(next);
      lastResultRef.current = null;
      return event;
    },
    [getModel, userId]
  );

  const clearSpeechStatus = useCallback(() => setSpeechStatus(null), []);

  return {
    speechStatus,
    processSpokenText,
    clearSpeechStatus,
    confirmSpeechLearning,
    correctSpeechLearning,
    textForCaptureField,
  };
}