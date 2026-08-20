'use client';

import { useEffect, useState } from 'react';
import type { EstimateSuggestion, LocationSuggestion, JobSuggestion, LocationMemorySuggestion } from '@/lib/taskIntelligence';
import type { CaptureContextDecision } from '@/lib/thinking/types';
import { fmtMins, minsToInput } from '@/lib/timeFormat';
import type { Job } from '@/lib/jobTypes';
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
  error: string;
  onClose: () => void;
}) {
  const {
    taskText, setTaskText, taskTime, setTaskTime, captureSuggestion, captureLocationSuggestion,
    captureLocationMemorySuggestion, captureJobSuggestion, captureContext, locationFieldVisible, addTask,
    captureLocation, setCaptureLocation, captureLocationCoords, setCaptureLocationCoords,
    manualLocationToggle, setManualLocationToggle, showReminderField, setShowReminderField,
    captureSurfaceDate, setCaptureSurfaceDate, jobs, captureJobId, setCaptureJobId, error, onClose,
  } = props;

  const [showJobField, setShowJobField] = useState(false);
  const chosenJob = jobs.find((j) => j.id === captureJobId);

  // Auto-fill job from capture context when authority >= 'suggest'.
  // The context composes job inference, current surface, and gravity.
  // Only fires when no job is currently selected — explicit user input
  // always takes precedence. The user can remove the auto-fill at any time.
  useEffect(() => {
    if (captureJobId) return;
    if (captureContext && captureContext.authority !== 'observe' && captureContext.suggestedJobId) {
      const suggestedJob = jobs.find((j) => j.id === captureContext.suggestedJobId);
      if (suggestedJob) {
        setCaptureJobId(captureContext.suggestedJobId);
      }
    }
  }, [captureContext, captureJobId, jobs, setCaptureJobId]);

  // Auto-fill location from strong engine memory. When the location field
  // is visible and the engine has strong confidence, fill it silently.
  // The user can always override by typing a different location.
  useEffect(() => {
    if (!locationFieldVisible) return;
    if (captureLocationCoords) return; // already has a location
    if (captureLocationMemorySuggestion && captureLocationMemorySuggestion.authority === 'strong') {
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
            placeholder="What needs doing?"
          />
          <MicButton
            onResult={(text) =>
              setTaskText((prev) => (prev.trim().length > 0 ? `${prev.trim()} ${text}` : text))
            }
          />
        </div>
        {captureSuggestion && (
          <button
            type="button"
            className="estimate-suggestion-chip"
            onClick={() => setTaskTime(minsToInput(captureSuggestion.suggestedMins))}
          >
            ≈ {fmtMins(captureSuggestion.suggestedMins)} usual ({captureSuggestion.sampleCount}×)
          </button>
        )}
        <div className="capture-row">
          <input
            type="text"
            value={taskTime}
            onChange={(e) => setTaskTime(e.target.value)}
            placeholder="0m"
            style={{ width: 80 }}
          />
          <button className="btn btn-steel" style={{ flex: 1 }} onClick={addTask}>Add task</button>
        </div>

        {!locationFieldVisible ? (
          <button
            type="button"
            className="reveal-reminder-link"
            onClick={() => setManualLocationToggle(true)}
          >
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
          <button
            type="button"
            className="reveal-reminder-link"
            onClick={() => setShowReminderField(true)}
          >
            Remind me later instead
          </button>
        ) : (
          <div className="reminder-date-row">
            <input
              type="date"
              value={captureSurfaceDate}
              onChange={(e) => setCaptureSurfaceDate(e.target.value)}
            />
            <button
              type="button"
              className="btn-text"
              onClick={() => { setShowReminderField(false); setCaptureSurfaceDate(''); }}
            >
              Cancel
            </button>
          </div>
        )}

        {captureJobId && chosenJob ? (
          <div className="reminder-date-row">
            <span className="settings-help">In <strong>{chosenJob.name}</strong></span>
            <button type="button" className="btn-text" onClick={() => { setCaptureJobId(null); setShowJobField(false); }}>
              Remove
            </button>
          </div>
        ) : !showJobField ? (
          <button
            type="button"
            className="reveal-reminder-link"
            onClick={() => setShowJobField(true)}
          >
            + Add to a job
          </button>
        ) : jobs.length === 0 ? (
          <div className="reminder-date-row">
            <span className="settings-help">No jobs yet — create one from the Jobs tab</span>
            <button type="button" className="btn-text" onClick={() => setShowJobField(false)}>Cancel</button>
          </div>
        ) : (
          <div className="job-picker">
            {jobs.map((j) => (
              <button
                type="button"
                key={j.id}
                className="move-day-option"
                onClick={() => { setCaptureJobId(j.id); setShowJobField(false); }}
              >
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
