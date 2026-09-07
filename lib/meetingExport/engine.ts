import { PDFDocument, StandardFonts } from 'pdf-lib';
import type {
  MeetingExportContent,
  MeetingExportCounts,
  MeetingExportPlan,
  MeetingExportSections,
  MeetingExportMask,
  MeetingPdfQuality,
  MeetingTranscriptStatus,
  MissingMediaNotice,
} from './types';
import { maskFromPlan, observationOrdinals, planCounts, sectionsFromPlan } from './plan';
import { fingerprintExport } from './fingerprint';
import { transcribeAssets, type MeetingTranscriptionProvider } from './transcription';
import { optimiseMeetingPhoto, type MeetingExportPhotoAsset } from './image';
import {
  buildEvidencePackage,
  exportBaseName,
  exportPackageFolderName,
  exportPdfFileName,
  zipMeetingPackage,
  type MeetingPackageFile,
} from './package';
import {
  helveticaMeasure,
  renderMeetingRecordPdf,
  type MeetingRecordDoc,
  type MeetingRecordAction,
} from './pdf';
import { fmtMeetingWindow } from '@/lib/meetingUtils';
import { fmtCapturedAt } from '@/lib/meetingCapture';
import type { MeetingMedia } from '@/lib/meetingTypes';

// ── The export engine ────────────────────────────────────────────────
// Everything the flow needs beyond preference resolution: loading the
// selected device-local bytes, optimising the PDF photo derivatives,
// running the transcription seam, rendering the record, and assembling the
// evidence package. Deliberately thin on UI; every side effect (IDB loads,
// canvas) is injected so the control flow itself is testable in Node.
//
// Media that can no longer be resolved is never a hard failure: generation
// proceeds without it, records each piece in the PDF ("Photo unavailable —
// Obs. 4 · 14:32") and in missing_media_count. The caller decides whether
// to ask first (inspectMissingMedia → Continue/Cancel → generate).

// ── TEMPORARY DIAGNOSTICS (browser-only) ─────────────────────────────
// Stage boundaries around generateExport so a real browser/device failure
// can be attributed to a stage without swallowing anything. gated to the
// browser so the Node test suite stays quiet. Remove these helpers AND
// their diagBoundary/diag call sites once the device failure is confirmed.
const DIAG = typeof window !== 'undefined';

// Logged as warn on both sides of a boundary; the FAILED side additionally
// logs the original exception and tags the thrown error with the stage.
function diagBoundary<T>(stage: string, run: () => Promise<T>): Promise<T> {
  if (!DIAG) return run();
  console.warn(`[meetingExport:${stage}] start`);
  return run().then(
    (result) => {
      console.warn(`[meetingExport:${stage}] ok`);
      return result;
    },
    (err) => {
      (err as { diagStage?: string }).diagStage = stage;
      console.error(`[meetingExport:${stage}] FAILED`, err);
      throw err;
    }
  );
}

function diag(stage: string, context: unknown): void {
  if (!DIAG) return;
  console.warn(`[meetingExport:${stage}]`, context);
}

export type MeetingExportEngineDeps = {
  loadMedia: (localUri: string) => Promise<Blob | null>;
  optimisePhoto: (blob: Blob, quality: MeetingPdfQuality, mediaId: string) => Promise<MeetingExportPhotoAsset>;
  providers: readonly MeetingTranscriptionProvider[];
  now?: () => Date;
};

export type MeetingExportRequest = {
  content: MeetingExportContent;
  plan: MeetingExportPlan;
  deps: MeetingExportEngineDeps;
};

type SelectedMedia = {
  media: MeetingMedia;
  ordinal: number;
  mediaType: 'photo' | 'audio';
};

export function missingNoticeLabel(mediaType: 'photo' | 'audio', ordinal: number, capturedTime: string | null): string {
  const kind = mediaType === 'audio' ? 'Voice note' : 'Photo';
  const captured = capturedTime ? ` · ${fmtCapturedAt(capturedTime)}` : '';
  return `${kind} unavailable — Obs. ${ordinal}${captured}`;
}

// The device media the plan selected, in recorded (captured_at) order.
export function gatherSelectedMedia(content: MeetingExportContent, plan: MeetingExportPlan): SelectedMedia[] {
  const ordinals = observationOrdinals(plan);
  const byId = new Map(content.observations.map((o) => [o.observation.id, o]));
  const selected: SelectedMedia[] = [];
  for (const sel of plan.observations) {
    const obs = byId.get(sel.id);
    if (!obs) continue;
    const ordinal = ordinals.get(sel.id) ?? 0;
    const picked = new Set(sel.mediaIds);
    for (const m of obs.media) {
      if (picked.has(m.id) && (m.media_type === 'photo' || m.media_type === 'audio')) {
        selected.push({ media: m, ordinal, mediaType: m.media_type });
      }
    }
  }
  return selected;
}

export type MissingMediaReport = {
  missing: MissingMediaNotice[];
  ok: boolean;
};

