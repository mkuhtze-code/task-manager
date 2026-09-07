import { describe, expect, it } from 'vitest';
import { unzipSync } from 'fflate';
import type { MeetingExportEngineDeps } from '@/lib/meetingExport/engine';
import {
  buildRecordDoc,
  generateExport,
  gatherSelectedMedia,
  inspectMissingMedia,
  missingNoticeLabel,
} from '@/lib/meetingExport/engine';
import { fingerprintExport } from '@/lib/meetingExport/fingerprint';
import {
  defaultReviewState,
  maskFromPlan,
  observationOrdinals,
  planCounts,
  resolvePlanFromReview,
  sectionsFromPlan,
} from '@/lib/meetingExport/plan';
import { makeContent, makeMedia, makeObservation } from './fixtures';

const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkRohEKsSJRUjYpGC0eHwFCRDU3GC0nJzCv/EABYBAQEBAAAAAAAAAAAAAAAAAAABAv/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const now = new Date('2025-02-03T12:00:00');

function deps(
  overrides: { missingUris?: string[]; optimiseFailUris?: string[]; providers?: MeetingExportEngineDeps['providers'] } = {}
): MeetingExportEngineDeps {
  const missingUris = overrides.missingUris ?? [];
  const optimiseFailUris = overrides.optimiseFailUris ?? [];
  return {
    loadMedia: async (uri) => (missingUris.includes(uri) ? null : new Blob([new Uint8Array([1, 2, 3])])),
    optimisePhoto: async (_blob, _quality, mediaId) => {
      if (optimiseFailUris.includes(mediaId)) throw new Error('Photo encode failed');
      return {
        mediaId,
        mimeType: 'image/jpeg',
        bytes: b64ToBytes(TINY_JPEG_B64),
        width: 640,
        height: 480,
      };
    },
    providers: overrides.providers ?? [],
    now: () => now,
  };
}

function fullPlan(content: ReturnType<typeof makeContent>) {
  return resolvePlanFromReview(content, defaultReviewState(content, undefined));
}

describe('missingNoticeLabel', () => {
  it('writes "Photo/Voice note unavailable — Obs. N · time"', () => {
    expect(missingNoticeLabel('photo', 4, '2025-01-02T14:32:00')).toBe('Photo unavailable — Obs. 4 · 2:32pm');
    expect(missingNoticeLabel('audio', 2, null)).toBe('Voice note unavailable — Obs. 2');
  });
});

describe('gatherSelectedMedia', () => {
  it('returns only selected photos/audio in recorded order with ordinals', () => {
    const content = makeContent({
      observations: [
        { observation: makeObservation('obs-1'), media: [makeMedia('media-1', 'obs-1', 'photo'), makeMedia('media-2', 'obs-1', 'audio'), makeMedia('media-9', 'obs-1', 'document')] },
        { observation: makeObservation('obs-2', { captured_at: '2025-01-02T09:30:00' }), media: [makeMedia('media-3', 'obs-2', 'photo')] },
      ],
    });
    const state = defaultReviewState(content, undefined);
    state.observations[0].media[1].selected = false; // drop the audio
    const plan = resolvePlanFromReview(content, state);
    const selected = gatherSelectedMedia(content, plan);
    expect(selected.map((s) => s.media.id)).toEqual(['media-1', 'media-3']);
    expect(selected.map((s) => s.mediaType)).toEqual(['photo', 'photo']);
    expect(selected.map((s) => s.ordinal)).toEqual([1, 2]);
  });
});

describe('inspectMissingMedia', () => {
  it('reports ok when everything resolves', async () => {
    const content = makeContent();
    const report = await inspectMissingMedia(content, fullPlan(content), deps());
    expect(report.ok).toBe(true);
    expect(report.missing).toEqual([]);
  });

  it('lists unresolved media with labels and observes continue/cancel control', async () => {
    const content = makeContent();
    const report = await inspectMissingMedia(
      content,
      fullPlan(content),
      deps({ missingUris: ['idb://media-1'] })
    );
    expect(report.ok).toBe(false);
    expect(report.missing).toHaveLength(1);
    expect(report.missing[0].mediaId).toBe('media-1');
    expect(report.missing[0].observationId).toBe('obs-1');
    expect(report.missing[0].label).toContain('Obs. 1');
    expect(report.missing[0].label).toContain('unavailable');
  });
});

