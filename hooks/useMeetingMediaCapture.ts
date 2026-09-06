import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { CapturedMedia } from '@/lib/meetingCapture';
import { saveMediaBlob } from '@/lib/mediaStore';

// One shared capture path for every Meetings surface: the observation
// composer and adding media to a saved observation. Photo = the device
// file/camera picker (permission is granted by the OS picker itself, only
// when the user taps "+ Photo"); voice = MediaRecorder, which asks for the
// microphone only when the user taps "+ Voice". The bytes of every capture
// are written to IndexedDB at the moment of capture — before any Supabase
// metadata row exists — so a reload can never lose evidence that is in
// hand, and `uri` is the stable `idb://…` reference from then on. Failures
// surface as a calm, explicit message instead of a silent no-op.
function micErrorText(err: unknown): string | null {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return 'Microphone permission was blocked. Allow the mic for voice notes — or use text and photos.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone was found on this device.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The microphone is busy elsewhere — close the other app and try again.';
  }
  return 'Could not start the microphone — try again.';
}

export function useMeetingMediaCapture() {
  const photoRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const photoHandlerRef = useRef<((m: CapturedMedia) => void) | null>(null);
  const [recording, setRecording] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Photo is event-driven (a file picker never reliably reports "cancel"),
  // so the consumer hands in a callback instead of awaiting a promise. The
  // chosen image is stored to IndexedDB immediately; only bytes that were
  // actually stored are handed back.
  function pickPhoto(onCaptured: (m: CapturedMedia) => void) {
    photoHandlerRef.current = onCaptured;
    photoRef.current?.click();
  }

  async function onPhotoInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const handler = photoHandlerRef.current;
    photoHandlerRef.current = null;
    if (!file) return;
    if (!handler) return;
    setCaptureError(null);
    let ref: string;
    try {
      ref = await saveMediaBlob(file, { mime: file.type, size: file.size });
    } catch {
      setCaptureError("Couldn't store that photo on this device — try again.");
      return;
    }
    handler({
      mediaType: 'photo',
      uri: ref,
      mime: file.type || null,
      size: file.size,
      blob: file,
      capturedAt: new Date().toISOString(),
    });
  }

  function stopRecording() {
    try {
      recorderRef.current?.stop();
    } catch {
      setRecording(false);
    }
  }

  // Voice resolves when recording stops (or fails) — the caller toggles the
  // control by listening to `recording` and calling stopRecording(). The
  // finished recording is stored to IndexedDB before it resolves.
  function captureVoice(): Promise<CapturedMedia | null> {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setCaptureError('Recording is not supported in this browser.');
      return Promise.resolve(null);
    }
    setCaptureError(null);
    return new Promise((resolve) => {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          const recorder = new MediaRecorder(stream);
          chunksRef.current = [];
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunksRef.current.push(e.data);
          };
          recorder.onstop = () => {
            stream.getTracks().forEach((t) => t.stop());
            setRecording(false);
            const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
            saveMediaBlob(blob, { mime: blob.type, size: blob.size })
              .then((ref) => {
                resolve({
                  mediaType: 'audio',
                  uri: ref,
                  mime: blob.type,
                  size: blob.size,
                  blob,
                  capturedAt: new Date().toISOString(),
                });
              })
              .catch(() => {
                setCaptureError("Couldn't store that voice note on this device — try again.");
                resolve(null);
              });
          };
          recorder.onerror = () => {
            stream.getTracks().forEach((t) => t.stop());
            setRecording(false);
            setCaptureError('Recording failed — try again.');
            resolve(null);
          };
          recorderRef.current = recorder;
          recorder.start();
          setRecording(true);
        })
        .catch((err) => {
          // Permission denied, no mic, or the mic is otherwise unavailable —
          // the photo and text paths still work. State the reason calmly.
          setRecording(false);
          setCaptureError(micErrorText(err));
          resolve(null);
        });
    });
  }

  function clearCaptureError() {
    setCaptureError(null);
  }

  return {
    photoRef,
    onPhotoInputChange,
    recording,
    captureError,
    clearCaptureError,
    pickPhoto,
    captureVoice,
    stopRecording,
  };
}
