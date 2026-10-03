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
  location: string;
  locationCoords: { lat: number; lng: number } | null;
  jobId: string | null;
  startAt: string | null;
  notes: string;
};

export function NewMeetingSheet(props: {
  jobs: Job[];
  onSave: (payload: NewMeetingPayload) => void;
  onClose: () => void;
  initialText?: string;
  initialJobId?: string | null;
  locationResolution?: { state: string; candidate?: JobLocationCandidate; candidates?: JobLocationCandidate[] } | null;
  onConfirmResolution?: (c: JobLocationCandidate) => void;
  onDeclineResolution?: () => void;
}) {
  const {
    jobs,
    onSave,
    onClose,
    initialText = '',
    initialJobId = null,
  } = props;

  const [text, setText] = useState(initialText);
  const [duration, setDuration] = useState('');
  const [location, setLocation] = useState('');
  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [jobId, setJobId] = useState<string | null>(initialJobId);
  const [date, setDate] = useState(localDateStr());
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const dialogRef = useDialogA11y(onClose);

  useEffect(() => {
    if (initialText) setText(initialText);
  }, [initialText]);

  const preview = useMemo(() => parseMeetingInput(text), [text]);

  function submit() {
    const durationMins = parseMins(duration) || 30;
    const startAt =
      date && time
        ? combineDateAndTime(date, parseTimeInput(time) || time)
        : date
          ? combineDateAndTime(date, '09:00')
          : null;
    onSave({
      text: text.trim() || preview.title || 'Meeting',
      durationMins,
      location: location.trim(),
      locationCoords,
      jobId,
      startAt,
      notes: notes.trim(),
    });
  }

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        className="sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-meeting-title"
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-header">
          <h2 id="new-meeting-title">New meeting</h2>
          <button type="button" className="btn-text" onClick={onClose} aria-label="Close">
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="capture-text-row">
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
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

        <label className="settings-label">
          Duration
          <input type="text" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="30m" />
        </label>

        <label className="settings-label">
          Location
          <LocationAutocomplete
            value={location}
            onChange={setLocation}
            onPlaceSelected={(r) => {
              setLocation(r.formattedAddress);
              setLocationCoords({ lat: r.lat, lng: r.lng });
            }}
            placeholder="Where?"
          />
        </label>

        <label className="settings-label">
          Job
          <select value={jobId ?? ''} onChange={(e) => setJobId(e.target.value || null)}>
            <option value="">None</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
        </label>

        <div className="capture-row">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
          <input type="text" value={time} onChange={(e) => setTime(e.target.value)} placeholder="Time" aria-label="Time" />
        </div>

        <label className="settings-label">
          Notes
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything jotted down before or during the meeting" rows={3} style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical' }} />
        </label>

        <button type="button" className="btn btn-steel" onClick={submit}>
          Save meeting
        </button>
      </div>
    </div>
  );
}

export type { CapturedMedia };

export type CaptureSpeaker = 'customer' | 'us' | 'note';

export type ObservationCaptureDraft = {
  text: string;
  speaker: CaptureSpeaker;
};

export function ObservationCapture(props: {
  text: string;
  onTextChange: (v: string) => void;
  speaker: CaptureSpeaker;
  onSpeakerChange: (s: CaptureSpeaker) => void;
  onAddPhoto: () => void;
  onToggleVoice: () => void;
  recording: boolean;
  saving: boolean;
  captureError: string | null;
  onSave: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
}) {
  const {
    text,
    onTextChange,
    speaker,
    onSpeakerChange,
    onAddPhoto,
    onToggleVoice,
    recording,
    saving,
    captureError,
    onSave,
    onKeyDown,
    placeholder = 'What was said or seen…',
  } = props;

  const textRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div className="observation-capture" role="region" aria-label="Capture meeting note">
      <div className="observation-speaker-row" role="group" aria-label="Speaker">
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
            className={speaker === opt.id ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'}
            aria-pressed={speaker === opt.id}
            disabled={saving}
            onClick={() => onSpeakerChange(opt.id)}
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
          <button type="button" className="meeting-pill" onClick={onAddPhoto} disabled={saving}>
            + Photo
          </button>
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
        <p className="meeting-capture-error" role="alert" id="meeting-capture-error">
          {captureError}
        </p>
      )}

      <button type="button" className="btn btn-steel" onClick={onSave} disabled={saving}>
        Save note
      </button>
    </div>
  );
}
