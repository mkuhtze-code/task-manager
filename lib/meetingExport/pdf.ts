import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';

// ── Meeting Record PDF ────────────────────────────────────────────────
// The neutral, printable record: a plain document, no branding, no cover
// page. Layout is computed PURELY (a text measurer is injected) so the
// structure — pages, `Obs. N` numbering, "None recorded", footer page
// numbers, photo placement — is unit-testable in Node without pdf-lib or
// image bytes. renderMeetingRecordPdf() turns the layout into bytes with
// pdf-lib; embedding needs the optimised JPEG assets, which only the engine
// produces (and tests can omit when they only exercise layout).

export const PAGE_W = 595.28; // A4
export const PAGE_H = 841.89;
export const MARGIN = 54;
export const CONTENT_W = PAGE_W - MARGIN * 2;
export const CONTENT_BOTTOM = MARGIN + 24;
export const FOOTER_Y = MARGIN + 8;

const BODY_SIZE = 10;
const BODY_LINE = 13.5;
const HEADING_SIZE = 10.5;
const HEADING_LINE = 14;
const TITLE_SIZE = 18;
const TITLE_LINE = 23;
const QUIET_SIZE = 9;
const QUIET_LINE = 12;
const ITEM_INDENT = 16;
const PHOTO_MAX_W = 310;
const PHOTO_MAX_H = 250;

const INK = rgb(0x1a / 255, 0x29 / 255, 0x33 / 255);
const SOFT = rgb(0x4a / 255, 0x5b / 255, 0x64 / 255);
const QUIET = rgb(0x74 / 255, 0x7d / 255, 0x83 / 255);

export type PdfTextMeasurer = (text: string, size: number) => number;

export type MeetingPdfPhoto = {
  mediaId: string;
  width: number;
  height: number;
};

export type MeetingPdfAudio = {
  mediaId: string;
  captured: string | null;
  transcript: string | null;
};

export type MeetingRecordObservation = {
  ordinal: number;
  text: string | null;
  captured: string | null;
  photos: MeetingPdfPhoto[];
  audio: MeetingPdfAudio[];
  // Notices printed quietly under the observation, e.g.
  // "Photo unavailable — Obs. 4 · 14:32".
  missing: string[];
};

export type MeetingRecordAction = {
  text: string;
  task: { id: string; text: string } | null;
};

// What the record shows. A section is `null` when it was NOT selected for
// this export; an empty array/string means the section was selected but
// holds nothing recorded ("None recorded"). Builders produce this from the
// plan; pdf.ts only lays it out and renders it.
export type MeetingRecordDoc = {
  brand: string | null;
  title: string;
  jobReference: string | null;
  window: string;
  location: string | null;
  participants: string[] | null;
  notes: string | null;
  observations: MeetingRecordObservation[] | null;
  decisions: string[] | null;
  actions: MeetingRecordAction[] | null;
  // Meeting-level notices (none exist in V1 — media attaches to
  // observations — but the record renders them if ever present).
  missing: string[];
};

export type PlacedBlock =
  | {
      type: 'text';
      x: number;
      y: number; // baseline
      text: string;
      font: 'normal' | 'bold' | 'italic';
      size: number;
      color: 'ink' | 'soft' | 'quiet';
    }
  | { type: 'rule'; x: number; y: number; width: number }
  | { type: 'image'; x: number; y: number; width: number; height: number; mediaId: string }; // y = bottom edge

export type LayoutPage = { pageNumber: number; blocks: PlacedBlock[] };

export type MeetingPdfAsset = {
  mediaId: string;
  bytes: Uint8Array;
  width: number;
  height: number;
};

export function helveticaMeasure(font: PDFFont): PdfTextMeasurer {
  return (text, size) => font.widthOfTextAtSize(text, size);
}

