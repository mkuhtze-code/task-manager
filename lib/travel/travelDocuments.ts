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

/** Structured flight fields extracted from paste / confirmation text. */
export type FlightScheduleHint = {
  flightNumber: string | null;
  origin: string | null;
  destination: string | null;
  /** Local clock HH:MM if known */
  departTime: string | null;
  arriveTime: string | null;
  /** YYYY-MM-DD when resolvable against a reference date */
  dateYmd: string | null;
  /** Estimate for airport + flight block on the itinerary */
  estimateMins: number;
};

export type TripDayRef = {
  id: string;
  date: string;
};

/** Payload ready for activities insert (caller supplies user_id, trip_day_id, order_index). */
export type FlightActivityDraft = {
  text: string;
  activity_type: 'flight';
  estimate_mins: number;
  drive_mins_to_next: number;
  location_text: string | null;
  time_type: 'flexible' | 'fixed';
  fixed_time: string | null;
  stop_kind: 'other';
  presence: 'fixed' | 'duration';
  status: 'pending';
};

export const TRAVEL_DOC_TYPE_OPTIONS: Array<{ value: TravelDocType; label: string }> = [
  { value: 'flight', label: 'Flight' },
  { value: 'booking', label: 'Booking' },
  { value: 'ticket', label: 'Ticket' },
  { value: 'email', label: 'Email' },
  { value: 'note', label: 'Note' },
  { value: 'other', label: 'Other' },
];

const AIRPORT_RE = /\b([A-Z]{3})\b/g;

function normalizeClock(h: number, m: number): string | null {
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Parse HH:MM or H:MM am/pm from free text. */
export function extractClockTime(text: string): string | null {
  const ampm = text.match(
    /\b(?:depart(?:s|ure)?|leaves?|at)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)\b/i
  );
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = ampm[2] ? parseInt(ampm[2], 10) : 0;
    const ap = ampm[3].toLowerCase().replace(/\./g, '');
    if (ap.startsWith('p') && h < 12) h += 12;
    if (ap.startsWith('a') && h === 12) h = 0;
    return normalizeClock(h, m);
  }
  const plain = text.match(
    /\b(?:depart(?:s|ure)?|leaves?|at)\s*(\d{1,2}):(\d{2})\b/i
  );
  if (plain) {
    return normalizeClock(parseInt(plain[1], 10), parseInt(plain[2], 10));
  }
  // Bare first clock on the line (e.g. "07:00 Mon")
  const bare = text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (bare) {
    return normalizeClock(parseInt(bare[1], 10), parseInt(bare[2], 10));
  }
  return null;
}

/**
 * Resolve a calendar date from paste relative to trip range / today.
 * Supports: YYYY-MM-DD, DD/MM/YYYY, "Mon 8 Oct", weekday names within trip days.
 */
