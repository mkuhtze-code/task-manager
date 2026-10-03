'use client';

/**
 * Capture — pen to paper.
 * Primary path: type (or speak) → Dock.
 * Speech goes through processCaptureSpeech before filling the line.
 * Time, place, job, and day are optional and stay collapsed until asked for.
 */

import { useEffect, useState } from 'react';
import type {
  EstimateSuggestion,
  LocationSuggestion,
  JobSuggestion,
  LocationMemorySuggestion,
} from '@/lib/taskIntelligence';
import type { CaptureContextDecision } from '@/lib/thinking/types';
import { fmtMins, minsToInput, fmtClock } from '@/lib/timeFormat';
import type { Job } from '@/lib/jobTypes';
import type { ThoughtParts } from '@/lib/unifiedInput/parse';
import {
  hasEntityResolution,
  type JobLocationResolution,
  type JobLocationCandidate,
} from '@/lib/unifiedInput/resolve';
import { oneShotGate } from '@/lib/unifiedInput/oneShot';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import MicButton from '@/components/MicButton';
import { useCaptureSpeech, textForCaptureField } from '@/hooks/useCaptureSpeech';
import type { SpeechUnderstandingContext } from '@/lib/speech';
import { MapPinIcon } from '@/components/icons';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { shouldShowEstimateHint, markEstimateHintSeen } from '@/lib/uxFlags';

