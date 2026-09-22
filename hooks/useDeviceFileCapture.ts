'use client';

import { useRef, useState, type ChangeEvent, type DragEvent, type RefObject } from 'react';
import { saveMediaBlob } from '@/lib/mediaStore';
import type { CapturedMedia } from '@/lib/meetingCapture';

export type CapturedFile = CapturedMedia & {
  originalName?: string | null;
};

function mediaTypeFromFile(file: File): CapturedMedia['mediaType'] {
  const t = (file.type || '').toLowerCase();
  if (t.startsWith('image/')) return 'photo';
  if (t.startsWith('audio/')) return 'audio';
  return 'document';
}

/**
 * Device-aware capture for Jobs (and Meetings → job files).
 * Mobile: camera + file picker. Desktop: file picker + drag-and-drop.
 * No JSX here — callers render the hidden inputs using photoRef/fileRef.
 */
export function useDeviceFileCapture() {
  const photoRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const photoHandlerRef = useRef<((m: CapturedFile) => void) | null>(null);
  const fileHandlerRef = useRef<((m: CapturedFile) => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  async function storeFile(file: File): Promise<CapturedFile | null> {
    setError(null);
    try {
      const ref = await saveMediaBlob(file, { mime: file.type, size: file.size });
      return {
        mediaType: mediaTypeFromFile(file),
        uri: ref,
        mime: file.type || null,
        size: file.size,
        blob: file,
        capturedAt: new Date().toISOString(),
        originalName: file.name || null,
      };
    } catch {
      setError("Couldn't store that file on this device — try again.");
      return null;
    }
  }

  function pickPhoto(onCaptured: (m: CapturedFile) => void) {
    photoHandlerRef.current = onCaptured;
    photoRef.current?.click();
  }

  function pickFile(onCaptured: (m: CapturedFile) => void) {
    fileHandlerRef.current = onCaptured;
    fileRef.current?.click();
  }

  async function onPhotoChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const handler = photoHandlerRef.current;
    photoHandlerRef.current = null;
    if (!file || !handler) return;
    setBusy(true);
    const m = await storeFile(file);
    setBusy(false);
    if (m) handler(m);
  }

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    const handler = fileHandlerRef.current;
    fileHandlerRef.current = null;
    if (!file || !handler) return;
    setBusy(true);
    const m = await storeFile(file);
    setBusy(false);
    if (m) handler(m);
  }

  function bindDropTarget(onCaptured: (m: CapturedFile) => void) {
    return {
      onDragEnter: (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
      },
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(true);
      },
      onDragLeave: (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
      },
      onDrop: async (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        const file = e.dataTransfer?.files?.[0];
        if (!file) return;
        setBusy(true);
        const m = await storeFile(file);
        setBusy(false);
        if (m) onCaptured(m);
      },
    };
  }

  return {
    pickPhoto,
    pickFile,
    bindDropTarget,
    busy,
    error,
    dragOver,
    setError,
    photoRef: photoRef as RefObject<HTMLInputElement>,
    fileRef: fileRef as RefObject<HTMLInputElement>,
    onPhotoChange,
    onFileChange,
  };
}
