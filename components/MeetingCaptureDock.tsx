'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { CapturedMedia } from '@/lib/meetingCapture';
import type { CaptureSpeaker } from '@/components/MeetingSheets';
import { AudioNote, PhotoImage } from '@/components/MediaRender';
import { CloseIcon } from '@/components/icons';

/** How this meeting is being run — drives labels and default capture kinds. */
export type MeetingCaptureMode = 'site' | 'table';

/** What the user is about to log. Maps to existing meeting tables. */
export type CaptureKind =
  | 'discussion' // → observation
  | 'decision' // → meeting_decisions
  | 'action' // → meeting_actions
  | 'attendee'; // → meeting_participants

export type MeetingCaptureDockSubmit = {
  kind: CaptureKind;
  text: string;
  media: CapturedMedia[];
  speaker?: CaptureSpeaker;
};

const MODE_KEY = (meetingId: string) => `dokkit-meeting-mode:${meetingId}`;

export function readMeetingCaptureMode(meetingId: string): MeetingCaptureMode {
  if (typeof window === 'undefined') return 'site';
  try {
    const v = window.sessionStorage.getItem(MODE_KEY(meetingId));
    if (v === 'table' || v === 'site') return v;
  } catch {
    /* ignore */
  }
  return 'site';
}

export function writeMeetingCaptureMode(meetingId: string, mode: MeetingCaptureMode) {
  try {
    window.sessionStorage.setItem(MODE_KEY(meetingId), mode);
  } catch {
    /* ignore */
  }
}

type Props = {
  meetingId: string;
  saving: boolean;
  recording: boolean;
  captureError: string | null;
  draftText: string;
  draftMedia: CapturedMedia[];
  onTextChange: (text: string) => void;
  onAddPhoto: () => void;
  onToggleVoice: () => void;
  onRemoveMedia: (index: number) => void;
  onSubmitObservation: (draft: {
    text: string;
    media: CapturedMedia[];
    speaker?: CaptureSpeaker;
  }) => Promise<boolean> | boolean;
  onSubmitDecision: (text: string) => Promise<void> | void;
  onSubmitAction: (text: string) => Promise<void> | void;
  onSubmitAttendee: (name: string) => Promise<void> | void;
  observationOpen?: boolean;
  onBeginObservation?: () => void;
};

const SITE_KINDS: { id: CaptureKind; label: string; speaker?: CaptureSpeaker }[] = [
  { id: 'discussion', label: 'Note', speaker: 'note' },
  { id: 'discussion', label: 'Customer', speaker: 'customer' },
  { id: 'discussion', label: 'Us', speaker: 'us' },
  { id: 'decision', label: 'Decision' },
  { id: 'action', label: 'Action' },
];

const TABLE_KINDS: { id: CaptureKind; label: string; speaker?: CaptureSpeaker }[] = [
  { id: 'discussion', label: 'Discussion', speaker: 'note' },
  { id: 'decision', label: 'Decision' },
  { id: 'action', label: 'Action' },
  { id: 'attendee', label: 'Attendee' },
];

