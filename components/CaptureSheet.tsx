'use client';

import type { EstimateSuggestion, LocationSuggestion } from '@/lib/taskIntelligence';
import { fmtMins, minsToInput } from '@/lib/timeFormat';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import MicButton from '@/components/MicButton';

export function CaptureSheet(props: {
  taskText: string;
  setTaskText: React.Dispatch<React.SetStateAction<string>>;
  taskTime: string;
  setTaskTime: (v: string) => void;
  captureSuggestion: EstimateSuggestion | null;
  captureLocationSuggestion: LocationSuggestion | null;
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
  error: string;
  onClose: () => void;
}) {
  const {
    taskText, setTaskText, taskTime, setTaskTime, captureSuggestion, captureLocationSuggestion,
    locationFieldVisible, addTask, captureLocation, setCaptureLocation, captureLocationCoords,
    setCaptureLocationCoords, manualLocationToggle, setManualLocationToggle, showReminderField,
    setShowReminderField, captureSurfaceDate, setCaptureSurfaceDate, error, onClose,
  } = props;

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
            {captureLocationSuggestion && !captureLocationCoords && (
              <button
                type="button"
                className="estimate-suggestion-chip"
                onClick={() => {
                  setCaptureLocation(captureLocationSuggestion.location.text);
                  setCaptureLocationCoords({ lat: captureLocationSuggestion.location.lat, lng: captureLocationSuggestion.location.lng });
                }}
              >
                📍 {captureLocationSuggestion.location.text} usual ({captureLocationSuggestion.sampleCount}×)
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
        {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}
        <button className="btn-text" onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
