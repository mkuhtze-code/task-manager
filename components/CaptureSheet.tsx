'use client';

/**
 * Capture — pen to paper.
 * Primary path: type (or speak) → Dock.
 * Speech goes through processCaptureSpeech before filling the line.
 * List phrases map onto tasks + subtasks (taskListBridge), not collections tables.
 *
 * Intelligence: tryDock → runCaptureDock → processInteraction (ACT/ANSWER/DEFER/CLARIFY).
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
  type JobLocationResolution,
  type JobLocationCandidate,
} from '@/lib/unifiedInput/resolve';
import { oneShotGate } from '@/lib/unifiedInput/oneShot';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import MicButton from '@/components/MicButton';
import { useCaptureSpeech, textForCaptureField } from '@/hooks/useCaptureSpeech';
import {
  captureIsCollectionMutation,
  detectCaptureCollection,
  type SpeechUnderstandingContext,
} from '@/lib/speech';
import type { CollectionIntent } from '@/lib/collections';
import {
  applyListIntent,
  detectListIntent,
  loadActiveListState,
  canUseActiveList,
  type TaskListOps,
  type ListTaskCandidate,
} from '@/lib/speech/taskListBridge';
import {
  loadActiveRequestLocal,
  type EngineRequest,
  type LearningEvidence,
  type WorkingMemorySnapshot,
} from '@/lib/engine';
import { runCaptureDock, loadPriorForDock } from '@/lib/engine/captureDock';
import { MapPinIcon } from '@/components/icons';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { shouldShowEstimateHint, markEstimateHintSeen } from '@/lib/uxFlags';

/** Optional structured dock from the personal operating engine. */
export type EngineDockOverrides = {
  text: string;
  locationText?: string | null;
  jobId?: string | null;
  surfaceDate?: string | null;
  estimateMins?: number;
  originalInput?: string;
  explanation?: string;
  updateTaskId?: string;
  engineRequest?: EngineRequest;
  evidence?: LearningEvidence[];
  workingMemory?: WorkingMemorySnapshot;
};

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
  userId?: string | null;
  listOps?: TaskListOps | null;
  listTasks?: ListTaskCandidate[];
  addTaskWithOverrides?: (o: EngineDockOverrides) => void;
  remainingMinsToday?: number | null;
  /** Timed meetings / calendar for ANSWER feasibility (id, text, startAt). */
  dockMeetings?: Array<{ id: string; text: string; startAt?: string | null }>;
  /** Route / travel minutes available for capacity reasoning. */
  travelMins?: number | null;
  /** Optional on-site visit duration for feasibility questions. */
  visitDurationMins?: number | null;
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
    userId = null,
    listOps = null,
    listTasks = [],
    addTaskWithOverrides,
    remainingMinsToday = null,
    dockMeetings = [],
    travelMins = null,
    visitDurationMins = null,
  } = props;