export default function MeetingCaptureDock(props: Props) {
  const {
    meetingId,
    saving,
    recording,
    captureError,
    draftText,
    draftMedia,
    onTextChange,
    onAddPhoto,
    onToggleVoice,
    onRemoveMedia,
    onSubmitObservation,
    onSubmitDecision,
    onSubmitAction,
    onSubmitAttendee,
    observationOpen,
    onBeginObservation,
  } = props;

  const [mode, setMode] = useState<MeetingCaptureMode>(() => readMeetingCaptureMode(meetingId));
  const [kindIndex, setKindIndex] = useState(0);
  const [localText, setLocalText] = useState('');
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  const kinds = mode === 'site' ? SITE_KINDS : TABLE_KINDS;
  const active = kinds[Math.min(kindIndex, kinds.length - 1)] ?? kinds[0];
  const isObservation = active.id === 'discussion';

  const text = isObservation && observationOpen ? draftText : localText;
  const media = isObservation ? draftMedia : [];

  useEffect(() => {
    writeMeetingCaptureMode(meetingId, mode);
    setKindIndex(0);
  }, [mode, meetingId]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(Math.max(el.scrollHeight, 56), 200);
    el.style.height = `${next}px`;
  }, [text]);

  const placeholder = useMemo(() => {
    if (mode === 'site') {
      if (active.label === 'Customer') return 'What did the customer say or want?';
      if (active.label === 'Us') return 'What did you commit to or need to check?';
      if (active.id === 'decision') return 'What was decided on site?';
      if (active.id === 'action') return 'What needs to happen next?';
      return 'What did you see, hear, or notice?';
    }
    if (active.id === 'decision') return 'Decision — what was agreed?';
    if (active.id === 'action') return 'Action — who does what by when?';
    if (active.id === 'attendee') return 'Attendee name';
    return 'Discussion point — what was said?';
  }, [mode, active]);

  const canSave =
    !saving &&
    !recording &&
    (text.trim().length > 0 || (isObservation && media.length > 0));

  function selectKind(index: number) {
    setKindIndex(index);
    const next = kinds[index];
    if (next?.id === 'discussion' && !observationOpen) {
      onBeginObservation?.();
    }
  }

  function onText(value: string) {
    if (isObservation) {
      if (!observationOpen) onBeginObservation?.();
      onTextChange(value);
    } else {
      setLocalText(value);
    }
  }

  async function submit() {
    if (!canSave) return;
    const trimmed = text.trim();
    if (active.id === 'decision') {
      await onSubmitDecision(trimmed);
      setLocalText('');
      return;
    }
    if (active.id === 'action') {
      await onSubmitAction(trimmed);
      setLocalText('');
      return;
    }
    if (active.id === 'attendee') {
      await onSubmitAttendee(trimmed);
      setLocalText('');
      return;
    }
    await onSubmitObservation({
      text: trimmed,
      media,
      speaker: active.speaker ?? 'note',
    });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
    if (e.key === 'Enter' && !e.shiftKey && active.id === 'attendee') {
      e.preventDefault();
      void submit();
    }
  }

  return (
    <section className="meeting-capture-dock" aria-label="Meeting capture">
      <div className="meeting-capture-dock-modes" role="group" aria-label="Meeting style">
        <button
          type="button"
          className={mode === 'site' ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'}
          aria-pressed={mode === 'site'}
          onClick={() => setMode('site')}
        >
          Site
        </button>
        <button
          type="button"
          className={mode === 'table' ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'}
          aria-pressed={mode === 'table'}
          onClick={() => setMode('table')}
        >
          Table
        </button>
        <p className="meeting-capture-dock-mode-hint">
          {mode === 'site'
            ? 'Field visit — notes, photos, what was said'
            : 'Formal meeting — discussion, decisions, actions'}
        </p>
      </div>

      <div className="meeting-capture-dock-kinds" role="group" aria-label="What to capture">
        {kinds.map((k, i) => (
          <button
            key={`${k.id}-${k.label}`}
            type="button"
            className={
              kindIndex === i
                ? 'meeting-pill meeting-pill--primary observation-speaker-chip'
                : 'meeting-pill observation-speaker-chip'
            }
            aria-pressed={kindIndex === i}
            disabled={saving}
            onClick={() => selectKind(i)}
          >
            {k.label}
          </button>
        ))}
      </div>

      <textarea
        ref={textRef}
        value={text}
        onChange={(e) => onText(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => {
          if (isObservation && !observationOpen) onBeginObservation?.();
        }}
        placeholder={placeholder}
        rows={active.id === 'attendee' ? 1 : 2}
        className="observation-capture-text meeting-capture-dock-text"
        aria-label={placeholder}
        enterKeyHint="done"
      />

      {isObservation && (
        <div className="observation-capture-toolbar">
          <div className="observation-capture-tools">
            <button
              type="button"
              className="meeting-pill"
              onClick={() => {
                if (!observationOpen) onBeginObservation?.();
                onAddPhoto();
              }}
              disabled={saving}
            >
              + Photo
            </button>
            <button
              type="button"
              className={recording ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'}
              onClick={() => {
                if (!observationOpen) onBeginObservation?.();
                onToggleVoice();
              }}
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
      )}

      {captureError && (
        <p className="meeting-capture-error" role="alert">
          {captureError}
        </p>
      )}

      {media.length > 0 && (
        <div className="pending-media" aria-label="Attached media">
          {media.map((m, i) => (
            <div key={m.uri} className="pending-media-item">
              {m.mediaType === 'audio' ? (
                <AudioNote uri={m.uri} />
              ) : (
                <PhotoImage uri={m.uri} alt="Captured photo" />
              )}
              <button
                type="button"
                aria-label="Remove"
                className="pending-media-remove"
                onClick={() => onRemoveMedia(i)}
              >
                <CloseIcon size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="observation-capture-footer meeting-capture-dock-footer">
        <button
          type="button"
          className="meeting-pill meeting-pill--primary"
          onClick={() => void submit()}
          disabled={!canSave}
        >
          {saving ? 'Saving…' : saveLabel(active)}
        </button>
      </div>
    </section>
  );
}

function saveLabel(active: { id: CaptureKind; label: string }): string {
  if (active.id === 'decision') return 'Log decision';
  if (active.id === 'action') return 'Log action';
  if (active.id === 'attendee') return 'Add attendee';
  return 'Save';
}
