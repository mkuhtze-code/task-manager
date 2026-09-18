'use client';

import { useEffect, useState } from 'react';
import type { EstimateSuggestion, LocationSuggestion, JobSuggestion, LocationMemorySuggestion } from '@/lib/taskIntelligence';
import type { CaptureContextDecision } from '@/lib/thinking/types';
import { fmtMins, minsToInput, fmtClock } from '@/lib/timeFormat';
import type { Job } from '@/lib/jobTypes';
import type { ThoughtParts } from '@/lib/unifiedInput/parse';
import { hasEntityResolution, type JobLocationResolution, type JobLocationCandidate } from '@/lib/unifiedInput/resolve';
import { oneShotGate } from '@/lib/unifiedInput/oneShot';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import MicButton from '@/components/MicButton';
import { MapPinIcon } from '@/components/icons';

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
  /** Quiet line from runtime lookup — same story as capacity. */
  durationExplain?: string | null;
  error: string;
  onClose: () => void;
}) {
  const {
    taskText, setTaskText, taskTime, setTaskTime, captureSuggestion, captureLocationSuggestion,
    captureLocationMemorySuggestion, captureJobSuggestion, captureContext, locationFieldVisible, addTask,
    captureLocation, setCaptureLocation, captureLocationCoords, setCaptureLocationCoords,
    manualLocationToggle, setManualLocationToggle, showReminderField, setShowReminderField,
    captureSurfaceDate, setCaptureSurfaceDate, jobs, captureJobId, setCaptureJobId,
    thought, intendedTime, locationResolution, declinedResolution, onConfirmResolution, onDeclineResolution,
    confirmedJobId = null, durationExplain = null, error, onClose,
  } = props;

  const gate = oneShotGate({
    rawText: taskText,
    thought,
    locationResolution,
    declinedResolution,
    confirmedJobId: confirmedJobId ?? null,
  });

  function tryDock() {
    addTask();
  }

  const [showJobField, setShowJobField] = useState(false);
  const chosenJob = jobs.find((j) => j.id === captureJobId);

  const resolutionFocused = !!locationResolution &&
    (locationResolution.state === 'proposed' ||
      locationResolution.state === 'choose' ||
      locationResolution.state === 'known');

  useEffect(() => {
    if (captureJobId) return;
    if (captureContext && captureContext.authority !== 'observe' && captureContext.suggestedJobId) {
      const suggestedJob = jobs.find((j) => j.id === captureContext.suggestedJobId);
      if (suggestedJob) {
        setCaptureJobId(suggestedJob.id);
      }
    }
  }, [captureContext, captureJobId, jobs, setCaptureJobId]);

  useEffect(() => {
    if (!locationFieldVisible) return;
    if (captureLocationCoords) return;
    if (captureLocationMemorySuggestion && captureLocationMemorySuggestion.lat != null) {
      setCaptureLocation(captureLocationMemorySuggestion.locationText);
      setCaptureLocationCoords({
        lat: captureLocationMemorySuggestion.lat,
        lng: captureLocationMemorySuggestion.lng,
      });
    }
  }, [locationFieldVisible, captureLocationCoords, captureLocationMemorySuggestion, setCaptureLocation, setCaptureLocationCoords]);

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="capture-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="capture-text-row">
          <input
            type="text"
            value={taskText}
            onChange={(e) => setTaskText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                tryDock();
              }
            }}
            placeholder="What needs doing?"
            autoFocus
          />
          <MicButton
            onResult={(text) =>
              setTaskText((prev) => (prev.trim().length > 0 ? `${prev.trim()} ${text}` : text))
            }
          />
        </div>

        {thought && (thought.hadFacets || hasEntityResolution(locationResolution) || resolutionFocused) && (
          <div className="unified-thought-panel">
            {thought.hadFacets && (
              <div className="unified-thought-summary">
                {thought.intent && thought.intent.length > 0 && (
                  <span className="unified-thought-intent">As: <strong>{thought.intent}</strong></span>
                )}
                <span className="unified-thought-facets">
                  {thought.date && <span className="unified-thought-chip">📅 {thought.date}</span>}
                  {intendedTime && <span className="unified-thought-chip">⏰ {fmtClock(intendedTime)}</span>}
                  {thought.locationHint && <span className="unified-thought-chip">📍 {thought.locationHint}</span>}
                  {thought.priority && <span className="unified-thought-chip">{thought.priority}</span>}
                </span>
              </div>
            )}

            {!declinedResolution && locationResolution && locationResolution.state === 'proposed' && (
              <div className="unified-thought-confirm">
                <span className="unified-thought-prompt">
                  Do you mean <strong>{locationResolution.candidate.matchedField === 'location' && locationResolution.candidate.locationText ? locationResolution.candidate.locationText : locationResolution.candidate.jobName}</strong>
                  {locationResolution.candidate.matchedField === 'location' ? ` (${locationResolution.candidate.jobName})` : ''}?
                </span>
                <div className="unified-thought-actions">
                  <button type="button" className="btn btn-steel" onClick={() => onConfirmResolution(locationResolution.candidate)}>Yes</button>
                  <button type="button" className="btn-text" onClick={onDeclineResolution}>Not this</button>
                </div>
              </div>
            )}

            {!declinedResolution && locationResolution && locationResolution.state === 'choose' && (
              <div className="unified-thought-choose">
                <span className="unified-thought-prompt">Which one?</span>
                <div className="sheet-inline-options">
                  {locationResolution.candidates.map((c) => (
                    <button type="button" key={c.jobId} className="move-day-option" onClick={() => onConfirmResolution(c)}>
                      {c.matchedField === 'location' && c.locationText ? `${c.locationText} (${c.jobName})` : c.jobName}
                    </button>
                  ))}
                  <button type="button" className="btn-text" onClick={onDeclineResolution}>Not here</button>
                </div>
              </div>
            )}

            {!declinedResolution && locationResolution && locationResolution.state === 'known' && (
              <div className="unified-thought-confirm">
                <span className="unified-thought-prompt">
                  In <strong>{locationResolution.candidate.matchedField === 'location' && locationResolution.candidate.locationText ? locationResolution.candidate.locationText : locationResolution.candidate.jobName}</strong>
                  {locationResolution.candidate.matchedField === 'location' ? ` (${locationResolution.candidate.jobName})` : ''}
                </span>
                <button type="button" className="btn-text" onClick={onDeclineResolution}>Not this</button>
              </div>
            )}
          </div>
        )}

        {captureSuggestion && (
          <button
            type="button"
            className="estimate-suggestion-chip"
            onClick={() => setTaskTime(minsToInput(captureSuggestion.suggestedMins))}
          >
            ≈ {fmtMins(captureSuggestion.suggestedMins)} usual ({captureSuggestion.sampleCount}×)
          </button>
        )}
        {durationExplain && !captureSuggestion && (
          <div className="settings-help" style={{ marginTop: 2 }}>{durationExplain}</div>
        )}

        <div className="capture-row">
          <input
            type="text"
            value={taskTime}
            onChange={(e) => setTaskTime(e.target.value)}
            placeholder="0m"
            style={{ width: 80 }}
          />
          <button
            className="btn btn-steel"
            style={{ flex: 1 }}
            onClick={tryDock}
            disabled={taskText.trim().length === 0}
          >
            {gate.ready ? 'Dock' : 'Add task'}
          </button>
        </div>
        {gate.blockReason && (
          <div className="settings-help" style={{ marginTop: 4 }}>{gate.blockReason}</div>
        )}

        {!locationFieldVisible ? (
          <button type="button" className="reveal-reminder-link" onClick={() => setManualLocationToggle(true)}>
            + Add a location
          </button>
        ) : (
          <>
            <LocationAutocomplete
              value={captureLocation}
              placeholder="Where does this happen?"
              onChange={setCaptureLocation}
              onPlaceSelected={(result) => {
                setCaptureLocation(result.formattedAddress);
                setCaptureLocationCoords({ lat: result.lat, lng: result.lng });
              }}
            />
            {captureLocationMemorySuggestion && !captureLocationCoords && captureLocationMemorySuggestion.authority !== 'strong' && (
              <button
                type="button"
                className="estimate-suggestion-chip"
                onClick={() => {
                  setCaptureLocation(captureLocationMemorySuggestion.locationText);
                  setCaptureLocationCoords({ lat: captureLocationMemorySuggestion.lat, lng: captureLocationMemorySuggestion.lng });
                }}
              >
                <MapPinIcon size={13} />
                <span>{captureLocationMemorySuggestion.locationText} ({captureLocationMemorySuggestion.occurrenceCount}×)</span>
              </button>
            )}
            {!captureLocationMemorySuggestion && captureLocationSuggestion && !captureLocationCoords && (
              <button
                type="button"
                className="estimate-suggestion-chip"
                onClick={() => {
                  setCaptureLocation(captureLocationSuggestion.location.text);
                  setCaptureLocationCoords({ lat: captureLocationSuggestion.location.lat, lng: captureLocationSuggestion.location.lng });
                }}
              >
                <MapPinIcon size={13} />
                <span>{captureLocationSuggestion.location.text} usual ({captureLocationSuggestion.sampleCount}×)</span>
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
              Remove location
            </button>
          </>
        )}

        {!showReminderField ? (
          <button type="button" className="reveal-reminder-link" onClick={() => setShowReminderField(true)}>
            + Surface on a day
          </button>
        ) : (
          <div className="capture-row">
            <input type="date" value={captureSurfaceDate} onChange={(e) => setCaptureSurfaceDate(e.target.value)} />
            <button type="button" className="btn-text" onClick={() => { setShowReminderField(false); setCaptureSurfaceDate(''); }}>Clear</button>
          </div>
        )}

        {!showJobField && !captureJobId ? (
          <button type="button" className="reveal-reminder-link" onClick={() => setShowJobField(true)}>
            + Job
          </button>
        ) : captureJobId ? (
          <div className="capture-row" style={{ alignItems: 'center', gap: 8 }}>
            <span className="settings-help" style={{ margin: 0 }}>Job: {chosenJob?.name ?? '…'}</span>
            <button type="button" className="btn-text" onClick={() => { setCaptureJobId(null); setShowJobField(false); }}>Clear</button>
          </div>
        ) : (
          <div className="job-picker">
            {jobs.map((j) => (
              <button type="button" key={j.id} className="move-day-option" onClick={() => { setCaptureJobId(j.id); setShowJobField(false); }}>
                {j.name}
              </button>
            ))}
            <button type="button" className="btn-text" onClick={() => setShowJobField(false)}>Cancel</button>
          </div>
        )}

        {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}
        <button className="btn-text" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
