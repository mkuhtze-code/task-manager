'use client';

import { useState } from 'react';
import type { MeetingMedia, MeetingObservation } from '@/lib/meetingTypes';
import {
  fmtCapturedAt,
  observationEdit,
  photoAlt,
  photoMedia,
  remainingMedia,
  type CapturedMedia,
} from '@/lib/meetingCapture';
import { useMeetingMediaCapture } from '@/hooks/useMeetingMediaCapture';
import MeetingPhotoCarousel from '@/components/MeetingPhotoCarousel';
import { TrashIcon } from '@/components/icons';

// A saved observation is an evidence container, not a dead text row: it
// shows its text, its photos (as a carousel) and its audio, and lets the
// user keep working with it — edit the text in place (Cancel restores,
// removals are staged until Save), add photos/voice through the SAME
// capture path new observations use, and remove the whole observation.
export default function MeetingObservationItem(props: {
  observation: MeetingObservation;
  media: MeetingMedia[];
  saving: boolean;
  onDelete: () => void;
  onInsertMedia: (observationId: string, captured: CapturedMedia) => Promise<boolean>;
  onSaveEdit: (observationId: string, text: string, removeMediaIds: string[]) => Promise<boolean>;
}) {
  const { observation, media, saving, onDelete, onInsertMedia, onSaveEdit } = props;
  const cap = useMeetingMediaCapture();

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [removeIds, setRemoveIds] = useState<string[]>([]);
  const [addingVoice, setAddingVoice] = useState(false);

  const photos = photoMedia(media);
  const audios = media.filter((m) => m.media_type === 'audio');
  const docs = media.filter((m) => m.media_type === 'document');

  const remainingAfterEdit = remainingMedia(media, removeIds).length;
  const canSaveEdit = observationEdit(editText, remainingAfterEdit) !== null;
  const busy = saving || addingVoice;

  function startEdit() {
    setEditText(observation.text ?? '');
    setRemoveIds([]);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEditText('');
    setRemoveIds([]);
  }

  function toggleRemove(id: string) {
    setRemoveIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function saveEdit() {
    const text = observationEdit(editText, remainingAfterEdit);
    if (text === null) return;
    const ok = await onSaveEdit(observation.id, text, removeIds);
    if (ok) cancelEdit();
  }

  function addPhoto() {
    cap.pickPhoto(async (m) => {
      await onInsertMedia(observation.id, m);
    });
  }

  async function toggleVoice() {
    if (cap.recording) {
      cap.stopRecording();
      return;
    }
    setAddingVoice(true);
    const m = await cap.captureVoice();
    if (m) await onInsertMedia(observation.id, m);
    setAddingVoice(false);
  }

  return (
    <div className="observation-item">
      {editing ? (
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          placeholder="What did you see, hear or notice?"
          rows={2}
          className="observation-capture-text"
          autoFocus
        />
      ) : (
        observation.text && <div className="observation-text">{observation.text}</div>
      )}

      {editing && media.length > 0 && (
        <div className="meeting-edit-media">
          {media.map((m) => {
            const removing = removeIds.includes(m.id);
            return (
              <div key={m.id} className={removing ? 'meeting-edit-media-item is-removing' : 'meeting-edit-media-item'}>
                {m.media_type === 'audio' ? (
                  <audio controls src={m.local_uri} />
                ) : m.media_type === 'document' ? (
                  <span className="media-doc-label">Document</span>
                ) : (
                  <img src={m.local_uri} alt={photoAlt(m, 0, 1)} />
                )}
                <button
                  type="button"
                  className="meeting-pill meeting-pill--quiet"
                  onClick={() => toggleRemove(m.id)}
                >
                  {removing ? 'Undo' : 'Remove'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {!editing && photos.length > 0 && (
        <MeetingPhotoCarousel
          photos={photos}
          getObservationText={() => observation.text ?? null}
          labelBase="Observation photos"
        />
      )}

      {!editing &&
        audios.map((m) => (
          <audio key={m.id} controls src={m.local_uri} className="media-audio" />
        ))}

      {!editing &&
        docs.map((m) => (
          <span key={m.id} className="media-doc-label">
            Document
          </span>
        ))}

      <div className="observation-meta">
        <span className="observation-captured">Captured {fmtCapturedAt(observation.captured_at)}</span>
        <button
          className="meeting-pill meeting-pill--icon"
          onClick={onDelete}
          aria-label="Remove observation"
          disabled={busy}
        >
          <TrashIcon size={14} />
        </button>
      </div>

      <div className="meeting-observation-actions">
        {editing ? (
          <>
            <button
              type="button"
              className="meeting-pill meeting-pill--primary"
              onClick={saveEdit}
              disabled={busy || !canSaveEdit}
            >
              Save
            </button>
            <button type="button" className="meeting-pill" onClick={cancelEdit} disabled={busy}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button type="button" className="meeting-pill" onClick={startEdit} disabled={busy}>
              Edit
            </button>
            <button type="button" className="meeting-pill" onClick={addPhoto} disabled={busy}>
              + Photo
            </button>
            <button
              type="button"
              className={cap.recording ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'}
              onClick={toggleVoice}
              disabled={busy && !cap.recording}
            >
              {cap.recording ? 'Recording…' : '+ Voice'}
            </button>
          </>
        )}
      </div>

      <input
        ref={cap.photoRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={cap.onPhotoInputChange}
      />
    </div>
  );
}