'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Job } from '@/lib/jobTypes';
import type { CapturedMedia } from '@/lib/meetingCapture';
import { parseMins, localDateStr } from '@/lib/timeFormat';
import { parseMeetingInput, parseTimeInput, combineDateAndTime } from '@/lib/meetingUtils';
import type { JobLocationCandidate } from '@/lib/unifiedInput/resolve';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import MicButton from '@/components/MicButton';
import { textForCaptureField } from '@/hooks/useCaptureSpeech';
import { processCaptureSpeech } from '@/lib/speech';
import { AudioNote, PhotoImage } from '@/components/MediaRender';
import { CloseIcon, MapPinIcon, TrashIcon } from '@/components/icons';
import { useDialogA11y } from '@/hooks/useDialogA11y';

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
  const dialogRef = useDialogA11y(onClose);
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [declinedResolution, setDeclinedResolution] = useState(false);
  const [error, setError] = useState('');

  const preview = useMemo(() => parseMeetingInput(text, jobs, today), [text, jobs, today]);

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
  const hasOptionalActive = Boolean(timeInput || durationInput !== '30m' || locationText.trim() || jobId || showJobField || notes.trim());

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div ref={dialogRef} className="capture-sheet new-meeting-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Record a meeting">
        <div className="task-detail-header" style={{ marginBottom: 0 }}>
          <div className="settings-panel-title">Record a meeting</div>
          <button className="gear-btn" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <p className="job-detail-kicker">Meeting</p>
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '0 0 10px', lineHeight: 1.4 }}>
          Give this meeting a starting point.
        </p>

        <div className="capture-text-row">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            id="new-meeting-text"
            aria-label="Meeting description"
            placeholder="e.g. Meeting with Tim at Belgium Rd tomorrow at 2pm"
            autoFocus
          />
          <MicButton
            onResult={(spoken) => {
              const result = processCaptureSpeech({ text: spoken });
              const next = textForCaptureField(result);
              setText((prev) => (prev.trim().length > 0 ? `${prev.trim()} ${next}` : next));
            }}
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

        <div className="stop-context-strip" style={{ marginTop: 4 }}>
          <div className="stop-context-line">
            <span className="stop-context-kicker">When</span>
            <span>
              {dateInput ? dateInput : 'Today'}
              {timeInput ? ` · ${timeInput}` : ' · no fixed time'}
              {` · ${parseMins(durationInput) ?? 30}m`}
            </span>
          </div>
          {job ? (
            <div className="stop-context-line">
              <span className="stop-context-kicker">About</span>
              <span>{job.name}</span>
            </div>
          ) : null}
        </div>

        <button
          type="button"
          className={moreOpen ? "capture-more-toggle open" : "capture-more-toggle"}
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
        >
          {moreOpen ? "Less" : hasOptionalActive ? "Details" : "Time, place, job, notes…"}
        </button>

        {moreOpen ? (
          <div className="capture-more-body">
            <div className="reminder-date-row" style={{ flexWrap: "wrap", gap: 8 }}>
              <input type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} aria-label="Meeting date" />
              <input type="time" value={timeInput} onChange={(e) => { setTimeInput(e.target.value); prefilled.current.time = true; }} aria-label="Meeting time" />
              <input type="text" value={durationInput} onChange={(e) => setDurationInput(e.target.value)} placeholder="30m" style={{ width: 70 }} aria-label="Duration" />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
                <button type="button" className="btn-text" onClick={() => { setJobId(null); setShowJobField(false); }}>Remove</button>
              </div>
            ) : !showJobField ? (
              <button type="button" className="reveal-reminder-link" onClick={() => setShowJobField(true)}>+ About a job</button>
            ) : jobs.length === 0 ? (
              <div className="reminder-date-row">
                <span className="settings-help">No jobs yet — create one from the Jobs tab</span>
                <button type="button" className="btn-text" onClick={() => setShowJobField(false)}>Cancel</button>
              </div>
            ) : (
              <div className="job-picker">
                {jobs.map((j) => (
                  <button type="button" key={j.id} className="move-day-option" onClick={() => { setJobId(j.id); setShowJobField(false); }}>{j.name}</button>
                ))}
                <button type="button" className="btn-text" onClick={() => setShowJobField(false)}>Cancel</button>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="settings-label">Notes (optional — raw capture)</span>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything jotted down before or during the meeting" rows={3} style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }} />
            </div>
          </div>
        ) : null}
        {error && (
          <p id="new-meeting-error" role="alert" style={{ color: 'var(--hazard)', fontSize: 12, margin: 0 }}>{error}</p>
        )}

        <div className="capture-row">
          <button className="btn btn-steel" style={{ flex: 1 }} onClick={submit} disabled={saving}>{saving ? 'Saving…' : 'Add meeting'}</button>
          <button className="btn-text" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export type { CapturedMedia };