// Check which selected media can still be resolved before any generation
// happens. This is the "Continue with missing media / Cancel" seam: the
// caller shows the report and only continues when the user accepts it.
export async function inspectMissingMedia(
  content: MeetingExportContent,
  plan: MeetingExportPlan,
  deps: MeetingExportEngineDeps
): Promise<MissingMediaReport> {
  const missing: MissingMediaNotice[] = [];
  for (const entry of gatherSelectedMedia(content, plan)) {
    const blob = await deps.loadMedia(entry.media.local_uri);
    if (!blob) {
      missing.push({
        mediaId: entry.media.id,
        observationId: entry.media.observation_id,
        label: missingNoticeLabel(entry.mediaType, entry.ordinal, entry.media.captured_at),
      });
    }
  }
  return { missing, ok: missing.length === 0 };
}

export type MeetingExportResult = {
  fingerprint: string;
  sections: MeetingExportSections;
  counts: MeetingExportCounts;
  mask: MeetingExportMask;
  missing: MissingMediaNotice[];
  pdf: Uint8Array;
  pdfFileName: string;
  packageFiles: MeetingPackageFile[];
  packageZip: Uint8Array | null;
  packageFolderName: string;
  baseName: string;
  transcriptionStatus: MeetingTranscriptStatus;
  // Size of the artifact the user receives (PDF bytes or packaged ZIP),
  // for the size tiers and the record's file_size column.
  fileSize: number;
};

export async function generateExport(request: MeetingExportRequest): Promise<MeetingExportResult> {
  const { content, plan, deps } = request;
  const now = deps.now ? deps.now() : new Date();
  const needsPackage = plan.exportType !== 'pdf';
  const selected = gatherSelectedMedia(content, plan);

  const missing: MissingMediaNotice[] = [];
  const loadedPhotos: { media: MeetingMedia; ordinal: number; blob: Blob }[] = [];
  const loadedAudio: { media: MeetingMedia; ordinal: number; blob: Blob }[] = [];

  diag('gather', { selectedMedia: selected.length, exportType: plan.exportType });
  for (const entry of selected) {
    const blob = await deps.loadMedia(entry.media.local_uri);
    if (!blob) {
      missing.push({
        mediaId: entry.media.id,
        observationId: entry.media.observation_id,
        label: missingNoticeLabel(entry.mediaType, entry.ordinal, entry.media.captured_at),
      });
      continue;
    }
    if (entry.mediaType === 'photo') loadedPhotos.push({ media: entry.media, ordinal: entry.ordinal, blob });
    else loadedAudio.push({ media: entry.media, ordinal: entry.ordinal, blob });
  }
  diag('loadMedia', { loadedPhotos: loadedPhotos.length, loadedAudio: loadedAudio.length, missing: missing.length });

  // Optimised JPEG derivatives for the record (the ORIGINALS are never
  // touched — they go into the package untouched). A photo that the
  // browser's decoder/canvas cannot process must not abort the whole export
  // on a small device: it degrades to the same soft "unavailable" notice as
  // a photo whose bytes are gone (the original still goes in the package).
  const photoAssets = new Map<string, MeetingExportPhotoAsset>();
  for (const photo of loadedPhotos) {
    try {
      photoAssets.set(photo.media.id, await deps.optimisePhoto(photo.blob, plan.pdfQuality, photo.media.id));
    } catch (err) {
      diag('optimisePhoto', { mediaId: photo.media.id, failed: true, error: (err as Error)?.message });
      if (DIAG) {
        console.warn('[meetingExport:optimisePhoto] photo could not be processed — continuing without it in the record', err, {
          mediaId: photo.media.id,
          mediaType: photo.media.media_type,
        });
      }
      missing.push({
        mediaId: photo.media.id,
        observationId: photo.media.observation_id,
        label: missingNoticeLabel('photo', photo.ordinal, photo.media.captured_at),
      });
    }
  }
  diag('optimisePhoto', { succeeded: photoAssets.size, failed: loadedPhotos.length - photoAssets.size });

  let transcripts = new Map<string, string>();
  let transcriptionStatus: MeetingTranscriptStatus = plan.transcribe ? 'requested' : 'not_requested';
  if (plan.transcribe) {
    const outcome = await diagBoundary('transcription', () =>
      transcribeAssets(
        loadedAudio.map((a) => ({
          mediaId: a.media.id,
          localUri: a.media.local_uri,
          mimeType: a.media.mime_type ?? '',
          blob: a.blob,
          capturedAt: a.media.captured_at,
        })),
        deps.providers
      )
    );
    transcripts = outcome.transcripts;
    transcriptionStatus = outcome.status;
  }

  const baseName = exportBaseName(content, now);
  const doc = buildRecordDoc(content, plan, transcripts, missing, photoAssets);
  const font = await PDFDocument.create().then((d) => d.embedFont(StandardFonts.Helvetica));
  const pdf = await diagBoundary('buildPdf', () => renderMeetingRecordPdf(doc, helveticaMeasure(font), { assets: photoAssets }));

  const packageFiles = await diagBoundary('buildPackage', () =>
    buildEvidencePackage({
      pdfBytes: pdf,
      photos: loadedPhotos.map((p) => ({
        mediaId: p.media.id,
        ordinal: p.ordinal,
        mimeType: p.media.mime_type,
        blob: p.blob,
      })),
      audio: loadedAudio.map((a) => ({
        mediaId: a.media.id,
        ordinal: a.ordinal,
        mimeType: a.media.mime_type,
        blob: a.blob,
      })),
    })
  );

  const packageZip = needsPackage ? await diagBoundary('zipPackage', () => zipMeetingPackage(packageFiles)) : null;

  const result: MeetingExportResult = {
    fingerprint: fingerprintExport(content, maskFromPlan(content, plan)),
    sections: sectionsFromPlan(content, plan),
    counts: planCounts(content, plan),
    mask: maskFromPlan(content, plan),
    missing,
    pdf,
    pdfFileName: exportPdfFileName(content, now),
    packageFiles,
    packageZip,
    packageFolderName: exportPackageFolderName(content, now),
    baseName,
    transcriptionStatus,
    fileSize: needsPackage && packageZip ? packageZip.byteLength : pdf.byteLength,
  };
  diag('generate', {
    pdfBytes: result.pdf.byteLength,
    zipBytes: result.packageZip?.byteLength ?? null,
    missing: result.missing.length,
    fileSize: result.fileSize,
  });
  return result;
}

