'use client';

/**
 * Capture — pen to paper.
 * Primary path: type (or speak) → Dock.
 * Speech goes through processCaptureSpeech before filling the line.
 * Collection list phrases route to applyAndPersistCollectionIntent (not tasks).
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
import {
  captureIsCollectionMutation,
  detectCaptureCollection,
  type SpeechUnderstandingContext,
} from '@/lib/speech';
import {
  applyAndPersistCollectionIntent,
  detectContextFromStore,
  loadCollectionStore,
  type CollectionIntent,
} from '@/lib/collections';
import { CollectionsPeekSheet } from '@/components/CollectionsPeekSheet';
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
  userId?: string | null;
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
  } = props;

  const [showJobField, setShowJobField] = useState(false);
  const [showTimeField, setShowTimeField] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [estimateHintVisible, setEstimateHintVisible] = useState(false);
  const [collectionFeedback, setCollectionFeedback] = useState<string | null>(null);
  const [listsOpen, setListsOpen] = useState(false);
  const [pendingClarification, setPendingClarification] = useState<{
    spoken: string;
    candidates: Array<{ collectionId: string; title: string; reason: string }>;
    pendingIntent: Exclude<CollectionIntent, { type: 'clarification_required' }> | null;
  } | null>(null);
  const { speechStatus, processSpokenText, clearSpeechStatus, confirmSpeechLearning } = useCaptureSpeech({
    userId,
  });

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
    const uid = userId ?? 'anon';
    const collectionContext = detectContextFromStore(loadCollectionStore(uid));
    const result = processSpokenText(spoken, {
      understandingContext: buildSpeechContext(),
      userId: uid,
      collectionContext,
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

  const collectionDockReady =
    !!speechStatus?.result &&
    (!!speechStatus.result.collection &&
      (captureIsCollectionMutation(speechStatus.result) ||
        speechStatus.result.uiMode === 'collection_clarification'));

  function stampClientOpIds(intent: CollectionIntent): CollectionIntent {
    const op = `cap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (intent.type === 'create_collection' || intent.type === 'append_collection') {
      return {
        ...intent,
        items: intent.items.map((item, idx) => ({
          ...item,
          clientOpId: item.clientOpId || `${op}-${idx}`,
        })),
      };
    }
    return intent;
  }

  function applyCollectionDock(intent: CollectionIntent) {
    const uid = userId ?? 'anon';
    if (intent.type === 'clarification_required') {
      setPendingClarification({
        spoken: intent.spoken,
        candidates: intent.candidates,
        pendingIntent: intent.pendingIntent,
      });
      setCollectionFeedback(null);
      return;
    }
    const stamped = stampClientOpIds(intent);
    const applied = applyAndPersistCollectionIntent(uid, stamped);
    confirmSpeechLearning();
    clearSpeechStatus();
    setPendingClarification(null);
    setCollectionFeedback(
      applied.message || (applied.ok ? 'List updated.' : 'Could not update list.')
    );
    setTaskText('');
  }

  function resolveClarification(collectionId: string) {
    if (!pendingClarification?.pendingIntent) {
      setPendingClarification(null);
      return;
    }
    const pending = pendingClarification.pendingIntent;
    let next: CollectionIntent = pending;
    if ('target' in pending) {
      next = {
        ...pending,
        target: { kind: 'id', collectionId },
      } as CollectionIntent;
    }
    applyCollectionDock(next);
  }

  function tryDock() {
    const uid = userId ?? 'anon';
    const speechResult = speechStatus?.result ?? null;
    let isCollection =
      !!speechResult &&
      !!speechResult.collection &&
      (captureIsCollectionMutation(speechResult) ||
        speechResult.collection.intent.type === 'clarification_required' ||
        speechResult.uiMode === 'collection_clarification');
    let collectionIntent = speechResult?.collection?.intent ?? null;

    if (!collectionIntent && taskText.trim()) {
      const ctx = detectContextFromStore(loadCollectionStore(uid));
      const detected = detectCaptureCollection(taskText.trim(), ctx);
      if (
        detected &&
        (detected.blocksTaskCreate ||
          detected.intent.type === 'clarification_required')
      ) {
        isCollection = true;
        collectionIntent = detected.intent;
      }
    }

    if (!isCollection && !gate.ready) return;

    if (isCollection && collectionIntent) {
      applyCollectionDock(collectionIntent);
      return;
    }

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

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        className="sheet-panel capture-sheet capture-sheet-paper"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-sheet-title"
        aria-describedby={error ? 'capture-error' : undefined}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="capture-sheet-header">
          <h2 id="capture-sheet-title" className="capture-sheet-title">
            Add
          </h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="btn-text"
              onClick={() => setListsOpen(true)}
              aria-label="Open lists"
            >
              Lists
            </button>
            <button type="button" className="btn-text capture-sheet-close" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="capture-text-row">
          <input
            id="capture-task-text"
            type="text"
            value={taskText}
            onChange={(e) => {
              setTaskText(e.target.value);
              if (speechStatus) clearSpeechStatus();
              if (collectionFeedback) setCollectionFeedback(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                tryDock();
              }
            }}
            placeholder="What needs doing…"
            autoComplete="off"
            autoFocus
            aria-invalid={!!error}
            aria-describedby={error ? 'capture-error' : undefined}
          />
          <MicButton onResult={onSpeechResult} />
        </div>

        {speechStatus && speechStatus.message ? (
          <div
            className={`capture-speech-status capture-speech-status-${speechStatus.tone}`}
            role="status"
            aria-live="polite"
          >
            <span>{speechStatus.message}</span>
            <button
              type="button"
              className="btn-text capture-speech-status-dismiss"
              onClick={clearSpeechStatus}
              aria-label="Dismiss"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {collectionFeedback ? (
          <div
            className="capture-speech-status capture-speech-status-propose"
            role="status"
            aria-live="polite"
          >
            <span>{collectionFeedback}</span>
            <button
              type="button"
              className="btn-text capture-speech-status-dismiss"
              onClick={() => setCollectionFeedback(null)}
              aria-label="Dismiss"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {pendingClarification ? (
          <div className="unified-thought-choose" role="group" aria-label="Which list">
            <span className="unified-thought-prompt">Which list?</span>
            <div className="sheet-inline-options">
              {pendingClarification.candidates.map((c) => (
                <button
                  type="button"
                  key={c.collectionId}
                  className="move-day-option"
                  onClick={() => resolveClarification(c.collectionId)}
                >
                  {c.title}
                </button>
              ))}
              <button type="button" className="btn-text" onClick={() => setPendingClarification(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {thought && thought.hadFacets && (
          <div className="capture-facet-strip" aria-live="polite">
            {thought.date && (
              <span className="capture-facet-chip">
                {thought.date === new Date().toISOString().slice(0, 10) ? 'Today' : thought.date}
              </span>
            )}
            {thought.time && (
              <span className="capture-facet-chip">{fmtClock(thought.time.label)}</span>
            )}
            {thought.locationHint && (
              <span className="capture-facet-chip">{thought.locationHint}</span>
            )}
          </div>
        )}

        {resolutionNeedsAttention && locationResolution?.state === 'proposed' && (
          <div
            className="capture-entity-chip capture-entity-chip-ask"
            role="group"
            aria-label="Possible job match"
          >
            <span className="capture-entity-chip-text">
              <strong>
                {locationResolution.candidate.matchedField === 'location' &&
                locationResolution.candidate.locationText
                  ? locationResolution.candidate.locationText
                  : locationResolution.candidate.jobName}
              </strong>
              {locationResolution.candidate.matchedField === 'location'
                ? ` · ${locationResolution.candidate.jobName}`
                : ''}
            </span>
            <span className="capture-entity-chip-actions">
              <button
                type="button"
                className="btn-text capture-entity-chip-yes"
                onClick={() => onConfirmResolution(locationResolution.candidate)}
              >
                Yes
              </button>
              <button type="button" className="btn-text" onClick={onDeclineResolution}>
                Skip
              </button>
            </span>
          </div>
        )}

        {resolutionNeedsAttention && locationResolution?.state === 'choose' && (
          <div className="unified-thought-choose">
            <span className="unified-thought-prompt">Job</span>
            <div className="sheet-inline-options">
              {locationResolution.candidates.map((c) => (
                <button
                  type="button"
                  key={c.jobId}
                  className="move-day-option"
                  onClick={() => onConfirmResolution(c)}
                >
                  {c.matchedField === 'location' && c.locationText
                    ? `${c.locationText} (${c.jobName})`
                    : c.jobName}
                </button>
              ))}
              <button type="button" className="btn-text" onClick={onDeclineResolution}>
                Skip
              </button>
            </div>
          </div>
        )}

        {showEstimateChip && captureSuggestion && (
          <button type="button" className="estimate-suggestion-chip" onClick={applySuggestedMins}>
            Usually {fmtMins(captureSuggestion.suggestedMins)}
            {estimateHintVisible ? ' · tap to use' : ''}
          </button>
        )}

        {durationExplain && showTimeField && (
          <p className="settings-help capture-duration-explain">{durationExplain}</p>
        )}

        <button
          type="button"
          className="btn btn-steel capture-dock-btn"
          disabled={!gate.ready && !collectionDockReady}
          onClick={tryDock}
        >
          {gate.ready || collectionDockReady ? 'Dock' : 'Add'}
        </button>

        {error && (
          <p id="capture-error" role="alert" className="capture-error-line">
            {error}
          </p>
        )}

        <div className="capture-more">
          <button
            type="button"
            className={moreOpen ? 'capture-more-toggle open' : 'capture-more-toggle'}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
          >
            {moreOpen ? 'Less' : hasOptionalActive ? 'Details' : 'Time, place, job…'}
          </button>

          {moreOpen && (
            <div className="capture-more-body">
              {!showTimeField && !taskTime.trim() ? (
                <button
                  type="button"
                  className="reveal-reminder-link"
                  onClick={() => setShowTimeField(true)}
                >
                  + Time estimate
                </button>
              ) : (
                <div className="capture-row">
                  <input
                    id="capture-task-time"
                    type="text"
                    inputMode="text"
                    value={taskTime}
                    onChange={(e) => setTaskTime(e.target.value)}
                    placeholder="e.g. 25m or 1.5h"
                    aria-label="Time estimate"
                  />
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => {
                      setTaskTime('');
                      setShowTimeField(false);
                    }}
                  >
                    Clear
                  </button>
                </div>
              )}

              {!manualLocationToggle && !captureLocation.trim() ? (
                <button
                  type="button"
                  className="reveal-reminder-link"
                  onClick={() => setManualLocationToggle(true)}
                >
                  + Place
                </button>
              ) : (
                <>
                  <LocationAutocomplete
                    value={captureLocation}
                    placeholder="Where?"
                    onChange={setCaptureLocation}
                    onPlaceSelected={(result) => {
                      setCaptureLocation(result.formattedAddress);
                      setCaptureLocationCoords({ lat: result.lat, lng: result.lng });
                    }}
                  />
                  {captureLocationMemorySuggestion && !captureLocation.trim() && (
                    <button
                      type="button"
                      className="estimate-suggestion-chip"
                      onClick={() => {
                        const mem = captureLocationMemorySuggestion;
                        setCaptureLocation(mem.locationText);
                        if (mem.lat != null && mem.lng != null) {
                          setCaptureLocationCoords({ lat: mem.lat, lng: mem.lng });
                        }
                      }}
                    >
                      <MapPinIcon size={13} />
                      <span>{captureLocationMemorySuggestion.locationText}</span>
                    </button>
                  )}
                  {captureLocationSuggestion &&
                    !captureLocationMemorySuggestion &&
                    !captureLocation.trim() && (
                      <button
                        type="button"
                        className="estimate-suggestion-chip"
                        onClick={() => {
                          setCaptureLocation(captureLocationSuggestion.location.text);
                          setCaptureLocationCoords({
                            lat: captureLocationSuggestion.location.lat,
                            lng: captureLocationSuggestion.location.lng,
                          });
                        }}
                      >
                        <MapPinIcon size={13} />
                        <span>{captureLocationSuggestion.location.text}</span>
                      </button>
                    )}
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => {
                      setCaptureLocation('');
                      setCaptureLocationCoords(null);
                      setManualLocationToggle(false);
                    }}
                  >
                    Clear place
                  </button>
                </>
              )}

              {!showJobField && !captureJobId ? (
                <button
                  type="button"
                  className="reveal-reminder-link"
                  onClick={() => setShowJobField(true)}
                >
                  + Job
                </button>
              ) : captureJobId ? (
                <div className="capture-row" style={{ alignItems: 'center', gap: 8 }}>
                  <span className="settings-help" style={{ margin: 0 }}>
                    {chosenJob?.name ?? 'Job'}
                  </span>
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => {
                      setCaptureJobId(null);
                      setShowJobField(false);
                    }}
                  >
                    Clear
                  </button>
                </div>
              ) : (
                <div className="job-picker">
                  {jobs.map((j) => (
                    <button
                      type="button"
                      key={j.id}
                      className="move-day-option"
                      onClick={() => {
                        setCaptureJobId(j.id);
                        setShowJobField(false);
                      }}
                    >
                      {j.name}
                    </button>
                  ))}
                  <button type="button" className="btn-text" onClick={() => setShowJobField(false)}>
                    Cancel
                  </button>
                </div>
              )}

              {!showReminderField && !captureSurfaceDate ? (
                <button
                  type="button"
                  className="reveal-reminder-link"
                  onClick={() => setShowReminderField(true)}
                >
                  + Day
                </button>
              ) : (
                <div className="capture-row">
                  <input
                    type="date"
                    value={captureSurfaceDate}
                    onChange={(e) => setCaptureSurfaceDate(e.target.value)}
                    aria-label="Surface date"
                  />
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => {
                      setCaptureSurfaceDate('');
                      setShowReminderField(false);
                    }}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <CollectionsPeekSheet
        userId={userId}
        open={listsOpen}
        onClose={() => setListsOpen(false)}
      />
    </div>
  );
}
