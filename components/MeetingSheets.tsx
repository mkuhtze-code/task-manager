'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Job } from '@/lib/jobTypes';
import type { CapturedMedia } from '@/lib/meetingCapture';
import { parseMins, localDateStr } from '@/lib/timeFormat';
import { parseMeetingInput, parseTimeInput, combineDateAndTime } from '@/lib/meetingUtils';
import type { JobLocationCandidate } from '@/lib/unifiedInput/resolve';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import MicButton from '@/components/MicButton';
import { useMeetingMediaCapture } from '@/hooks/useMeetingMediaCapture';
import { CloseIcon, MapPinIcon, TrashIcon } from '@/components/icons';

export type NewMeetingPayload = {
  text: string;
  durationMins: number;
  startTime: string | null;
  jobId: string | null;
  locationText: string | null;
  lat: number | null;
  lng: number | null;
  notes: string;
};

// Record a meeting the way the user thinks: one thought in, facets out.
// Sits on the SAME deterministic unified-thought parser tasks use — there
// is no meeting-specific parser. "Meeting with Tim at Belgium Rd tomorrow
// at 2pm" fills the title, day, time, location and the job/location
// resolution against real jobs in one pass.
export function NewMeetingSheet(props: {
  saving: boolean;
  jobs: Job[];
  onClose: () => void;
  onCreate: (payload: NewMeetingPayload) => void;
}) {
  const { saving, jobs, onClose, onCreate } = props;
  const today = localDateStr(new Date());

  const [text, setText] = useState('');
  const [durationInput, setDurationInput] = useState('30m');
  const [dateInput, setDateInput] = useState(today);
  const [timeInput, setTimeInput] = useState('');
  const [notes, setNotes] = useState('');
  const [locationText, setLocationText] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [showJobField, setShowJobField] = useState(false);
  const [declinedResolution, setDeclinedResolution] = useState(false);
  const [error, setError] = useState('');

  const preview = useMemo(() => parseMeetingInput(text, jobs, today), [text, jobs, today]);

  // Prefill the date/time fields from the thought the first time facets
  // appear, but never override what the user typed by hand.
  const prefilled = useRef({ date: false, time: false });
  useEffect(() => {
    if (!preview.date || prefilled.current.date) return;
    prefilled.current.date = true;
    setDateInput(preview.date);
    if (!preview.clock) return;
    prefilled.current.time = true;
    setTimeInput(`${String(preview.clock.hour).padStart(2, '0')}:${String(preview.clock.minute).padStart(2, '0')}`);
  }, [preview.date, preview.clock]);

  const resolutionVisible = preview.hadFacets && (preview.resolution.state !== 'none' || preview.date || preview.clock || preview.locationHint);
  const proposal = preview.resolution.state === 'proposed' ? preview.resolution.candidate : null;
  const choices = preview.resolution.state === 'choose' ? preview.resolution.candidates : [];

  function confirmResolution(c: JobLocationCandidate) {
    setJobId(c.jobId);
    setDeclinedResolution(true);
    if (c.matchedField === 'location' && c.locationText) {
      setLocationText(c.locationText);
      setCoords(c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : null);
    }
  }

  function chosenJob() {
    return jobs.find((j) => j.id === jobId) ?? null;
  }

  function submit() {
    const title = text.trim();
    if (title.length === 0) {
      setError('Describe the meeting');
      return;
    }
    if (!dateInput) {
      setError('Pick a date');
      return;
    }
    setError('');
    const mins = parseMins(durationInput) ?? 30;
    const clock = parseTimeInput(timeInput);
    onCreate({
      text: title,
      durationMins: mins,
      startTime: combineDateAndTime(dateInput, clock),
      jobId,
      locationText: locationText.trim() || null,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      notes: notes.trim(),
    });
  }

  const job = chosenJob();

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="capture-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="task-detail-header" style={{ marginBottom: 0 }}>
          <div className="settings-panel-title">Record a meeting</div>
          <button className="gear-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div className="capture-text-row">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder="e.g. Meeting with Tim at Belgium Rd tomorrow at 2pm"
          />
          <MicButton
            onResult={(t) =>
              setText((prev) => (prev.trim().length > 0 ? `${prev.trim()} ${t}` : t))
            }
          />
        </div>

        {resolutionVisible && (
          <div className="unified-thought-panel">
            <div className="unified-thought-summary">
              {preview.title && preview.title.length > 0 && (
                <span className="unified-thought-intent">As: <strong>{preview.title}</strong></span>
              )}
              <span className="unified-thought-facets">
                {preview.date && <span className="unified-thought-chip">📅 {preview.date}</span>}
                {preview.clock && <span className="unified-thought-chip">⏰ {preview.clock.label}</span>}
                {preview.locationHint && <span className="unified-thought-chip">📍 {preview.locationHint}</span>}
              </span>
            </div>

            {!declinedResolution && proposal && (
              <div className="unified-thought-confirm">
                <span className="unified-thought-prompt">
                  Do you mean{' '}
                  <strong>
                    {proposal.matchedField === 'location' && proposal.locationText
                      ? proposal.locationText
                      : proposal.jobName}
                  </strong>
                  {proposal.matchedField === 'location' ? ` (${proposal.jobName})` : ''}?
                </span>
                <div className="unified-thought-actions">
                  <button
                    type="button"
                    className="btn btn-steel"
                    style={{ flex: 1 }}
                    onClick={() => confirmResolution(proposal)}
                  >
                    Yes
                  </button>
                  <button type="button" className="btn-text" onClick={() => setDeclinedResolution(true)}>
                    Not this
                  </button>
                </div>
              </div>
            )}

            {!declinedResolution && choices.length > 0 && (
              <div className="unified-thought-choose">
                <span className="unified-thought-prompt">Which one?</span>
                <div className="sheet-inline-options">
                  {choices.map((c) => (
                    <button
                      type="button"
                      key={c.jobId}
                      className="move-day-option"
                      onClick={() => confirmResolution(c)}
                    >
                      {c.matchedField === 'location' && c.locationText ? `${c.locationText} (${c.jobName})` : c.jobName}
                    </button>
                  ))}
                  <button type="button" className="btn-text" onClick={() => setDeclinedResolution(true)}>
                    Not here
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="reminder-date-row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <input
            type="date"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            aria-label="Meeting date"
          />
          <input
            type="time"
            value={timeInput}
            onChange={(e) => { setTimeInput(e.target.value); prefilled.current.time = true; }}
            aria-label="Meeting time"
          />
          <input
            type="text"
            value={durationInput}
            onChange={(e) => setDurationInput(e.target.value)}
            placeholder="30m"
            style={{ width: 70 }}
            aria-label="Duration"
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="settings-label">Where (optional)</span>
          <LocationAutocomplete
            value={locationText}
            placeholder="Where does the meeting happen?"
            onChange={(t) => setLocationText(t)}
            onPlaceSelected={(r) => {
              setLocationText(r.formattedAddress);
              setCoords({ lat: r.lat, lng: r.lng });
            }}
          />
        </div>

        {job ? (
          <div className="reminder-date-row">
            <span className="settings-help">About <strong>{job.name}</strong></span>
            <button type="button" className="btn-text" onClick={() => { setJobId(null); setShowJobField(false); }}>
              Remove
            </button>
          </div>
        ) : !showJobField ? (
          <button type="button" className="reveal-reminder-link" onClick={() => setShowJobField(true)}>
            + About a job
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
                onClick={() => { setJobId(j.id); setShowJobField(false); }}
              >
                {j.name}
              </button>
            ))}
            <button type="button" className="btn-text" onClick={() => setShowJobField(false)}>Cancel</button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="settings-label">Notes (optional — raw capture)</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything jotted down before or during the meeting"
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>

        {error && <p style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>}

        <div className="capture-row">
          <button className="btn btn-steel" style={{ flex: 1 }} onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : 'Add meeting'}
          </button>
          <button className="btn-text" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export type { CapturedMedia };

// The observation capture area: "What did you see, hear or notice?" with
// optional Photo and Voice controls. Every input is optional — an
// observation is ONE piece of evidence (text and/or media) and no
// particular combination is ever required. Media stays DEVICE-LOCAL in
// V1: a captured photo/audio note becomes a meeting_media row whose
// local_uri is a blob URL reference — nothing is uploaded to Supabase.
export function ObservationCapture(props: {
  saving: boolean;
  onSave: (draft: { text: string; media: CapturedMedia[] }) => void;
  onCancel: () => void;
}) {
  const { saving, onSave, onCancel } = props;
  const [text, setText] = useState('');
  const [media, setMedia] = useState<CapturedMedia[]>([]);
  const cap = useMeetingMediaCapture();
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textRef.current?.focus();
  }, []);

  function addPhoto() {
    cap.pickPhoto((m) => setMedia((prev) => [...prev, m]));
  }

  async function toggleVoice() {
    if (cap.recording) {
      cap.stopRecording();
      return;
    }
    const m = await cap.captureVoice();
    if (m) setMedia((prev) => [...prev, m]);
  }

  const canSave = !saving && !cap.recording && (text.trim().length > 0 || media.length > 0);

  return (
    <div className="observation-capture">
      <textarea
        ref={textRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What did you see, hear or notice?"
        rows={2}
        className="observation-capture-text"
      />

      <div className="meeting-observation-actions">
        <button type="button" className="meeting-pill" onClick={addPhoto}>
          + Photo
        </button>
        <button
          type="button"
          className={cap.recording ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'}
          onClick={toggleVoice}
          disabled={saving}
        >
          {cap.recording ? 'Recording…' : '+ Voice'}
        </button>
        <input
          ref={cap.photoRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={cap.onPhotoInputChange}
        />
      </div>

      {media.length > 0 && (
        <div className="pending-media">
          {media.map((m, i) => (
            <div key={`${m.uri}-${i}`} className="pending-media-item">
              {m.mediaType === 'audio' ? (
                <audio controls src={m.uri} />
              ) : (
                <img src={m.uri} alt="Captured photo" />
              )}
              <button
                type="button"
                aria-label="Remove"
                className="pending-media-remove"
                onClick={() => setMedia(media.filter((_, j) => j !== i))}
              >
                <CloseIcon size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="meeting-observation-actions">
        <button
          type="button"
          className="meeting-pill meeting-pill--primary"
          onClick={() => onSave({ text, media })}
          disabled={!canSave}
        >
          {saving ? 'Saving…' : 'Save observation'}
        </button>
        <button type="button" className="meeting-pill" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </div>
  );
}