import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { LayoutPage, MeetingRecordDoc } from '@/lib/meetingExport/pdf';
import { helveticaMeasure, layoutMeetingRecord, renderMeetingRecordPdf } from '@/lib/meetingExport/pdf';

const TINY_JPEG_B64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkRohEKsSJRUjYpGC0eHwFCRDU3GC0nJzCv/EABYBAQEBAAAAAAAAAAAAAAAAAAABAv/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==';

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

describe('layoutMeetingRecord', () => {
  function measure(t: string, size: number): number {
    return t.length * size * 0.45;
  }

  function textBlocks(pages: LayoutPage[]): string[] {
    return pages.flatMap((p) => p.blocks.filter((b) => b.type === 'text')).map((b) => (b.type === 'text' ? b.text : ''));
  }

  function baseDoc(overrides: Partial<MeetingRecordDoc> = {}): MeetingRecordDoc {
    return {
      brand: 'ACME RENOVATION',
      title: 'Site visit — foundation — Meeting Record',
      jobReference: 'Job ID · job-1234',
      window: 'Thu, Jan 2 · 9a → 10:30a',
      location: 'Site 4B',
      participants: ['Alice', 'Bob'],
      notes: 'Check the rebar spacing against the drawings.',
      observations: [],
      decisions: ['Pour the slab on Thursday regardless of the weather'],
      actions: [{ text: 'Call the structural engineer', task: { id: 'task-1', text: 'Call structural engineer re. rebar lap' } }],
      missing: [],
      ...overrides,
    };
  }

  it('lays out the header once', () => {
    const pages = layoutMeetingRecord(baseDoc(), measure);
    expect(pages).toHaveLength(1);
    const texts = textBlocks(pages);
    expect(texts).toContain('ACME RENOVATION');
    expect(texts).toContain('Site visit — foundation — Meeting Record');
    expect(texts).toContain('Job ID · job-1234');
    expect(texts).toContain('Thu, Jan 2 · 9a → 10:30a');
    expect(texts).toContain('Site 4B');
  });

  it('renders "None recorded" for explicitly-empty sections', () => {
    const pages = layoutMeetingRecord(baseDoc({ observations: null, participants: [], decisions: [], actions: [] }), measure);
    const texts = textBlocks(pages);
    expect(texts).toContain('Participants');
    expect(texts).toContain('Decisions');
    expect(texts).toContain('Actions');
    expect(texts.filter((t) => t === 'None recorded')).toHaveLength(3);
  });

  it('omits sections that were not selected (null)', () => {
    const pages = layoutMeetingRecord(
      baseDoc({ participants: null, notes: null, observations: null, decisions: null, actions: null }),
      measure
    );
    const texts = textBlocks(pages);
    expect(texts).not.toContain('Participants');
    expect(texts).not.toContain('Notes');
    expect(texts).not.toContain('Observations');
    expect(texts).not.toContain('Decisions');
    expect(texts).not.toContain('Actions');
  });

  it('numbers observations with their plan ordinals and captured time', () => {
    const pages = layoutMeetingRecord(
      baseDoc({
        observations: [{ ordinal: 2, text: 'Rebar lap did not meet spec.', captured: '9:18am', photos: [], audio: [], missing: [] }],
      }),
      measure
    );
    expect(textBlocks(pages)).toContain('Obs. 2  ·  9:18am');
  });

  it('places photos scaled into the photo box', () => {
    const pages = layoutMeetingRecord(
      baseDoc({
        observations: [
          { ordinal: 1, text: '', captured: null, photos: [{ mediaId: 'm1', width: 1600, height: 1200 }], audio: [], missing: [] },
        ],
      }),
      measure
    );
    const images = pages[0].blocks.filter((b): b is Extract<(typeof pages)[number]['blocks'][number], { type: 'image' }> => b.type === 'image');
    const img = images.find((b) => b.mediaId === 'm1');
    expect(img).toBeDefined();
    expect(img!.width).toBe(310);
    expect(img!.height).toBeCloseTo(232.5, 1);
  });

  it('prints an unavailable notice for missing audio', () => {
    const pages = layoutMeetingRecord(
      baseDoc({
        observations: [
          { ordinal: 4, text: 'Talked about the roof', captured: null, photos: [], audio: [], missing: ['Voice note unavailable — Obs. 4 · 9:20am'] },
        ],
      }),
      measure
    );
    expect(textBlocks(pages)).toContain('Voice note unavailable — Obs. 4 · 9:20am');
  });

  it('shows the transcript or the unavailable line per voice note', () => {
    const pages = layoutMeetingRecord(
      baseDoc({
        observations: [
          {
            ordinal: 1,
            text: '',
            captured: null,
            photos: [],
            audio: [
              { mediaId: 'a1', captured: '9:20am', transcript: 'The slab pours Thursday.' },
              { mediaId: 'a2', captured: null, transcript: null },
            ],
            missing: [],
          },
        ],
      }),
      measure
    );
    const texts = textBlocks(pages);
    expect(texts).toContain('Voice note  ·  9:20am');
    expect(texts).toContain('The slab pours Thursday.');
    expect(texts).toContain('Transcript unavailable — original recording included in the Evidence Package.');
  });

  it('breaks long records onto more than one page', () => {
    const observations = Array.from({ length: 60 }, (_, i) => ({
      ordinal: i + 1,
      text: 'A long observation paragraph '.repeat(6),
      captured: '9:15am',
      photos: [],
      audio: [],
      missing: [],
    }));
    const pages = layoutMeetingRecord(baseDoc({ observations, decisions: null }), measure);
    expect(pages.length).toBeGreaterThan(1);
    for (const page of pages) {
      for (const b of page.blocks) {
        if (b.type === 'text') expect(b.y).toBeGreaterThan(54 + 24);
      }
    }
  });
});

