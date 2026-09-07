import { zip } from 'fflate';
import type { Zippable } from 'fflate';
import type { MeetingExportContent } from './types';
import { localDateStr } from '@/lib/timeFormat';
import { meetingLocalDate } from '@/lib/meetingUtils';

// ── Evidence Package ──────────────────────────────────────────────────
// The other half of an export: the ORIGINAL, untouched media alongside the
// neutral Meeting Record PDF. Constructed in memory (for Share) from the
// same path list it would use to drop a folder on disk; when the platform
// delivers folders, the ZIP below is the portable interchange form. Nothing
// here copies to Supabase — the package is assembled from the same
// device-local bytes the meeting already owns.

export type MeetingPackageFile = {
  path: string;
  blob: Blob;
};

export type MeetingPackagePhoto = {
  mediaId: string;
  ordinal: number;
  mimeType: string | null;
  blob: Blob;
};

export type MeetingPackageAudio = {
  mediaId: string;
  ordinal: number;
  mimeType: string | null;
  blob: Blob;
};

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'audio/webm': '.webm',
  'audio/mp4': '.m4a',
  'audio/m4a': '.m4a',
  'audio/x-m4a': '.m4a',
  'audio/aac': '.aac',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/ogg': '.ogg',
  'audio/opus': '.opus',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/flac': '.flac',
};

// The original byte's own extension, guessed from its mime type so the
// packaged file opens as what it is. Unknown → `.bin` (the bytes remain
// byte-for-byte original either way).
export function fileExtension(mimeType: string | null | undefined): string {
  if (!mimeType) return '.bin';
  return EXTENSION_BY_MIME[mimeType.toLowerCase().split(';')[0].trim()] ?? '.bin';
}

// photos/Obs-04-photo-1.jpg / audio/Obs-04-audio-2.m4a — observation
// ordinal matched to the PDF's "Obs. 4" numbering, per-type index within
// the observation.
export function mediaPath(kind: 'photo' | 'audio', ordinal: number, index: number, mimeType: string | null): string {
  const num = String(ordinal).padStart(2, '0');
  const dir = kind === 'photo' ? 'photos' : 'audio';
  return `${dir}/Obs-${num}-${kind}-${index}${fileExtension(mimeType)}`;
}

export async function buildEvidencePackage(opts: {
  pdfBytes: Uint8Array;
  photos: MeetingPackagePhoto[];
  audio: MeetingPackageAudio[];
}): Promise<MeetingPackageFile[]> {
  const files: MeetingPackageFile[] = [
    // Copy into a fresh ArrayBuffer so the Blob accepts pdf-lib's bytes on
    // every TS/JS engine (ArrayBufferLike vs ArrayBuffer typing).
    { path: 'Meeting Record.pdf', blob: new Blob([new Uint8Array(opts.pdfBytes)], { type: 'application/pdf' }) },
  ];
  const photoIndex = new Map<number, number>();
  for (const photo of opts.photos) {
    const index = (photoIndex.get(photo.ordinal) ?? 0) + 1;
    photoIndex.set(photo.ordinal, index);
    files.push({ path: mediaPath('photo', photo.ordinal, index, photo.mimeType), blob: photo.blob });
  }
  const audioIndex = new Map<number, number>();
  for (const audio of opts.audio) {
    const index = (audioIndex.get(audio.ordinal) ?? 0) + 1;
    audioIndex.set(audio.ordinal, index);
    files.push({ path: mediaPath('audio', audio.ordinal, index, audio.mimeType), blob: audio.blob });
  }
  return files;
}

// Portable ZIP form of the evidence package (fflate, no Node deps).
export function zipMeetingPackage(files: MeetingPackageFile[]): Promise<Uint8Array> {
  const tree: Zippable = {};
  return (async () => {
    for (const file of files) {
      tree[file.path] = new Uint8Array(await file.blob.arrayBuffer());
    }
    return new Promise<Uint8Array>((resolve, reject) => {
      zip(tree, { level: 6 }, (err, out) => (err ? reject(err) : resolve(new Uint8Array(out))));
    });
  })();
}

// ── File naming ───────────────────────────────────────────────────────
// "<Job Name> - <Meeting Title> - <YYYY-MM-DD>" everywhere: the standalone
// PDF is <base>.pdf, the evidence-package folder/ZIP is <base>.
export function sanitizeFileNamePart(part: string): string {
  return part
    .replace(/[\/\\:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

export function exportBaseName(content: MeetingExportContent, now: Date = new Date()): string {
  const job = content.job?.name ? sanitizeFileNamePart(content.job.name) : null;
  const meetingTitle = sanitizeFileNamePart(content.meeting.text);
  const title = meetingTitle.length > 0 ? meetingTitle : 'Meeting';
  const datePart = meetingLocalDate(content.meeting.start_time) ?? localDateStr(now);
  return [job, title, datePart].filter((p): p is string => Boolean(p)).join(' - ');
}

export function exportPdfFileName(content: MeetingExportContent, now: Date = new Date()): string {
  return `${exportBaseName(content, now)}.pdf`;
}

export function exportPackageFolderName(content: MeetingExportContent, now: Date = new Date()): string {
  return exportBaseName(content, now);
}