// WinAnsi (pdf-lib's embedded Helvetica) can only encode CP1252. Notes,
// transcripts, windows ("9a → 10:30a") and decisions can legitimately hold
// characters it can't (arrows, emoji, non-Latin scripts), so text is made
// safe before drawing — layout keeps measuring the original string so the
// page structure is unaffected.
const CP1252_EXT = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022,
  0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);
const WINANSI_FALLBACK: Record<number, string> = {
  0x2190: '<-',
  0x2191: '^',
  0x2192: '->',
  0x2193: 'v',
  0x2194: '<->',
};

export function winAnsiSafe(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || CP1252_EXT.has(code)) {
      out += ch;
    } else {
      out += WINANSI_FALLBACK[code] ?? ' ';
    }
  }
  return out;
}

function wrapToWidth(text: string, size: number, width: number, measure: PdfTextMeasurer): string[] {
  const lines: string[] = [];
  for (const raw of text.split('\n')) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (current && measure(candidate, size) > width) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

// ── Pure layout ───────────────────────────────────────────────────────
export function layoutMeetingRecord(doc: MeetingRecordDoc, measure: PdfTextMeasurer): LayoutPage[] {
  const pages: LayoutPage[] = [];
  let page: LayoutPage = { pageNumber: 1, blocks: [] };
  let y = PAGE_H - MARGIN;

  function newPage(): LayoutPage {
    page = { pageNumber: pages.length + 1, blocks: [] };
    pages.push(page);
    y = PAGE_H - MARGIN;
    return page;
  }

  function ensureSpace(height: number): void {
    if (page.blocks.length > 0 && y - height < CONTENT_BOTTOM) page = newPage();
  }

  function pushLine(
    text: string,
    size: number,
    x: number,
    font: 'normal' | 'bold' | 'italic',
    color: 'ink' | 'soft' | 'quiet'
  ): void {
    const lineHeight = size * 1.3;
    if (page.blocks.length > 0 && y - lineHeight < CONTENT_BOTTOM) newPage();
    y -= lineHeight;
    page.blocks.push({ type: 'text', x, y: y + size * 0.8, text, font, size, color });
  }

  function gap(space: number): void {
    y -= space;
  }

  function rule(): void {
    if (page.blocks.length > 0 && y - 14 < CONTENT_BOTTOM) newPage();
    gap(8);
    page.blocks.push({ type: 'rule', x: MARGIN, y, width: CONTENT_W });
    gap(8);
  }

  function heading(text: string): void {
    ensureSpace(HEADING_LINE + BODY_LINE);
    gap(HEADING_LINE);
    pushLine(text, HEADING_SIZE, MARGIN, 'bold', 'ink');
  }

  function paragraph(text: string, x: number, width: number, color: 'ink' | 'soft' | 'quiet'): void {
    for (const line of wrapToWidth(text, BODY_SIZE, width, measure)) {
      pushLine(line.length > 0 ? line : ' ', BODY_SIZE, x, 'normal', color);
    }
  }

  function noneRecorded(): void {
    pushLine('None recorded', BODY_SIZE, MARGIN, 'italic', 'quiet');
  }

  function numberedItems(items: string[], prefix: string): void {
    items.forEach((text, i) => {
      const marker = `${i + 1}.`;
      const lines = wrapToWidth(text, BODY_SIZE, CONTENT_W - ITEM_INDENT - 8, measure);
      const markerWidth = measure(marker, BODY_SIZE);
      lines.forEach((line, li) => {
        const lineHeight = BODY_SIZE * 1.3;
        if (page.blocks.length > 0 && y - lineHeight < CONTENT_BOTTOM) newPage();
        y -= lineHeight;
        if (li === 0) {
          page.blocks.push({ type: 'text', x: MARGIN, y: y + BODY_SIZE * 0.8, text: marker, font: 'bold', size: BODY_SIZE, color: 'ink' });
          page.blocks.push({ type: 'text', x: MARGIN + markerWidth + 6, y: y + BODY_SIZE * 0.8, text: line, font: 'normal', size: BODY_SIZE, color: 'ink' });
        } else {
          page.blocks.push({ type: 'text', x: MARGIN + ITEM_INDENT, y: y + BODY_SIZE * 0.8, text: line, font: 'normal', size: BODY_SIZE, color: 'ink' });
        }
      });
      gap(4);
    });
  }

  function actionItem(action: MeetingRecordAction): void {
    const marker = '•';
    const lines = wrapToWidth(action.text, BODY_SIZE, CONTENT_W - ITEM_INDENT, measure);
    const markerWidth = measure(marker, BODY_SIZE);
    lines.forEach((line, li) => {
      const lineHeight = BODY_SIZE * 1.3;
      if (page.blocks.length > 0 && y - lineHeight < CONTENT_BOTTOM) newPage();
      y -= lineHeight;
      if (li === 0) {
        page.blocks.push({ type: 'text', x: MARGIN, y: y + BODY_SIZE * 0.8, text: marker, font: 'bold', size: BODY_SIZE, color: 'ink' });
        page.blocks.push({ type: 'text', x: MARGIN + markerWidth + 6, y: y + BODY_SIZE * 0.8, text: line, font: 'normal', size: BODY_SIZE, color: 'ink' });
      } else {
        page.blocks.push({ type: 'text', x: MARGIN + ITEM_INDENT, y: y + BODY_SIZE * 0.8, text: line, font: 'normal', size: BODY_SIZE, color: 'ink' });
      }
    });
    if (action.task) {
      const taskLines = wrapToWidth(`Linked task: ${action.task.text}`, QUIET_SIZE, CONTENT_W - ITEM_INDENT, measure);
      gap(2);
      for (const line of taskLines) {
        pushLine(line, QUIET_SIZE, MARGIN + ITEM_INDENT, 'italic', 'quiet');
      }
    }
    gap(4);
  }

  // ── Page 1 header ──
  newPage();
  if (doc.brand) pushLine(doc.brand, QUIET_SIZE, MARGIN, 'normal', 'quiet');
  for (const titleLine of wrapToWidth(doc.title || 'Meeting Record', TITLE_SIZE, CONTENT_W, measure)) {
    pushLine(titleLine, TITLE_SIZE, MARGIN, 'bold', 'ink');
  }
  if (doc.jobReference) pushLine(doc.jobReference, QUIET_SIZE, MARGIN, 'normal', 'quiet');
  pushLine(doc.window, QUIET_SIZE, MARGIN, 'normal', 'quiet');
  if (doc.location) pushLine(doc.location, QUIET_SIZE, MARGIN, 'normal', 'quiet');
  rule();

  if (doc.participants !== null) {
    heading('Participants');
    if (doc.participants.length === 0) noneRecorded();
    else paragraph(doc.participants.join(', '), MARGIN, CONTENT_W, 'ink');
  }

  if (doc.notes !== null) {
    heading('Notes');
    if (doc.notes.trim().length === 0) noneRecorded();
    else paragraph(doc.notes, MARGIN, CONTENT_W, 'ink');
  }

  if (doc.observations !== null) {
    if (doc.observations.length === 0) {
      heading('Observations');
      noneRecorded();
    } else {
      for (const obs of doc.observations) {
        heading(`Obs. ${obs.ordinal}${obs.captured ? `  ·  ${obs.captured}` : ''}`);
        if (obs.text && obs.text.trim().length > 0) paragraph(obs.text, MARGIN, CONTENT_W, 'ink');

        for (const photo of obs.photos) {
          const aspect = photo.height > 0 ? photo.width / photo.height : 1;
          let dw = PHOTO_MAX_W;
          let dh = dw / aspect;
          if (dh > PHOTO_MAX_H) {
            dh = PHOTO_MAX_H;
            dw = dh * aspect;
          }
          const blockH = dh + 10;
          if (page.blocks.length > 0 && y - blockH < CONTENT_BOTTOM) newPage();
          y -= 10;
          y -= dh;
          page.blocks.push({ type: 'image', x: MARGIN, y, width: dw, height: dh, mediaId: photo.mediaId });
          y -= 2;
        }

        for (const audio of obs.audio) {
          ensureSpace(BODY_LINE + BODY_LINE);
          pushLine(`Voice note${audio.captured ? `  ·  ${audio.captured}` : ''}`, BODY_SIZE, MARGIN, 'bold', 'ink');
          if (audio.transcript && audio.transcript.trim().length > 0) {
            paragraph(audio.transcript, MARGIN, CONTENT_W, 'soft');
          } else {
            pushLine(
              'Transcript unavailable — original recording included in the Evidence Package.',
              QUIET_SIZE,
              MARGIN,
              'italic',
              'quiet'
            );
          }
          gap(4);
        }

        for (const notice of obs.missing) {
          pushLine(notice, QUIET_SIZE, MARGIN, 'italic', 'quiet');
        }
        if (obs.missing.length > 0 && obs.audio.length > 0) gap(4);

        // Quiet rule after each observation: scannable notebook lines.
        rule();
      }
    }
  }

  if (doc.decisions !== null) {
    heading('Decisions');
    if (doc.decisions.length === 0) noneRecorded();
    else numberedItems(doc.decisions, '');
  }

  if (doc.actions !== null) {
    heading('Actions');
    if (doc.actions.length === 0) noneRecorded();
    else for (const action of doc.actions) actionItem(action);
  }

  for (const notice of doc.missing) {
    pushLine(notice, QUIET_SIZE, MARGIN, 'italic', 'quiet');
    gap(2);
  }

  return pages;
}

// ── Render ────────────────────────────────────────────────────────────
export type MeetingRecordRenderOptions = {
  assets: Map<string, MeetingPdfAsset>;
};

export async function renderMeetingRecordPdf(
  doc: MeetingRecordDoc,
  measure: PdfTextMeasurer,
  options: MeetingRecordRenderOptions
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  const fonts = { normal: font, bold, italic } as const;
  const colors = { ink: INK, soft: SOFT, quiet: QUIET } as const;

  const pages = layoutMeetingRecord(doc, measure);

  for (const page of pages) {
    const pdfPage = pdfDoc.addPage([PAGE_W, PAGE_H]);
    for (const block of page.blocks) {
      if (block.type === 'text') {
        pdfPage.drawText(winAnsiSafe(block.text), {
          x: block.x,
          y: block.y,
          size: block.size,
          font: fonts[block.font],
          color: colors[block.color],
        });
      } else if (block.type === 'rule') {
        pdfPage.drawRectangle({
          x: block.x,
          y: block.y - 0.5,
          width: block.width,
          height: 0.5,
          color: colors.soft,
        });
      } else if (block.type === 'image') {
        const asset = options.assets.get(block.mediaId);
        if (!asset) continue;
        try {
          const embedded = await pdfDoc.embedJpg(asset.bytes);
          pdfPage.drawImage(embedded, {
            x: block.x,
            y: block.y,
            width: block.width,
            height: block.height,
          });
        } catch (err) {
          // A derivative that somehow isn't embeddable (e.g. bytes truncated
          // by an encoder quirk) must not abort the whole export — skip the
          // image, keep the record.
          console.warn('[meetingExport:pdf] skipped a photo that pdf-lib could not embed', err, { mediaId: block.mediaId });
        }
      }
    }
    pdfPage.drawText(`${page.pageNumber} / ${pages.length}`, {
      x: PAGE_W / 2 - measure(`${page.pageNumber} / ${pages.length}`, QUIET_SIZE) / 2,
      y: FOOTER_Y,
      size: QUIET_SIZE,
      font,
      color: colors.quiet,
    });
  }

  return pdfDoc.save();
}