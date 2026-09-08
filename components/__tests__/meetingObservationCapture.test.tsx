// @vitest-environment happy-dom
import 'fake-indexeddb/auto';
import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeetingMedia, MeetingObservation } from '@/lib/meetingTypes';
import type { CapturedMedia } from '@/lib/meetingCapture';
import { isMediaRef, deleteMediaBlob } from '@/lib/mediaStore';
import { useMeetingMediaCapture } from '@/hooks/useMeetingMediaCapture';
import { useObservationDrafting } from '@/hooks/useObservationDrafting';
import MeetingObservations from '@/components/MeetingObservations';
import MeetingObservationTile from '@/components/MeetingObservationTile';

// The page wires the capture + draft pieces and hands them down as props;
// this harness mirrors that wiring exactly, minus Supabase, so the tests
// exercise the REAL interaction path: buttons → picker input → IndexedDB
// (fake) → draft → sessionStorage → capture surface.
function Harness(props: {
  onSave?: (draft: { text: string; media: CapturedMedia[] }) => Promise<boolean>;
}) {
  const cap = useMeetingMediaCapture();
  const draft = useObservationDrafting('m-1');
  const [saving, setSaving] = useState(false);
  const onSave = props.onSave ?? (async () => true);
  const emptyMediaByObservation = new Map<string, MeetingMedia[]>();

  async function saveObservation(payload: { text: string; media: CapturedMedia[] }) {
    setSaving(true);
    const ok = await onSave(payload);
    setSaving(false);
    if (ok) draft.complete();
    return ok;
  }

  const startObservation = () => draft.begin();
  const addPhoto = () => cap.pickPhoto((m) => draft.addMedia(m));
  const toggleVoice = async () => {
    const m = await cap.captureVoice();
    if (m) draft.addMedia(m);
  };
  const textChange = (text: string) => draft.setText(text);
  const removeDraftMedia = (i: number) => {
    const m = draft.state.media[i];
    if (m && isMediaRef(m.uri)) void deleteMediaBlob(m.uri);
    draft.removeMedia(i);
  };
  const cancelObservation = () => {
    for (const m of draft.state.media) {
      if (isMediaRef(m.uri)) void deleteMediaBlob(m.uri);
    }
    draft.discard();
  };

  return (
    <MeetingObservations
      observations={[]}
      mediaByObservation={emptyMediaByObservation}
      saving={saving}
      onSaveObservation={saveObservation}
      onDelete={() => {}}
      onAddMedia={async () => true}
      onSaveEdit={async () => true}
      capturing={draft.state.phase === 'open'}
      onStartObservation={startObservation}
      draftText={draft.state.text}
      draftMedia={draft.state.media}
      recording={cap.recording}
      captureError={cap.captureError}
      onTextChange={textChange}
      onAddPhoto={addPhoto}
      onToggleVoice={toggleVoice}
      onRemoveDraftMedia={removeDraftMedia}
      onCancelObservation={cancelObservation}
      photoInputRef={cap.photoRef}
      onPhotoInputChange={cap.onPhotoInputChange}
    />
  );
}

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const COMPOSER_PLACEHOLDER = 'What did you see, hear or notice?';

function composer(): HTMLTextAreaElement | null {
  return screen.queryByPlaceholderText(COMPOSER_PLACEHOLDER) as HTMLTextAreaElement | null;
}

function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

async function pickPhoto(name = 'p.jpg', type = 'image/jpeg') {
  fireEvent.change(fileInput(), { target: { files: [new File(['fake-jpeg'], name, { type })] } });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function pickNothing() {
  fireEvent.change(fileInput(), { target: { files: [] } });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function pendingRemoveButtons(): HTMLElement[] {
  return screen.queryAllByRole('button', { name: 'Remove' });
}

async function storedBlobCount(): Promise<number> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('dokkit-media-store', 2);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('blobs')) req.result.createObjectStore('blobs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const count = await new Promise<number>((resolve) => {
    const tx = db.transaction('blobs', 'readonly');
    const c = tx.objectStore('blobs').count();
    c.onsuccess = () => resolve(c.result);
    c.onerror = () => resolve(-1);
  });
  db.close();
  return count;
}

beforeEach(() => {
  window.sessionStorage.clear();
});