// ── The Meeting Record (PDF content model) ───────────────────────────
// Pure: builds the neutral record document from the plan + generation
// outcomes. Sections are null only when the plan did not select them.
export function buildRecordDoc(
  content: MeetingExportContent,
  plan: MeetingExportPlan,
  transcripts: Map<string, string>,
  missing: MissingMediaNotice[],
  photoAssets: Map<string, MeetingExportPhotoAsset>
): MeetingRecordDoc {
  const byId = new Map(content.observations.map((o) => [o.observation.id, o]));
  const ordinals = observationOrdinals(plan);
  const meetingTitle = content.meeting.text.trim();

  const observations =
    plan.observations.length > 0 || plan.explicitEmpty.observations
      ? plan.observations.map((sel) => {
          const obs = byId.get(sel.id);
          const picked = new Set(sel.mediaIds);
          const photos = obs
            ? obs.media
                .filter((m) => m.media_type === 'photo' && picked.has(m.id))
                .map((m) => {
                  const asset = photoAssets.get(m.id);
                  return {
                    mediaId: m.id,
                    width: asset?.width ?? 0,
                    height: asset?.height ?? 0,
                  };
                })
            : [];
          const audio = obs
            ? obs.media
                .filter((m) => m.media_type === 'audio' && picked.has(m.id))
                .map((m) => ({
                  mediaId: m.id,
                  captured: m.captured_at ? fmtCapturedAt(m.captured_at) || null : null,
                  transcript: transcripts.get(m.id) ?? null,
                }))
            : [];
          const obsMissing = missing
            .filter((n) => n.observationId === sel.id)
            .map((n) => n.label);
          return {
            ordinal: ordinals.get(sel.id) ?? 0,
            text: obs?.observation.text ? obs.observation.text : null,
            captured: obs?.observation.captured_at ? fmtCapturedAt(obs.observation.captured_at) || null : null,
            photos,
            audio,
            missing: obsMissing,
          };
        })
      : [];

  const decisions =
    plan.decisions.length > 0 || plan.explicitEmpty.decisions
      ? plan.decisions
          .map((id) => content.decisions.find((d) => d.id === id))
          .filter((d): d is MeetingExportContent['decisions'][number] => Boolean(d))
          .map((d) => d.text)
      : null;

  const actions: MeetingRecordAction[] | null =
    plan.actions.length > 0 || plan.explicitEmpty.actions
      ? plan.actions
          .map((id) => content.actions.find((a) => a.action.id === id))
          .filter((a): a is MeetingExportContent['actions'][number] => Boolean(a))
          .map((a) => ({ text: a.action.text, task: a.task ?? null }))
      : null;

  const job = content.job;

  return {
    brand: job?.name ? job.name.toUpperCase() : null,
    title: meetingTitle.length > 0 ? `${meetingTitle} — Meeting Record` : 'Meeting Record',
    jobReference: job ? `Job ID · ${job.id.slice(0, 8)}` : null,
    window: fmtMeetingWindow(content.meeting.start_time, content.meeting.duration_mins),
    location: content.meeting.location_text,
    participants: plan.includeParticipants ? content.participants.map((p) => p.name) : null,
    notes: plan.includeNotes ? content.meeting.notes ?? '' : null,
    observations: plan.observations.length > 0 || plan.explicitEmpty.observations ? observations : null,
    decisions,
    actions,
    missing: missing.filter((n) => n.observationId === null).map((n) => n.label),
  };
}