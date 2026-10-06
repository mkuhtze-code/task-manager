/**
 * Travel vault — bookings, flights, tickets, emails, notes on a trip.
 * Deterministic helpers only; no LLM.
 */

export type TravelDocType =
  | 'flight'
  | 'booking'
  | 'ticket'
  | 'email'
  | 'note'
  | 'other';

export type TravelDocSource = 'manual' | 'paste' | 'speech' | 'upload';

export type TravelDocument = {
  id: string;
  user_id: string;
  trip_id: string;
  trip_day_id: string | null;
  doc_type: TravelDocType;
  title: string;
  body: string | null;
  reference_code: string | null;
  carrier: string | null;
  location_text: string | null;
  starts_at: string | null;
  ends_at: string | null;
  storage_path: string | null;
  original_filename: string | null;
  activity_id: string | null;
  source: TravelDocSource;
  created_at: string;
  updated_at: string;
};

export type TravelDocumentInsert = {
  trip_id: string;
  user_id: string;
  doc_type: TravelDocType;
  title: string;
  body?: string | null;
  reference_code?: string | null;
  carrier?: string | null;
  location_text?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  trip_day_id?: string | null;
  source?: TravelDocSource;
};

export const TRAVEL_DOC_TYPE_OPTIONS: Array<{ value: TravelDocType; label: string }> = [
  { value: 'flight', label: 'Flight' },
  { value: 'booking', label: 'Booking' },
  { value: 'ticket', label: 'Ticket' },
  { value: 'email', label: 'Email' },
  { value: 'note', label: 'Note' },
  { value: 'other', label: 'Other' },
];

/** Light extraction from pasted confirmation / speech transcript. */
export function interpretTravelPaste(raw: string): Partial<TravelDocumentInsert> & {
  doc_type: TravelDocType;
  title: string;
} {
  const text = raw.replace(/\s+/g, ' ').trim();

  let doc_type: TravelDocType = 'note';
  if (
    /\b(?:flight|boarding\s*pass|depart(?:ure|s)?|arrival|gate\s*[a-z]?\d+)\b/i.test(text) ||
    /\b[A-Z]{2}\s?\d{1,4}\b/.test(text)
  ) {
    doc_type = 'flight';
  } else if (
    /\b(?:booking|reservation|confirmation|hotel|motel|airbnb|rental\s*car)\b/i.test(text)
  ) {
    doc_type = 'booking';
  } else if (/\b(?:ticket|e-?ticket|qr\s*code)\b/i.test(text)) {
    doc_type = 'ticket';
  } else if (/\b(?:from:|subject:|dear\s+|regards)\b/i.test(text)) {
    doc_type = 'email';
  }

  let carrier: string | null = null;
  const airline = text.match(
    /\b(Air\s+New\s+Zealand|Qantas|Jetstar|Virgin\s+Australia|Emirates|Singapore\s+Airlines|Cathay|United|Delta|American\s+Airlines)\b/i
  );
  if (airline?.[1]) carrier = airline[1];

  let reference_code: string | null = null;
  const pnr = text.match(
    /\b(?:PNR|booking\s*(?:ref|reference)|confirmation(?:\s*(?:no|number|#))?|record\s*locator)\s*[:#]?\s*([A-Z0-9]{5,8})\b/i
  );
  if (pnr?.[1]) reference_code = pnr[1].toUpperCase();
  const flightNo = text.match(/\b([A-Z]{2})\s?(\d{1,4})\b/);
  if (!reference_code && flightNo && doc_type === 'flight') {
    reference_code = `${flightNo[1].toUpperCase()}${flightNo[2]}`;
  }

  let title = text.slice(0, 80);
  if (doc_type === 'flight' && flightNo) {
    title = `Flight ${flightNo[1].toUpperCase()}${flightNo[2]}`;
    if (carrier) title = `${carrier} ${flightNo[1].toUpperCase()}${flightNo[2]}`;
  } else if (doc_type === 'booking' && reference_code) {
    title = `Booking ${reference_code}`;
  } else if (doc_type === 'booking') {
    const hotel = text.match(/\b(?:at|hotel)\s+([A-Z][\w\s&'-]{2,40})/i);
    title = hotel?.[1] ? `Stay · ${hotel[1].trim()}` : 'Booking';
  } else {
    title = text.slice(0, 60) || 'Travel note';
  }

  return {
    doc_type,
    title: title.replace(/\s+/g, ' ').trim(),
    body: text,
    carrier,
    reference_code,
    source: 'paste',
  };
}

export function docTypeLabel(t: TravelDocType): string {
  return TRAVEL_DOC_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}