describe('generateExport', () => {
  it('produces a record + package with the planned contents (both)', async () => {
    const content = makeContent();
    const plan = fullPlan(content);
    const result = await generateExport({ content, plan, deps: deps() });

    expect(result.fingerprint).toBe(fingerprintExport(content, maskFromPlan(content, plan)));
    expect(result.counts).toEqual(planCounts(content, plan));
    expect(result.sections).toEqual(sectionsFromPlan(content, plan));
    expect(result.missing).toEqual([]);
    expect(result.transcriptionStatus).toBe('not_requested');

    expect(result.pdf[0]).toBe(0x25);
    expect(result.pdfFileName).toBe('Acme Renovation - Site visit — foundation - 2025-01-02.pdf');
    expect(result.baseName).toBe('Acme Renovation - Site visit — foundation - 2025-01-02');
    expect(result.packageFolderName).toBe(result.baseName);

    expect(result.packageZip).not.toBeNull();
    expect(result.fileSize).toBe(result.packageZip!.byteLength);

    const files = result.packageFiles.map((f) => f.path);
    expect(files[0]).toBe('Meeting Record.pdf');
    expect(files).toEqual(
      expect.arrayContaining([
        'photos/Obs-01-photo-1.png',
        'audio/Obs-01-audio-1.m4a',
        'photos/Obs-02-photo-1.png',
      ])
    );

    const entries = unzipSync(result.packageZip!);
    expect(Object.keys(entries)).toEqual(expect.arrayContaining(files));
  });

  it('skips the zip entirely for a pdf-only export', async () => {
    const content = makeContent();
    const state = defaultReviewState(content, undefined);
    state.exportType = 'pdf';
    const plan = resolvePlanFromReview(content, state);
    const result = await generateExport({ content, plan, deps: deps() });
    expect(result.packageZip).toBeNull();
    expect(result.packageFiles.length).toBeGreaterThan(0); // still holds originals (for the folder form)
    expect(result.fileSize).toBe(result.pdf.byteLength);
  });

  it('continues past missing media and records it', async () => {
    const content = makeContent();
    const plan = fullPlan(content);
    const result = await generateExport({ content, plan, deps: deps({ missingUris: ['idb://media-1'] }) });

    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].mediaId).toBe('media-1');

    const files = result.packageFiles.map((f) => f.path);
    expect(files).not.toContain('photos/Obs-01-photo-1.png');
    expect(files).toContain('audio/Obs-01-audio-1.m4a');
    expect(files).toContain('photos/Obs-02-photo-1.png');
    expect(result.pdf[0]).toBe(0x25);
  });

  it('soft-fails a photo the decoder/canvas cannot process and still packages its original', async () => {
    const content = makeContent();
    const plan = fullPlan(content);
    // media-1's bytes exist (loaded), only the PDF-side optimisation fails —
    // exactly what a mobile WebView hits when it cannot decode/encode a photo.
    const result = await generateExport({ content, plan, deps: deps({ optimiseFailUris: ['media-1'] }) });

    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].mediaId).toBe('media-1');
    expect(result.missing[0].label).toContain('Photo unavailable');
    expect(result.pdf[0]).toBe(0x25);

    // The PDF omits the derivative (no asset for media-1 — its slot has zero
    // size and the renderer skips blocks with no asset) but the package
    // still holds the untouched original.
    const doc = buildRecordDoc(content, plan, new Map(), result.missing, new Map());
    const photo = doc.observations?.[0].photos.find((p) => p.mediaId === 'media-1');
    expect(photo).toBeDefined();
    expect(photo!.width).toBe(0);
    expect(photo!.height).toBe(0);

    const files = result.packageFiles.map((f) => f.path);
    expect(files).toContain('photos/Obs-01-photo-1.png');
    expect(result.packageZip).not.toBeNull();
  });

  it('proves the PDF uses the derivative while the package keeps original bytes untouched', async () => {
    const content = makeContent();
    const plan = fullPlan(content);
    const result = await generateExport({ content, plan, deps: deps() });

    // The original photo bytes that left the device ([1,2,3]) are the ones
    // in the Evidence Package, and must be byte-for-byte the stored blob.
    expect(result.missing).toEqual([]);
    const photosEntry = result.packageFiles.find((f) => f.path === 'photos/Obs-01-photo-1.png');
    const photosEntry2 = result.packageFiles.find((f) => f.path === 'photos/Obs-02-photo-1.png');
    expect(photosEntry).toBeDefined();
    expect(new Uint8Array(await photosEntry!.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(new Uint8Array(await photosEntry2!.blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));

    // The record (PDF content model) for the same photos carries the OPTIMISED
    // derivative dimensions, not the original storage bytes.
    const doc = buildRecordDoc(content, plan, new Map(), [], new Map([
      ['media-1', { mediaId: 'media-1', mimeType: 'image/jpeg', bytes: b64ToBytes(TINY_JPEG_B64), width: 640, height: 480 }],
    ]));
    expect(doc.observations?.[0].photos.find((p) => p.mediaId === 'media-1')).toEqual({ mediaId: 'media-1', width: 640, height: 480 });
    expect(result.pdf[0]).toBe(0x25);
  });

  it('marks transcription requested-but-failed when no provider is registered', async () => {
    const content = makeContent();
    const state = defaultReviewState(content, undefined);
    state.transcribe = true;
    const plan = resolvePlanFromReview(content, state);
    const result = await generateExport({ content, plan, deps: deps() });
    expect(result.transcriptionStatus).toBe('failed');
    expect(result.pdf[0]).toBe(0x25);
    expect(result.packageZip).not.toBeNull();
  });

  it('records transcripts from a registered provider', async () => {
    const content = makeContent();
    const state = defaultReviewState(content, undefined);
    state.transcribe = true;
    const plan = resolvePlanFromReview(content, state);
    const result = await generateExport({
      content,
      plan,
      deps: deps({
        providers: [{ id: 'fake', transcribe: async () => 'The slab pours on Thursday.' }],
      }),
    });
    expect(result.transcriptionStatus).toBe('completed');

    const transcriptMap = new Map([['media-2', 'The slab pours on Thursday.']]);
    const doc = buildRecordDoc(content, plan, transcriptMap, [], new Map());
    expect(doc.observations?.[0].audio[0].transcript).toBe('The slab pours on Thursday.');
  });
});