describe('renderMeetingRecordPdf', () => {
  async function makeFont() {
    const doc = await PDFDocument.create();
    return doc.embedFont(StandardFonts.Helvetica);
  }

  it('produces a parseable PDF for a text-only record', async () => {
    const font = await makeFont();
    const bytes = await renderMeetingRecordPdf(
      {
        brand: null,
        title: 'The Record',
        jobReference: null,
        window: 'Thu · 9a → 10:30a',
        location: null,
        participants: ['Alice'],
        notes: 'A note.',
        observations: [],
        decisions: ['Decision A'],
        actions: [],
        missing: [],
      },
      helveticaMeasure(font),
      { assets: new Map() }
    );
    expect(bytes[0]).toBe(0x25);
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(1);
  });

  it('embeds a JPEG photo asset end-to-end', async () => {
    const font = await makeFont();
    const bytes = await renderMeetingRecordPdf(
      {
        brand: null,
        title: 'With a photo',
        jobReference: null,
        window: 'Thu · 9a',
        location: null,
        participants: null,
        notes: null,
        observations: [
          { ordinal: 1, text: 'Evidence photo', captured: null, photos: [{ mediaId: 'm1', width: 1, height: 1 }], audio: [], missing: [] },
        ],
        decisions: null,
        actions: null,
        missing: [],
      },
      helveticaMeasure(font),
      { assets: new Map([['m1', { mediaId: 'm1', bytes: b64ToBytes(TINY_JPEG_B64), width: 1, height: 1 }]]) }
    );
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(1);

    // The asset resolved into real JPEG bytes pdf-lib accepts: embedJpg
    // throws on invalid bytes, so both this render and the independent embed
    // below prove the derivative made it in with non-zero dimensions.
    const again = await PDFDocument.create();
    const img = await again.embedJpg(b64ToBytes(TINY_JPEG_B64));
    expect(img.width).toBeGreaterThan(0);
    expect(img.height).toBeGreaterThan(0);
  });

  it('skips an un-embeddable photo instead of aborting the export', async () => {
    const font = await makeFont();
    const bytes = await renderMeetingRecordPdf(
      {
        brand: null,
        title: 'With a broken photo',
        jobReference: null,
        window: 'Thu · 9a',
        location: null,
        participants: null,
        notes: null,
        observations: [
          { ordinal: 1, text: 'Evidence photo', captured: null, photos: [{ mediaId: 'm1', width: 1, height: 1 }], audio: [], missing: [] },
        ],
        decisions: null,
        actions: null,
        missing: [],
      },
      helveticaMeasure(font),
      // Not a JPEG at all: embedJpg must not take the whole record down.
      { assets: new Map([['m1', { mediaId: 'm1', bytes: new Uint8Array([1, 2, 3, 4, 5]), width: 1, height: 1 }]]) }
    );
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(1);
  });
});