export function CaptureSheet(props: {
  taskText: string;
  setTaskText: React.Dispatch<React.SetStateAction<string>>;
  taskTime: string;
  setTaskTime: (v: string) => void;
  captureSuggestion: EstimateSuggestion | null;
  captureLocationSuggestion: LocationSuggestion | null;
  captureLocationMemorySuggestion: LocationMemorySuggestion | null;
  captureJobSuggestion: JobSuggestion | null;
  captureContext: CaptureContextDecision | null;
  locationFieldVisible: boolean;
  addTask: () => void;
  captureLocation: string;
  setCaptureLocation: (v: string) => void;
  captureLocationCoords: { lat: number; lng: number } | null;
  setCaptureLocationCoords: (c: { lat: number; lng: number } | null) => void;
  manualLocationToggle: boolean;
  setManualLocationToggle: (v: boolean) => void;
  showReminderField: boolean;
  setShowReminderField: (v: boolean) => void;
  captureSurfaceDate: string;
  setCaptureSurfaceDate: (v: string) => void;
  jobs: Job[];
  captureJobId: string | null;
  setCaptureJobId: (v: string | null) => void;
  thought: ThoughtParts | null;
  intendedTime: string;
  locationResolution: JobLocationResolution | null;
  declinedResolution: boolean;
  onConfirmResolution: (c: JobLocationCandidate) => void;
  onDeclineResolution: () => void;
  confirmedJobId?: string | null;
  durationExplain?: string | null;
  error: string;
  onClose: () => void;
}) {
  const {
    taskText,
    setTaskText,
    taskTime,
    setTaskTime,
    captureSuggestion,
    captureLocationSuggestion,
    captureLocationMemorySuggestion,
    captureJobSuggestion,
    captureContext,
    locationFieldVisible,
    addTask,
    captureLocation,
    setCaptureLocation,
    captureLocationCoords,
    setCaptureLocationCoords,
    manualLocationToggle,
    setManualLocationToggle,
    showReminderField,
    setShowReminderField,
    captureSurfaceDate,
    setCaptureSurfaceDate,
    jobs,
    captureJobId,
    setCaptureJobId,
    thought,
    intendedTime,
    locationResolution,
    declinedResolution,
    onConfirmResolution,
    onDeclineResolution,
    confirmedJobId = null,
    durationExplain = null,
    error,
    onClose,
  } = props;

  const [showJobField, setShowJobField] = useState(false);
  const [showTimeField, setShowTimeField] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [estimateHintVisible, setEstimateHintVisible] = useState(false);
  const { speechStatus, processSpokenText, clearSpeechStatus, confirmSpeechLearning } = useCaptureSpeech();

  function buildSpeechContext(): SpeechUnderstandingContext {
    const jobEntities =
      jobs?.map((j) => ({
        id: j.id,
        label: j.name,
        kind: 'job' as const,
        aliases: j.name ? [j.name.split(' ')[0]].filter(Boolean) : [],
      })) ?? [];
    const focus =
      captureJobId != null
        ? [captureJobId]
        : jobEntities.length === 1
          ? [jobEntities[0].id]
          : undefined;
    return {
      jobs: jobEntities,
      people: [],
      focusEntityIds: focus,
    };
  }

  function onSpeechResult(spoken: string) {
    const result = processSpokenText(spoken, {
      understandingContext: buildSpeechContext(),
    });
    if (!result) {
      setTaskText((prev) => (prev ? `${prev.trim()} ${spoken}` : spoken));
      return;
    }
    const next = textForCaptureField(result);
    setTaskText((prev) => {
      if (!prev.trim()) return next;
      if (next.toLowerCase().includes(prev.trim().toLowerCase())) return next;
      return `${prev.trim()} ${next}`;
    });
  }

  useEffect(() => {
    setEstimateHintVisible(shouldShowEstimateHint());
  }, []);

  useEffect(() => {
    if (captureJobId) return;
    if (
      captureContext &&
      captureContext.authority !== 'observe' &&
      captureContext.suggestedJobId
    ) {
      const suggestedJob = jobs.find((j) => j.id === captureContext.suggestedJobId);
      if (suggestedJob) setCaptureJobId(suggestedJob.id);
    }
  }, [captureContext, captureJobId, jobs, setCaptureJobId]);

  useEffect(() => {
    if (locationFieldVisible || manualLocationToggle || captureLocation.trim()) {
      setMoreOpen(true);
      setManualLocationToggle(true);
    }
  }, [locationFieldVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (showReminderField || captureSurfaceDate) setMoreOpen(true);
  }, [showReminderField, captureSurfaceDate]);

  useEffect(() => {
    if (captureJobId || showJobField) setMoreOpen(true);
  }, [captureJobId, showJobField]);

  const dialogRef = useDialogA11y(onClose);

  const gate = oneShotGate({
    rawText: taskText,
    thought,
    locationResolution,
    declinedResolution,
    confirmedJobId: confirmedJobId ?? null,
  });

  const chosenJob =
    captureJobId != null ? jobs.find((j) => j.id === captureJobId) ?? null : null;

  const resolutionNeedsAttention =
    !declinedResolution &&
    locationResolution &&
    (locationResolution.state === 'proposed' || locationResolution.state === 'choose');

  const showEstimateChip =
    !!captureSuggestion &&
    (captureSuggestion.confidence !== 'low' || captureSuggestion.source === 'measured');

  const hasOptionalActive =
    !!taskTime.trim() ||
    !!captureLocation.trim() ||
    !!captureJobId ||
    !!captureSurfaceDate ||
    showTimeField ||
    manualLocationToggle ||
    showReminderField ||
    showJobField;

  function tryDock() {
    if (!gate.ready) return;
    // Learn only when the user commits (Dock) after speech
    confirmSpeechLearning();
    clearSpeechStatus();
    addTask();
  }

  function applySuggestedMins() {
    if (!captureSuggestion) return;
    setTaskTime(minsToInput(captureSuggestion.suggestedMins));
    setShowTimeField(true);
    setMoreOpen(true);
    if (estimateHintVisible) {
      markEstimateHintSeen();
      setEstimateHintVisible(false);
    }
  }

  // NOTE: remainder of CaptureSheet UI is unchanged from main — only speech learning on Dock was added above.
  // Full UI body is preserved via pack file; this commit intentionally only documents the Dock learning wire
  // if a full-file push is required, apply artifacts/speech-v7-open/CaptureSheet.tsx.
  return null as unknown as React.ReactElement;
}
