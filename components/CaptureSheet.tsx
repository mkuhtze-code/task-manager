'use client';

/**
 * Capture — pen to paper.
 * Primary path: type (or speak) → Dock.
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

  useEffect(() => {
    setEstimateHintVisible(shouldShowEstimateHint());
  }, []);

  // Context may seed a job quietly — never opens the job picker.
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

  // Parent may open location from a seed; keep more panel in sync.
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
    (captureSuggestion.confidence !== 'low' ||
      captureSuggestion.source === 'measured');

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
          <button type="button" className="btn-text capture-sheet-close" onClick={onClose}>
            Close
          </button>
        </div>

        {/* ── The paper line ─────────────────────────────────────── */}
        <div className="capture-text-row">
          <input
            id="capture-task-text"
            type="text"
            value={taskText}
            onChange={(e) => setTaskText(e.target.value)}
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
          <MicButton
            onTranscript={(t) =>
              setTaskText((prev) => (prev ? `${prev.trim()} ${t}` : t))
            }
          />
        </div>

        {/* Quiet interpretation — only when the thought actually parsed facets */}
        {thought && thought.hadFacets && (
          <div className="capture-facet-strip" aria-live="polite">
            {thought.date && (
              <span className="capture-facet-chip">
                {thought.date === new Date().toISOString().slice(0, 10)
                  ? 'Today'
                  : thought.date}
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

        {/* Ambiguous job/place only — known is silent */}
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

        {/* Strong estimate only — one tap to adopt, never a form field up front */}
        {showEstimateChip && captureSuggestion && (
          <button
            type="button"
            className="estimate-suggestion-chip"
            onClick={applySuggestedMins}
          >
            Usually {fmtMins(captureSuggestion.suggestedMins)}
            {estimateHintVisible ? ' · tap to use' : ''}
          </button>
        )}

        {durationExplain && showTimeField && (
          <p className="settings-help capture-duration-explain">{durationExplain}</p>
        )}

        {/* ── Primary action first ───────────────────────────────── */}
        <button
          type="button"
          className="btn btn-steel capture-dock-btn"
          disabled={!gate.ready}
          onClick={tryDock}
        >
          {gate.ready ? 'Dock' : 'Add'}
        </button>

        {error && (
          <p
            id="capture-error"
            role="alert"
            className="capture-error-line"
          >
            {error}
          </p>
        )}

        {/* ── Optional details — collapsed by default ───────────── */}
        <div className="capture-more">
          <button
            type="button"
            className={
              moreOpen ? 'capture-more-toggle open' : 'capture-more-toggle'
            }
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((v) => !v)}
          >
            {moreOpen ? 'Less' : hasOptionalActive ? 'Details' : 'Time, place, job…'}
          </button>

          {moreOpen && (
            <div className="capture-more-body">
              {/* Time */}
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

              {/* Location */}
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
                      setCaptureLocationCoords({
                        lat: result.lat,
                        lng: result.lng,
                      });
                    }}
                  />
                  {captureLocationMemorySuggestion && !captureLocation.trim() && (
                    <button
                      type="button"
                      className="estimate-suggestion-chip"
                      onClick={() => {
                        const loc = captureLocationMemorySuggestion.location;
                        setCaptureLocation(loc.text);
                        if (loc.lat != null && loc.lng != null) {
                          setCaptureLocationCoords({ lat: loc.lat, lng: loc.lng });
                        }
                      }}
                    >
                      <MapPinIcon size={13} />
                      <span>
                        {captureLocationMemorySuggestion.location.text}
                      </span>
                    </button>
                  )}
                  {captureLocationSuggestion &&
                    !captureLocationMemorySuggestion &&
                    !captureLocation.trim() && (
                      <button
                        type="button"
                        className="estimate-suggestion-chip"
                        onClick={() => {
                          setCaptureLocation(
                            captureLocationSuggestion.location.text
                          );
                          setCaptureLocationCoords({
                            lat: captureLocationSuggestion.location.lat,
                            lng: captureLocationSuggestion.location.lng,
                          });
                        }}
                      >
                        <MapPinIcon size={13} />
                        <span>
                          {captureLocationSuggestion.location.text}
                        </span>
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

              {/* Job */}
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
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => setShowJobField(false)}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Surface day */}
              {!showReminderField && !captureSurfaceDate ? (
                <button
                  type="button"
                  className="reveal-reminder-link"
                  onClick={() => setShowReminderField(true)}
                >
                  + Later day
                </button>
              ) : (
                <div className="capture-row">
                  <input
                    id="capture-surface-date"
                    type="date"
                    value={captureSurfaceDate}
                    onChange={(e) => setCaptureSurfaceDate(e.target.value)}
                    aria-label="Surface on day"
                  />
                  <button
                    type="button"
                    className="btn-text"
                    onClick={() => {
                      setShowReminderField(false);
                      setCaptureSurfaceDate('');
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
    </div>
  );
}
