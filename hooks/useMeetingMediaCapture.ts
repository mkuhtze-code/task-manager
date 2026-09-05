import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { CapturedMedia } from '@/lib/meetingCapture';

// One shared capture path for every Meetings surface: the observation
// composer, adding media to a saved observation, and the meeting photo
// gallery. Photo = the device file/camera picker; voice = MediaRecorder.
// The output is always a device-local CapturedMedia (a blob URL) — nothing
// is uploaded, stored server-side or transcribed.
export function useMeetingMediaCapture() {
  const photoRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const photoHandlerRef = useRef<((m: CapturedMedia) => void) | null>(null);
  const [recording, setRecording] = useState(false);

  // Photo is event-driven (a file picker never reliably reports "cancel"),
  // so the consumer hands in a callback instead of awaiting a promise.
  function pickPhoto(onCaptured: (m: CapturedMedia) => void) {
    photoHandlerRef.current = onCaptured;
    photoRef.current?.click();
  }

  function onPhotoInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const handler = photoHandlerRef.current;
    photoHandlerRef.current = null;
    if (handler && file) {
      handler({
        mediaType: 'photo',
        uri: URL.createObjectURL(file),
        mime: file.type || null,
        size: file.size,
      });
    }
  }

  function stopRecording() {
    try {
      recorderRef.current?.stop();
    } catch {
      setRecording(false);
    }
  }

  // Voice resolves when recording stops (or fails) — the caller toggles the
  // control by listening to `recording` and calling stopRecording().
  function captureVoice(): Promise<CapturedMedia | null> {
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      return Promise.resolve(null);
    }
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
            resolve({
              mediaType: 'audio',
              uri: URL.createObjectURL(blob),
              mime: blob.type,
              size: blob.size,
            });
          };
          recorder.onerror = () => {
            stream.getTracks().forEach((t) => t.stop());
            setRecording(false);
            resolve(null);
          };
          recorderRef.current = recorder;
          recorder.start();
          setRecording(true);
        })
        .catch(() => {
          // Permission denied or no mic — the photo button still works.
          setRecording(false);
          resolve(null);
        });
    });
  }

  return { photoRef, onPhotoInputChange, recording, pickPhoto, captureVoice, stopRecording };
}