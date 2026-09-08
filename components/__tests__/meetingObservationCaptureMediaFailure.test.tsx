// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeetingMedia } from '@/lib/meetingTypes';
import type { CapturedMedia } from '@/lib/meetingCapture';
import { useMeetingMediaCapture } from '@/hooks/useMeetingMediaCapture';
import { useObservationDrafting } from '@/hooks/useObservationDrafting';
import MeetingObservations from '@/components/MeetingObservations';

// MediaStore failures ARE handled: the write path rejects, the user sees a
// calm explicit message, and the draft stays OPEN — a photo that could not
// be stored never closes or corrupts the capture session.
vi.mock('@/lib/mediaStore', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/lib/mediaStore')>();
  return {
    ...mod,
    saveMediaBlob: vi.fn(async () => {
      throw new Error('device write failed');
    }),
  };
});

function Harness() {
  const cap = useMeetingMediaCapture();
  const draft = useObservationDrafting('m-1');
  const [saving, setSaving] = useState(false);

  async function saveObservation() {
    setSaving(true);
    setSaving(false);
  }

  return (
    <MeetingObservations
      observations={[]}
      mediaByObservation={new Map<string, MeetingMedia[]>()}
      saving={saving}
      onSaveObservation={async () => true}
      onDelete={() => {}}
      onAddMedia={async () => true}
      onSaveEdit={async () => true}
      capturing={draft.state.phase === 'open'}
      onStartObservation={() => draft.begin()}
      draftText={draft.state.text}
      draftMedia={draft.state.media}
      recording={cap.recording}
      captureError={cap.captureError}
      onTextChange={(text) => draft.setText(text)}
      onAddPhoto={() => cap.pickPhoto((m) => draft.addMedia(m))}
      onToggleVoice={async () => {
        void cap.captureVoice();
      }}
      onRemoveDraftMedia={(i) => draft.removeMedia(i)}
      onCancelObservation={() => draft.discard()}
      photoInputRef={cap.photoRef}
      onPhotoInputChange={cap.onPhotoInputChange}
    />
  );
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function pickPhoto() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(input, { target: { files: [new File(['bytes'], 'p.jpg', { type: 'image/jpeg' })] } });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('observation capture: a device failure to store bytes is a calm no-op', () => {
  it('shows the storage error, keeps the draft open with text, and never attaches the photo', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '+ Observation' }));
    const composer = screen.getByPlaceholderText('What did you see, hear or notice?');
    fireEvent.change(composer, { target: { value: 'the write must not kill this draft' } });

    fireEvent.click(screen.getByRole('button', { name: '+ Photo' }));
    await pickPhoto();

    await waitFor(() =>
      expect(screen.getByText("Couldn't store that photo on this device — try again.")).toBeTruthy()
    );

    // The surface is still open, the text is intact, and no failed photo
    // is staged as if it had succeeded.
    expect(screen.getByPlaceholderText('What did you see, hear or notice?')).toBeTruthy();
    expect((screen.getByPlaceholderText('What did you see, hear or notice?') as HTMLTextAreaElement).value).toBe(
      'the write must not kill this draft'
    );
    expect(screen.queryAllByRole('button', { name: 'Remove' })).toHaveLength(0);
  });
});