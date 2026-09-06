'use client';

import { useState } from 'react';
import type { MeetingMedia, MeetingObservation } from '@/lib/meetingTypes';
import { fmtCapturedAt, observationEdit, type CapturedMedia } from '@/lib/meetingCapture';
import { useMeetingMediaCapture } from '@/hooks/useMeetingMediaCapture';
import MeetingPhotoCarousel from '@/components/MeetingPhotoCarousel';
import { AudioNote, PhotoImage } from '@/components/MediaRender';
import { deleteMediaBlob, isMediaRef } from '@/lib/mediaStore';
import { TrashIcon } from '@/components/icons';

// One observation displayed as ONE object. Its evidence — text, photos,
// voice — is edited independently and never crossed: changing the text
// never touches the media, removing a single photo never removes any other,
// and removals are staged and undoable until Save. "Edit" opens the same
// observation in place; "+ Photo"/"+ Voice" add evidence straight back to
// THIS observation with no navigation and no separate "attach" step.
export default function MeetingObservationItem(props: {
  observation: MeetingObservation;
  media: MeetingMedia[];
  saving: boolean;
  onDelete: () => void;
  onAddMedia: (observationId: string, captured: CapturedMedia) => Promise<boolean>;
  onSaveEdit: (
    observationId: string,
    text: string,
    removeMediaIds: string[],
    newMedia: CapturedMedia[]
  ) => Promise<boolean>;
}) {
  const { observation, media, saving, onDelete, onAddMedia, onSaveEdit } = props;
  const cap = useMeetingMediaCapture();

  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const [removeIds, setRemoveIds] = useState<string[]>([]);
  const [newMedia, setNewMedia] = useState<CapturedMedia[]>([]);
  const [addingMedia, setAddingMedia] = useState(false);

  const photos = media.filter((m) => m.media_type === 'photo');
  const audios = media.filter((m) => m.media_type === 'audio');

  const evidenceAfterEdit = media.filter((m) => !removeIds.includes(m.id)).length + newMedia.length;
  const canSaveEdit = observationEdit(editText, evidenceAfterEdit) !== null;
  const busy = saving || addingMedia || cap.recording;

  function startEdit() {
    setEditText(observation.text ?? '');
    setRemoveIds([]);
    setNewMedia([]);
    setEditing(true);
  }

  function cancelEdit() {
    // Staged media had their bytes parked in IndexedDB at capture time;
    // cancelling the edit discards them so nothing orphaned is left behind.
    for (const m of newMedia) {
      if (isMediaRef(m.uri)) void deleteMediaBlob(m.uri);
    }
    setEditing(false);
    setEditText('');
    setRemoveIds([]);
    setNewMedia([]);
  }

  function toggleRemove(id: string) {
    setRemoveIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function dropNewMedia(i: number) {
    // Dropping a staged piece also frees its local bytes — it was never
    // saved to any observation, so nothing else references it.
    const m = newMedia[i];
    if (m && isMediaRef(m.uri)) void deleteMediaBlob(m.uri);
    setNewMedia((prev) => prev.filter((_, j) => j !== i));
  }

  async function saveEdit() {
    const text = observationEdit(editText, evidenceAfterEdit);
    if (text === null) return;
    const ok = await onSaveEdit(observation.id, text, removeIds, newMedia);
    if (ok) cancelEdit();
  }

  // View-mode "add evidence" — the same capture paths new observations use,
  // writing straight to this observation. Voice is the only async capture;
  // the pill doubles as the stop control while recording.
  function addPhoto() {
    cap.pickPhoto(async (m) => {
      await onAddMedia(observation.id, m);
    });
  }

  async function toggleVoice() {
    if (cap.recording) {
      cap.stopRecording();
      return;
    }
    setAddingMedia(true);
    const m = await cap.captureVoice();
    if (m) await onAddMedia(observation.id, m);
    setAddingMedia(false);
  }

  // In edit mode, "+ Photo"/"+ Voice" stage into newMedia and persist on
  // Save together with the text and the removals.
  function editAddPhoto() {
    cap.pickPhoto((m) => setNewMedia((prev) => [...prev, m]));
  }

  async function editToggleVoice() {
    if (cap.recording) {
      cap.stopRecording();
      return;
    }
    setAddingMedia(true);
    const m = await cap.captureVoice();
    if (m) setNewMedia((prev) => [...prev, m]);
    setAddingMedia(false);
  }

  return (
    <div className="observation-item">
      {!editing && photos.length > 0 && <MeetingPhotoCarousel photos={photos} />}

      {!editing && observation.text && observation.text.trim().length > 0 && (
        <div className="observation-text">{observation.text}</div>
      )}

      {!editing &&
        audios.map((m) => <AudioNote key={m.id} ref={m.local_uri} className="media-audio" />)}

      {editing ? (
        <div className="observation-edit-lane">
          <textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            placeholder="What did you see, hear or notice?"
            rows={2}
            className="observation-capture-text"
            autoFocus
          />

          {(media.length > 0 || newMedia.length > 0) && (
            <div className="meeting-edit-media">
              {media.map((m) => {
                const removing = removeIds.includes(m.id);
                return (
                  <div
                    key={m.id}
                    className={removing ? 'meeting-edit-media-item is-removing' : 'meeting-edit-media-item'}
                  >
                    {m.media_type === 'audio' ? (
                      <AudioNote ref={m.local_uri} className="media-audio" />
                    ) : (
                      <PhotoImage ref={m.local_uri} alt="" className="meeting-edit-media-thumb" />
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
              {newMedia.map((m, i) => (
                <div key={m.uri} className="meeting-edit-media-item">
                  {m.mediaType === 'audio' ? (
                    <AudioNote ref={m.uri} className="media-audio" />
                  ) : (
                    <PhotoImage ref={m.uri} alt="Newly captured" className="meeting-edit-media-thumb" />
                  )}
                  <button
                    type="button"
                    className="meeting-pill meeting-pill--quiet"
                    onClick={() => dropNewMedia(i)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="meeting-observation-actions">
            <button type="button" className="meeting-pill" onClick={editAddPhoto} disabled={busy}>
              + Photo
            </button>
            <button
              type="button"
              className={cap.recording ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'}
              onClick={editToggleVoice}
              disabled={saving || (addingMedia && !cap.recording)}
            >
              {cap.recording ? 'Recording…' : '+ Voice'}
            </button>
          </div>
        </div>
      ) : (
        <div className="observation-footer">
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
      )}

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
            <button type="button" className="meeting-pill" onClick={cancelEdit} disabled={saving || addingMedia}>
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

      {cap.captureError && <p className="meeting-capture-error">{cap.captureError}</p>}

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