describe('observation capture interaction: the surface CONFIRMS', () => {
  it('Test A: taking a photograph does NOT close the capture surface, and the photo is on the draft', async () => {
    const before = await storedBlobCount();
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '+ Observation' }));
    expect(composer()).not.toBeNull();

    fireEvent.change(composer()!, { target: { value: 'Saw the projection fail.' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Photo' }));
    await pickPhoto('demo.jpg');

    await waitFor(() => expect(pendingRemoveButtons()).toHaveLength(1));
    expect(composer()).not.toBeNull();
    expect(composer()!.value).toBe('Saw the projection fail.');
    expect(await storedBlobCount()).toBe(before + 1);
  });

  it('Test B: text → three photos → voice guard compose into the SAME open draft, all blobs stored', async () => {
    const before = await storedBlobCount();
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '+ Observation' }));

    fireEvent.change(composer()!, { target: { value: 'Three frames of evidence.' } });
    for (let i = 1; i <= 3; i++) {
      fireEvent.click(screen.getByRole('button', { name: '+ Photo' }));
      await pickPhoto(`p${i}.jpg`);
    }
    await waitFor(() => expect(pendingRemoveButtons()).toHaveLength(3));

    // Happy-dom has no MediaRecorder; the voice path must degrade to a calm
    // error instead of throwing or closing the draft.
    fireEvent.click(screen.getByRole('button', { name: '+ Voice' }));
    await waitFor(() => expect(screen.queryByText(/Recording is not supported/i)).not.toBeNull());

    expect(composer()).not.toBeNull();
    expect(composer()!.value).toBe('Three frames of evidence.');
    expect(pendingRemoveButtons()).toHaveLength(3);
    expect(await storedBlobCount()).toBe(before + 3);
  });

  it('Test C: a cancelled picker (returns nothing) is a no-op, not a close', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '+ Observation' }));
    fireEvent.change(composer()!, { target: { value: 'keep me' } });

    fireEvent.click(screen.getByRole('button', { name: '+ Photo' }));
    await pickPhoto('one.jpg');
    await waitFor(() => expect(pendingRemoveButtons()).toHaveLength(1));
    const afterOne = await storedBlobCount();

    fireEvent.click(screen.getByRole('button', { name: '+ Photo' }));
    await pickNothing();

    await act(async () => {});
    expect(composer()).not.toBeNull();
    expect(composer()!.value).toBe('keep me');
    expect(pendingRemoveButtons()).toHaveLength(1);
    expect(await storedBlobCount()).toBe(afterOne);
  });

  it('Test D: a full reload (unmount/remount) restores the SAME draft open, text and photos intact', async () => {
    const { unmount } = render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '+ Observation' }));
    fireEvent.change(composer()!, { target: { value: 'survive the webview round trip' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Photo' }));
    await pickPhoto('reload.jpg');
    await waitFor(() => expect(pendingRemoveButtons()).toHaveLength(1));

    unmount();

    render(<Harness />);
    await waitFor(() => expect(composer()).not.toBeNull());
    expect(composer()!.value).toBe('survive the webview round trip');
    expect(pendingRemoveButtons()).toHaveLength(1);
  });

  it('Test E: a successful Save closes the surface, and the next begin starts a fresh empty draft', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '+ Observation' }));
    fireEvent.change(composer()!, { target: { value: 'saved observation' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Photo' }));
    await pickPhoto('save.jpg');
    await waitFor(() => expect(pendingRemoveButtons()).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Save observation' }));
    await waitFor(() => expect(composer()).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: '+ Observation' }));
    expect(composer()).not.toBeNull();
    expect(composer()!.value).toBe('');
    expect(pendingRemoveButtons()).toHaveLength(0);
  });

  it('Test F: a failed Save KEEPS the draft open — nothing is lost, nothing is closed', async () => {
    render(<Harness onSave={async () => false} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Observation' }));
    fireEvent.change(composer()!, { target: { value: 'must survive a failed write' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Photo' }));
    await pickPhoto('flaky.jpg');
    await waitFor(() => expect(pendingRemoveButtons()).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: 'Save observation' }));

    await waitFor(() => expect(screen.queryByText('Saving…')).toBeNull());
    expect(composer()).not.toBeNull();
    expect(composer()!.value).toBe('must survive a failed write');
    expect(pendingRemoveButtons()).toHaveLength(1);
  });

  it('Test G: an explicit Cancel is the ONLY discard — it closes the surface AND frees the staged bytes', async () => {
    const before = await storedBlobCount();
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '+ Observation' }));
    fireEvent.change(composer()!, { target: { value: 'abandon this draft' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Photo' }));
    await pickPhoto('abandon.jpg');
    await waitFor(() => expect(pendingRemoveButtons()).toHaveLength(1));
    expect(await storedBlobCount()).toBe(before + 1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(composer()).toBeNull());
    expect(await storedBlobCount()).toBe(before);

    // And the next session really does start fresh.
    fireEvent.click(screen.getByRole('button', { name: '+ Observation' }));
    expect(composer()).not.toBeNull();
    expect(composer()!.value).toBe('');
    expect(pendingRemoveButtons()).toHaveLength(0);
  });

  it('Test H: whitespace-only text cannot save; typing while capturing never closes it', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '+ Observation' }));
    fireEvent.change(composer()!, { target: { value: '   ' } });
    expect((screen.getByRole('button', { name: 'Save observation' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(composer()!, { target: { value: 'real note now' } });
    expect((screen.getByRole('button', { name: 'Save observation' }) as HTMLButtonElement).disabled).toBe(false);
    expect(composer()).not.toBeNull();
  });

  it('Test I: adding a photo to an EXISTING observation writes via onAddMedia and never leaves the tile', async () => {
    const observation: MeetingObservation = {
      id: 'o1',
      user_id: 'u1',
      meeting_id: 'm-1',
      text: 'Existing evidence.',
      captured_at: '2026-06-01T10:00:00.000Z',
      created_at: '2026-06-01T10:00:00.000Z',
    };
    const onAddMedia = vi.fn(async () => true);
    render(
      <MeetingObservationTile
        observation={observation}
        media={[]}
        saving={false}
        variant="detail"
        onAddMedia={onAddMedia}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '+ Photo' }));
    await pickPhoto('tile-add.jpg');

    await waitFor(() => expect(onAddMedia).toHaveBeenCalledTimes(1));
    const addCalls = onAddMedia.mock.calls as unknown as [string, CapturedMedia][];
    const [id, captured] = addCalls[0];
    expect(id).toBe('o1');
    expect(captured.mediaType).toBe('photo');
    expect(captured.uri.startsWith('idb://')).toBe(true);

    // Still the same detail tile: no edit lane, no navigation, no close.
    expect(screen.queryByPlaceholderText(COMPOSER_PLACEHOLDER)).toBeNull();
    expect(screen.getByText('Existing evidence.')).not.toBeNull();
    expect(screen.getByRole('button', { name: '+ Photo' })).not.toBeNull();
  });
});