export function extractFlightDateYmd(
  text: string,
  opts?: {
    tripDays?: TripDayRef[];
    todayYmd?: string;
  }
): string | null {
  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const dmy = text.match(/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2})\b/);
  if (dmy) {
    const d = parseInt(dmy[1], 10);
    const m = parseInt(dmy[2], 10);
    const y = dmy[3];
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  const days = opts?.tripDays ?? [];
  const weekday = text.match(
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i
  );
  if (weekday && days.length) {
    const map: Record<string, number> = {
      sun: 0,
      sunday: 0,
      mon: 1,
      monday: 1,
      tue: 2,
      tuesday: 2,
      wed: 3,
      wednesday: 3,
      thu: 4,
      thursday: 4,
      fri: 5,
      friday: 5,
      sat: 6,
      saturday: 6,
    };
    const want = map[weekday[1].toLowerCase()];
    if (want != null) {
      const hit = days.find((td) => {
        const [y, m, d] = td.date.split('-').map((n) => parseInt(n, 10));
        const dt = new Date(y, m - 1, d);
        return dt.getDay() === want;
      });
      if (hit) return hit.date;
    }
  }

  // "8 Oct" / "Oct 8" within current or trip year
  const monDay = text.match(
    /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/i
  );
  const dayMon = text.match(
    /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})\b/i
  );
  const months: Record<string, number> = {
    jan: 1,
    feb: 2,
    mar: 3,
    apr: 4,
    may: 5,
    jun: 6,
    jul: 7,
    aug: 8,
    sep: 9,
    oct: 10,
    nov: 11,
    dec: 12,
  };
  if (monDay || dayMon) {
    const day = monDay ? parseInt(monDay[1], 10) : parseInt(dayMon![2], 10);
    const monKey = (monDay ? monDay[2] : dayMon![1]).toLowerCase().slice(0, 3);
    const month = months[monKey];
    if (month && day >= 1 && day <= 31) {
      if (days.length) {
        const hit = days.find((td) => {
          const [, m, d] = td.date.split('-').map((n) => parseInt(n, 10));
          return m === month && d === day;
        });
        if (hit) return hit.date;
      }
      const y =
        opts?.todayYmd?.slice(0, 4) ||
        days[0]?.date.slice(0, 4) ||
        String(new Date().getFullYear());
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

export function extractFlightSchedule(
  raw: string,
  opts?: { tripDays?: TripDayRef[]; todayYmd?: string }
): FlightScheduleHint {
  const text = raw.replace(/\s+/g, ' ').trim();
  const flightNo = text.match(/\b([A-Z]{2})\s?(\d{1,4})\b/);
  const flightNumber = flightNo
    ? `${flightNo[1].toUpperCase()}${flightNo[2]}`
    : null;

  let origin: string | null = null;
  let destination: string | null = null;
  const arrow = text.match(
    /\b([A-Z]{3})\s*(?:→|->|–|—|to)\s*([A-Z]{3})\b/i
  );
  if (arrow) {
    origin = arrow[1].toUpperCase();
    destination = arrow[2].toUpperCase();
  } else {
    const codes = [...text.matchAll(AIRPORT_RE)].map((m) => m[1]);
    // Drop airline codes that look like NZ when already used as flight number
    const filtered = codes.filter((c) => {
      if (flightNumber && flightNumber.startsWith(c)) return false;
      return true;
    });
    if (filtered.length >= 2) {
      origin = filtered[0];
      destination = filtered[1];
    } else if (filtered.length === 1) {
      destination = filtered[0];
    }
  }

  const departTime = extractClockTime(text);
  const arriveM = text.match(
    /\b(?:arriv(?:e|es|al)|lands?)\s*(?:at\s*)?(\d{1,2}):(\d{2})\b/i
  );
  const arriveTime = arriveM
    ? normalizeClock(parseInt(arriveM[1], 10), parseInt(arriveM[2], 10))
    : null;

  const dateYmd = extractFlightDateYmd(text, opts);

  // Domestic NZ short-haul default ~2.5h block (airport + air); longer if both times known
  let estimateMins = 150;
  if (departTime && arriveTime) {
    const [dh, dm] = departTime.split(':').map((n) => parseInt(n, 10));
    const [ah, am] = arriveTime.split(':').map((n) => parseInt(n, 10));
    let delta = ah * 60 + am - (dh * 60 + dm);
    if (delta < 0) delta += 24 * 60;
    if (delta >= 30 && delta <= 16 * 60) estimateMins = delta + 45; // buffer for airport
  }

  return {
    flightNumber,
    origin,
    destination,
    departTime,
    arriveTime,
    dateYmd,
    estimateMins,
  };
}

/** Pick trip_day for a flight: exact date, else first trip day, else null. */
export function matchTripDayForFlight(
  days: TripDayRef[],
  dateYmd: string | null
): TripDayRef | null {
  if (!days.length) return null;
  if (dateYmd) {
    const exact = days.find((d) => d.date === dateYmd);
    if (exact) return exact;
  }
  return days[0] ?? null;
}

export function buildFlightActivityDraft(
  title: string,
  schedule: FlightScheduleHint,
  extras?: { carrier?: string | null; reference?: string | null }
): FlightActivityDraft {
  const route =
    schedule.origin && schedule.destination
      ? `${schedule.origin} → ${schedule.destination}`
      : schedule.destination || schedule.origin || null;

  let text = title.trim();
  if (schedule.flightNumber && !/flight|\b[A-Z]{2}\d/i.test(text)) {
    text = `Flight ${schedule.flightNumber}`;
  }
  if (route && !text.includes(route)) {
    text = `${text} · ${route}`;
  }

  const location_text = route
    ? schedule.destination
      ? `${route}`
      : route
    : extras?.carrier || null;

  const fixed = Boolean(schedule.departTime);

  return {
    text,
    activity_type: 'flight',
    estimate_mins: schedule.estimateMins,
    drive_mins_to_next: 0,
    location_text,
    time_type: fixed ? 'fixed' : 'flexible',
    fixed_time: schedule.departTime,
    stop_kind: 'other',
    presence: fixed ? 'fixed' : 'duration',
    status: 'pending',
  };
}

/** Light extraction from pasted confirmation / speech transcript. */
export function interpretTravelPaste(raw: string): Partial<TravelDocumentInsert> & {
  doc_type: TravelDocType;
  title: string;
  schedule?: FlightScheduleHint;
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

  const schedule =
    doc_type === 'flight' ? extractFlightSchedule(text) : undefined;

  let title = text.slice(0, 80);
  if (doc_type === 'flight' && flightNo) {
    title = `Flight ${flightNo[1].toUpperCase()}${flightNo[2]}`;
    if (carrier) title = `${carrier} ${flightNo[1].toUpperCase()}${flightNo[2]}`;
    if (schedule?.origin && schedule?.destination) {
      title = `${title} · ${schedule.origin} → ${schedule.destination}`;
    }
  } else if (doc_type === 'booking' && reference_code) {
    title = `Booking ${reference_code}`;
  } else if (doc_type === 'booking') {
    const hotel = text.match(/\b(?:at|hotel)\s+([A-Z][\w\s&'-]{2,40})/i);
    title = hotel?.[1] ? `Stay · ${hotel[1].trim()}` : 'Booking';
  } else {
    title = text.slice(0, 60) || 'Travel note';
  }

  const location_text =
    schedule?.origin && schedule?.destination
      ? `${schedule.origin} → ${schedule.destination}`
      : null;

  return {
    doc_type,
    title: title.replace(/\s+/g, ' ').trim(),
    body: text,
    carrier,
    reference_code,
    location_text,
    source: 'paste',
    schedule,
  };
}

export function docTypeLabel(t: TravelDocType): string {
  return TRAVEL_DOC_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t;
}