// Discussion note capture: one continuous surface for what was said and seen.
// Speaker chips (Customer / Us / Note) are soft attribution for the
// Communication Engine — stored as a quiet text prefix, no schema change.
export type CaptureSpeaker = 'customer' | 'us' | 'note';

export type ObservationCaptureDraft = {
  text: string;
  media: CapturedMedia[];
  speaker?: CaptureSpeaker;
};

export function ObservationCapture(props: {
  saving: boolean;
  text: string;
  media: CapturedMedia[];
  recording: boolean;
  captureError: string | null;
  onTextChange: (text: string) => void;
  onAddPhoto: () => void;
  onToggleVoice: () => void;
  onRemoveMedia: (index: number) => void;
  onSave: (draft: ObservationCaptureDraft) => void;
  onCancel: () => void;
  defaultSpeaker?: CaptureSpeaker;
}) {
  const {
    saving,
    text,
    media,
    recording,
    captureError,
    onTextChange,
    onAddPhoto,
    onToggleVoice,
    onRemoveMedia,
    onSave,
    onCancel,
    defaultSpeaker = 'customer',
  } = props;

  const [speaker, setSpeaker] = useState<CaptureSpeaker>(defaultSpeaker);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, 72), 240);
    el.style.height = `${next}px`;
  }, [text]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const t = window.setTimeout(() => {
      try { el.focus({ preventScroll: true }); } catch { el.focus(); }
    }, 40);
    return () => window.clearTimeout(t);
  }, []);

  const canSave = !saving && !recording && (text.trim().length > 0 || media.length > 0);

  function submit() {
    if (!canSave) return;
    onSave({ text, media, speaker });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  }

  const placeholder =
    speaker === 'customer'
      ? 'What did the customer say or want?'
      : speaker === 'us'
        ? 'What did you say, commit to, or need to check?'
        : 'What did you see, hear, or notice?';

  return (
    <div className="observation-capture" role="region" aria-label="Capture meeting note">
      <div className="observation-capture-speaker" role="group" aria-label="Who said this">
        {(
          [
            { id: 'customer' as const, label: 'Customer' },
            { id: 'us' as const, label: 'Us' },
            { id: 'note' as const, label: 'Note' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={
              speaker === opt.id
                ? 'meeting-pill meeting-pill--primary observation-speaker-chip'
                : 'meeting-pill observation-speaker-chip'
            }
            aria-pressed={speaker === opt.id}
            disabled={saving}
            onClick={() => setSpeaker(opt.id)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <textarea
        ref={textRef}
        value={text}
        onChange={(e) => onTextChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={3}
        className="observation-capture-text"
        aria-label="Meeting note"
        enterKeyHint="done"
      />

      <div className="observation-capture-toolbar">
        <div className="observation-capture-tools">
          <button type="button" className="meeting-pill" onClick={onAddPhoto} disabled={saving}>+ Photo</button>
          <button
            type="button"
            className={recording ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'}
            onClick={onToggleVoice}
            disabled={saving}
            aria-pressed={recording}
          >
            {recording ? 'Stop recording' : '+ Voice'}
          </button>
        </div>
        <p className="observation-capture-hint">
          {recording ? 'Recording… tap Stop when finished' : '⌘/Ctrl+Enter to save'}
        </p>
      </div>

      {captureError && (
        <p className="meeting-capture-error" role="alert" id="meeting-capture-error">{captureError}</p>
      )}

      {media.length > 0 && (
        <div className="pending-media" aria-label="Attached media">
          {media.map((m, i) => (
            <div key={m.uri} className="pending-media-item">
              {m.mediaType === 'audio' ? <AudioNote uri={m.uri} /> : <PhotoImage uri={m.uri} alt="Captured photo" />}
              <button type="button" aria-label="Remove" className="pending-media-remove" onClick={() => onRemoveMedia(i)}>
                <CloseIcon size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="observation-capture-footer">
        <button type="button" className="meeting-pill meeting-pill--primary" onClick={submit} disabled={!canSave}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="meeting-pill" onClick={onCancel} disabled={saving}>Cancel</button>
      </div>
    </div>
  );
}
