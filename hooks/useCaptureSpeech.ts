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
  captureIsCollectionMutation,
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
import { normaliseSpeech } from '@/lib/speech/normalise';

export type CaptureSpeechStatus = {
  result: CaptureSpeechResult;
  message: string;
  tone: 'neutral' | 'safe' | 'ask' | 'propose';
} | null;

function messageFor(r: CaptureSpeechResult): {
  message: string;
  tone: 'neutral' | 'safe' | 'ask' | 'propose';
} {
  if (r.uiMode === 'confirm_collection' && r.collection) {
    return {
      message: r.surfaceSummary || r.collection.surfaceMessage,
      tone: 'propose',
    };
  }
  if (r.uiMode === 'collection_clarification' && r.collection) {
    return {
      message: r.collection.surfaceMessage,
      tone: 'ask',
    };
  }

  switch (r.uiMode) {
    case 'auto_safe_noop':
    case 'silent':
      if (r.mustNotCreateTask && !r.collection) {
        return {
          message: 'Understood — not treating that as a new task.',
          tone: 'safe',
        };
      }
      return { message: '', tone: 'neutral' };
    case 'show_observation':
      if (r.collection?.intent.type === 'query_collection') {
        return {
          message: r.surfaceSummary || 'Looking up that list.',
          tone: 'neutral',
        };
      }
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

/**
 * The capture line is the source of truth for Dock. Proposal summaries and
 * surface summaries are presentation copy; they can omit role information
 * (recipient, purpose, destination, date/time) needed by the engine.
 *
 * Keep collection mutations on their dedicated path, but otherwise pass the
 * complete repaired/normalised utterance into the capture field so the engine
 * can interpret the original request rather than a lossy summary.
 */
export function textForCaptureField(r: CaptureSpeechResult): string {
  if (captureIsCollectionMutation(r) && r.collection) {
    const items = r.collection.previewItems;
    if (items.length > 0) return items.join(', ');
    return r.normalisedText || r.rawText || r.surfaceSummary;
  }

  // Dock needs the complete repaired utterance, not a lossy semantic summary.
  // Prefer the pre-normalisation transcript: the normaliser/interpretation path
  // can currently drop leading delivery verbs or clause context in edge cases.
  // Remove spoken hesitation fillers and the separator around them without
  // altering ordinary commas between list items.
  const source = r.rawText || r.normalisedText || r.surfaceSummary;
  // Re-normalise the complete source transcript rather than using the interpreted
  // summary. This preserves leading verbs/context and applies number expansion.
  const sourceNormalised = normaliseSpeech(source).normalisedText || source;
  const cleaned = sourceNormalised
    .replace(/\b(to|and|but|so|then)[,;:]\s*(?=(?:um+|uh+|erm+|er+)\b)\s*(?:um+|uh+|erm+|er+)\b[,;:]?\s*/gi, '$1 ')
    .replace(/\b(?:um+|uh+|erm+|er+)\b[,;:]?/gi, '')
    .replace(/\s+([,;:])/g, '$1')
    .replace(/[,;:]\s+(?=[,;:])/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || sourceNormalised || source;
}

export type UseCaptureSpeechOptions = {
  userId?: string | null;
};

export function useCaptureSpeech(options?: UseCaptureSpeechOptions) {
  const userId = (options?.userId && options.userId.trim()) || 'anon';
  const [speechStatus, setSpeechStatus] = useState<CaptureSpeechStatus>(null);
  const lastResultRef = useRef<CaptureSpeechResult | null>(null);
  const modelRef = useRef<PersonalLanguageModel | null>(null);
  const loadedForUserRef = useRef<string | null>(null);

  const getModel = useCallback((): PersonalLanguageModel => {
    if (!modelRef.current || loadedForUserRef.current !== userId) {
      modelRef.current = loadSpeechLanguageModel(userId);
      loadedForUserRef.current = userId;
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
        userId,
        ...opts,
      });
      const { message, tone } = messageFor(result);
      lastResultRef.current = result;
      setSpeechStatus({ result, message, tone });
      return result;
    },
    [getModel, userId]
  );

  /**
   * Call when the user Docks / saves after speech.
   * Learns from confirmed interpretation only — never from a rejected guess alone.
   * Collection mutations still require UI to call applyCollectionIntent.
   */
  const confirmSpeechLearning = useCallback(() => {
    const result = lastResultRef.current;
    if (!result) return null;
    // Safe noops (non-collection) skip learning
    if (
      result.mustNotCreateTask &&
      result.outcome === 'DO_NOT_CREATE' &&
      !result.collection
    ) {
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
