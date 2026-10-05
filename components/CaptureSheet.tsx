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
  } = props;

  const [showJobField, setShowJobField] = useState(false);
  const [showTimeField, setShowTimeField] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [estimateHintVisible, setEstimateHintVisible] = useState(false);
  const [collectionFeedback, setCollectionFeedback] = useState<string | null>(null);
  const [listBusy, setListBusy] = useState(false);
  const [pendingClarification, setPendingClarification] = useState<{
    spoken: string;
    candidates: Array<{ taskId: string; title: string; reason: string }>;
    pendingIntent: Exclude<CollectionIntent, { type: 'clarification_required' }> | null;
  } | null>(null);
  const [enginePriorRequest, setEnginePriorRequest] = useState<EngineRequest | null>(() =>
    loadActiveRequestLocal(userId)
  );
  const [engineExplain, setEngineExplain] = useState<string | null>(null);
  const { speechStatus, processSpokenText, clearSpeechStatus, confirmSpeechLearning } = useCaptureSpeech({
    userId,
  });

  useEffect(() => {
    const prior = loadActiveRequestLocal(userId);
    if (prior) setEnginePriorRequest(prior);
  }, [userId]);

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
    return { jobs: jobEntities, people: [], focusEntityIds: focus };
  }

  function buildCollectionContext() {
    const active = loadActiveListState();
    const eligible = canUseActiveList(active);
    return {
      activeCollectionId: eligible ? active.taskId : null,
      activeCollectionTitle: eligible ? active.title : null,
      collections: (listTasks ?? []).map((t) => ({
        id: t.id,
        userId: userId ?? '',
        title: t.text,
        normalizedTitle: t.text.toLowerCase(),
        collectionType: 'generic' as const,
        status: 'open' as const,
        contextType: null as null,
        contextId: null as null,
        aliases: [] as string[],
        isActive: active.taskId === t.id,
        createdAt: '',
        updatedAt: '',
        lastActivityAt: '',
        closedAt: null as null,
      })),
      jobs: (jobs ?? []).map((j) => ({ id: j.id, name: j.name })),
      msSinceLastActivity: active.lastInteractionAt
        ? Date.now() - Date.parse(active.lastInteractionAt)
        : null,
    };
  }

  function onSpeechResult(spoken: string) {
    const uid = userId ?? 'anon';
    const result = processSpokenText(spoken, {
      understandingContext: buildSpeechContext(),
      userId: uid,
      collectionContext: buildCollectionContext(),
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
    if (captureContext && captureContext.authority !== 'observe' && captureContext.suggestedJobId) {
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

  const chosenJob = captureJobId != null ? jobs.find((j) => j.id === captureJobId) ?? null : null;

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

  const liveListIntent = (() => {
    const line = taskText.trim();
    if (!line) return null;
    const ctx = buildCollectionContext();
    const detected = detectCaptureCollection(line, ctx);
    const fallback = detectListIntent(line, listTasks);
    return detected?.intent ?? fallback;
  })();

  const isLiveListIntent =
    !!liveListIntent &&
    (liveListIntent.type === 'create_collection' ||
      liveListIntent.type === 'append_collection' ||
      liveListIntent.type === 'complete_collection_items' ||
      liveListIntent.type === 'remove_collection_items' ||
      liveListIntent.type === 'update_collection_item' ||
      liveListIntent.type === 'close_collection' ||
      liveListIntent.type === 'reopen_collection' ||
      liveListIntent.type === 'query_collection' ||
      liveListIntent.type === 'clarification_required');

  const collectionDockReady =
    isLiveListIntent ||
    (!!speechStatus?.result &&
      !!speechStatus.result.collection &&
      (captureIsCollectionMutation(speechStatus.result) ||
        speechStatus.result.uiMode === 'collection_clarification'));

  const resolutionBlocksDock = resolutionNeedsAttention && !isLiveListIntent;

  async function applyListDock(intent: CollectionIntent) {
    if (!listOps) {
      setCollectionFeedback('List actions need an active session.');
      return;
    }
    if (intent.type === 'clarification_required') {
      setPendingClarification({
        spoken: intent.spoken,
        candidates: intent.candidates.map((c) => ({
          taskId: c.collectionId,
          title: c.title,
          reason: c.reason,
        })),
        pendingIntent: intent.pendingIntent,
      });
      setCollectionFeedback(null);
      return;
    }
    setListBusy(true);
    try {
      const applied = await applyListIntent(intent, listOps);
      confirmSpeechLearning();
      clearSpeechStatus();
      setPendingClarification(null);
      if (applied.needsClarification) {
        setPendingClarification(applied.needsClarification);
        setCollectionFeedback(applied.message);
      } else {
        setCollectionFeedback(applied.message || (applied.ok ? 'List updated.' : 'Could not update list.'));
        setTaskText('');
        if (applied.openTaskId) onClose();
      }
    } finally {
      setListBusy(false);
    }
  }

  function resolveClarification(taskId: string) {
    if (!pendingClarification?.pendingIntent) {
      setPendingClarification(null);
      return;
    }
    const pending = pendingClarification.pendingIntent;
    let next: CollectionIntent = pending;
    if ('target' in pending) {
      next = { ...pending, target: { kind: 'id', collectionId: taskId } } as CollectionIntent;
    }
    void applyListDock(next);
  }

  function tryDock() {
    const speechResult = speechStatus?.result ?? null;
    let collectionIntent = speechResult?.collection?.intent ?? null;

    if (taskText.trim()) {
      const ctx = buildCollectionContext();
      const detected = detectCaptureCollection(taskText.trim(), ctx);
      const fallback = detectListIntent(taskText.trim(), listTasks);
      const intent = detected?.intent ?? fallback;
      if (intent) collectionIntent = intent;
    }

    const isListIntent =
      !!collectionIntent &&
      (collectionIntent.type === 'create_collection' ||
        collectionIntent.type === 'append_collection' ||
        collectionIntent.type === 'complete_collection_items' ||
        collectionIntent.type === 'remove_collection_items' ||
        collectionIntent.type === 'update_collection_item' ||
        collectionIntent.type === 'close_collection' ||
        collectionIntent.type === 'reopen_collection' ||
        collectionIntent.type === 'query_collection' ||
        collectionIntent.type === 'clarification_required');

    if (isListIntent && collectionIntent) {
      if (!listOps) {
        setCollectionFeedback('Sign in to use lists.');
        return;
      }
      void applyListDock(collectionIntent);
      return;
    }

    const line = taskText.trim();
    if (line && addTaskWithOverrides) {
      try {
        const prior = loadPriorForDock(userId) ?? enginePriorRequest ?? null;
        const dock = runCaptureDock({
          line,
          userId: userId ?? null,
          priorRequest: prior,
          jobs: jobs.map((j) => ({
            id: j.id,
            name: j.name,
            locationText: j.location_text ?? null,
          })),
          captureJobId,
          captureSurfaceDate,
          remainingMinsToday,
          openTaskCount: listTasks.length,
          inputType: speechStatus?.result ? 'speech_transcript' : 'text',
        });

        if (dock.request) setEnginePriorRequest(dock.request);

        if (dock.kind === 'act_create' || dock.kind === 'act_update') {
          setEngineExplain(dock.message);
          setCollectionFeedback(dock.message);
          confirmSpeechLearning();
          clearSpeechStatus();
          addTaskWithOverrides(dock.overrides);
          return;
        }

        if (dock.kind === 'answer') {
          setEngineExplain(dock.message);
          setCollectionFeedback(dock.message);
          return;
        }

        if (dock.kind === 'defer') {
          setEngineExplain(dock.message);
          setCollectionFeedback(dock.message);
          confirmSpeechLearning();
          clearSpeechStatus();
          if (dock.clearLine) setTaskText('');
          return;
        }

        if (dock.kind === 'clarify') {
          setEngineExplain(dock.message);
          setCollectionFeedback(dock.message);
          return;
        }

        if (dock.kind === 'fallthrough' && dock.message) {
          setEngineExplain(dock.message);
          setCollectionFeedback(dock.message);
        }
      } catch (err) {
        console.error('processInteraction dock', err);
      }
    }

    if (!gate.ready) return;

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

  function applySuggestedLocation() {
    if (captureLocationSuggestion?.location?.text) {
      setCaptureLocation(captureLocationSuggestion.location.text);
      setCaptureLocationCoords({
        lat: captureLocationSuggestion.location.lat,
        lng: captureLocationSuggestion.location.lng,
      });
      setManualLocationToggle(true);
      setMoreOpen(true);
    } else if (captureLocationMemorySuggestion?.locationText) {
      setCaptureLocation(captureLocationMemorySuggestion.locationText);
      setCaptureLocationCoords({
        lat: captureLocationMemorySuggestion.lat,
        lng: captureLocationMemorySuggestion.lng,
      });
      setManualLocationToggle(true);
      setMoreOpen(true);
    }
  }

  function applySuggestedJob() {
    if (captureJobSuggestion?.jobId) {
      setCaptureJobId(captureJobSuggestion.jobId);
      setShowJobField(true);
      setMoreOpen(true);
    }
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        className="sheet-panel capture-sheet capture-sheet-paper"
        role="dialog"
        aria-modal="true"
        aria-label="Capture"
        ref={dialogRef as React.RefObject<HTMLDivElement>}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="capture-sheet-header">
          <h2 className="capture-sheet-title">Capture</h2>
          <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {error ? <p className="capture-error">{error}</p> : null}
        {collectionFeedback ? <p className="capture-feedback">{collectionFeedback}</p> : null}
        {engineExplain ? <p className="capture-engine-explain">{engineExplain}</p> : null}

        <div className="capture-main">
          <textarea
            className="capture-input"
            value={taskText}
            onChange={(e) => setTaskText(e.target.value)}
            placeholder="What needs doing?"
            rows={3}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                tryDock();
              }
            }}
          />
          <div className="capture-mic-row">
            <MicButton onResult={onSpeechResult} />
          </div>
        </div>

        {resolutionNeedsAttention && locationResolution ? (
          <div className="capture-resolution">
            <p className="text-sm">Link to a place or job?</p>
            {locationResolution.candidates?.map((c: JobLocationCandidate) => (
              <button
                key={c.jobId}
                type="button"
                className="capture-resolution-option"
                onClick={() => onConfirmResolution(c)}
              >
                {c.jobName}
                {c.locationText ? ` · ${c.locationText}` : ''}
              </button>
            ))}
            <button type="button" className="text-sm underline" onClick={onDeclineResolution}>
              Not now
            </button>
          </div>
        ) : null}

        {pendingClarification ? (
          <div className="capture-clarification">
            <p className="text-sm">Which list?</p>
            {pendingClarification.candidates.map((c) => (
              <button
                key={c.taskId}
                type="button"
                className="capture-clarification-option"
                onClick={() => resolveClarification(c.taskId)}
              >
                {c.title}
              </button>
            ))}
          </div>
        ) : null}

        <div className="capture-chips">
          {showEstimateChip && captureSuggestion ? (
            <button type="button" className="capture-chip" onClick={applySuggestedMins}>
              ~{fmtMins(captureSuggestion.suggestedMins)}
            </button>
          ) : null}
          {captureLocationSuggestion || captureLocationMemorySuggestion ? (
            <button type="button" className="capture-chip" onClick={applySuggestedLocation}>
              <MapPinIcon /> Place
            </button>
          ) : null}
          {captureJobSuggestion ? (
            <button type="button" className="capture-chip" onClick={applySuggestedJob}>
              Job
            </button>
          ) : null}
          {durationExplain ? <span className="capture-duration-explain">{durationExplain}</span> : null}
        </div>

        <button
          type="button"
          className="capture-more-toggle"
          onClick={() => setMoreOpen((v) => !v)}
        >
          {moreOpen || hasOptionalActive ? 'Less' : 'More'}
        </button>

        {(moreOpen || hasOptionalActive) && (
          <div className="capture-optional">
            {(showTimeField || taskTime) && (
              <label className="capture-field">
                <span>Estimate</span>
                <input
                  type="text"
                  value={taskTime}
                  onChange={(e) => setTaskTime(e.target.value)}
                  placeholder="e.g. 30m"
                />
              </label>
            )}
            {!showTimeField && !taskTime && (
              <button type="button" className="text-sm underline" onClick={() => setShowTimeField(true)}>
                Add time
              </button>
            )}

            {(manualLocationToggle || captureLocation) && (
              <label className="capture-field">
                <span>Location</span>
                <LocationAutocomplete
                  value={captureLocation}
                  onChange={setCaptureLocation}
                  onPlaceSelected={(result) => {
                    setCaptureLocation(result.formattedAddress);
                    setCaptureLocationCoords({ lat: result.lat, lng: result.lng });
                  }}
                />
              </label>
            )}
            {!manualLocationToggle && !captureLocation && (
              <button
                type="button"
                className="text-sm underline"
                onClick={() => {
                  setManualLocationToggle(true);
                  setMoreOpen(true);
                }}
              >
                Add location
              </button>
            )}

            {(showJobField || captureJobId) && (
              <label className="capture-field">
                <span>Job</span>
                <select
                  value={captureJobId ?? ''}
                  onChange={(e) => setCaptureJobId(e.target.value || null)}
                >
                  <option value="">None</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {!showJobField && !captureJobId && (
              <button type="button" className="text-sm underline" onClick={() => setShowJobField(true)}>
                Add job
              </button>
            )}

            {(showReminderField || captureSurfaceDate) && (
              <label className="capture-field">
                <span>Surface date</span>
                <input
                  type="date"
                  value={captureSurfaceDate}
                  onChange={(e) => setCaptureSurfaceDate(e.target.value)}
                />
              </label>
            )}
            {!showReminderField && !captureSurfaceDate && (
              <button type="button" className="text-sm underline" onClick={() => setShowReminderField(true)}>
                Add date
              </button>
            )}
          </div>
        )}

        <div className="capture-actions">
          <button
            type="button"
            className="capture-dock-btn"
            disabled={
              listBusy ||
              (resolutionBlocksDock && !collectionDockReady) ||
              (!gate.ready && !collectionDockReady && !taskText.trim())
            }
            onClick={tryDock}
          >
            {listBusy ? 'Working…' : gate.ready || collectionDockReady || taskText.trim() ? 'Dock' : 'Add'}
          </button>
        </div>

        {chosenJob ? (
          <p className="capture-job-hint text-xs text-neutral-500">Job: {chosenJob.name}</p>
        ) : null}
        {intendedTime ? (
          <p className="text-xs text-neutral-500">Intended: {fmtClock(intendedTime)}</p>
        ) : null}
      </div>
    </div>
  );
}