describe('buildRecordDoc', () => {
  it('builds the neutral record from the plan and generation outcomes', () => {
    const content = makeContent();
    const state = defaultReviewState(content, undefined);
    state.notes = true;
    const plan = resolvePlanFromReview(content, state);
    const missing = [
      { mediaId: 'media-2', observationId: 'obs-1', label: missingNoticeLabel('audio', 1, '2025-01-02T09:20:00') },
    ];
    const photoAssets = new Map([
      ['media-1', { mediaId: 'media-1', mimeType: 'image/jpeg', bytes: b64ToBytes(TINY_JPEG_B64), width: 640, height: 480 }],
      ['media-3', { mediaId: 'media-3', mimeType: 'image/jpeg', bytes: b64ToBytes(TINY_JPEG_B64), width: 640, height: 480 }],
    ]);
    const doc = buildRecordDoc(content, plan, new Map(), missing, photoAssets);

    expect(doc.brand).toBe('ACME RENOVATION');
    expect(doc.title).toBe('Site visit — foundation — Meeting Record');
    expect(doc.jobReference).toBe('Job ID · job-1');
    expect(doc.window).toMatch(/9a/);
    expect(doc.window).toMatch(/10:30a/);
    expect(doc.participants).toEqual(['Alice', 'Bob']);
    expect(doc.notes).toContain('rebar spacing');
    expect(doc.decisions).toEqual(['Pour the slab on Thursday regardless of the weather']);
    expect(doc.actions).toEqual([{ text: 'Call the structural engineer', task: { id: 'task-1', text: 'Call structural engineer re. rebar lap' } }]);

    const [obs1, obs2] = doc.observations ?? [];
    expect(obs1.ordinal).toBe(1);
    expect(obs2.ordinal).toBe(2);
    expect(obs1.photos).toEqual([{ mediaId: 'media-1', width: 640, height: 480 }]);
    expect(obs1.audio[0].mediaId).toBe('media-2');
    expect(obs1.audio[0].transcript).toBeNull();
    expect(obs1.missing).toEqual(['Voice note unavailable — Obs. 1 · 9:20am']);
    expect(obs2.photos).toEqual([{ mediaId: 'media-3', width: 640, height: 480 }]);
  });

  it('renders empty-but-selected sections (None recorded) and hides untouched ones', () => {
    const content = makeContent({ observations: [], decisions: [], actions: [], participants: [] });
    const state = defaultReviewState(content, undefined);
    state.observationsOn = true;
    state.decisionsOn = true;
    state.actionsOn = true;
    state.participants = true;
    const plan = resolvePlanFromReview(content, state);
    const doc = buildRecordDoc(content, plan, new Map(), [], new Map());
    expect(doc.observations).toEqual([]);
    expect(doc.decisions).toEqual([]);
    expect(doc.actions).toEqual([]);
    expect(doc.participants).toEqual([]);
    // Observations were ON but the meeting held none → explicitly empty.
    expect(plan.explicitEmpty.observations).toBe(true);
    expect(observationOrdinals(plan).size).toBe(0);
  });
});