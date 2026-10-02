// Soft speaker attribution for meeting observations — no schema change.
export type CaptureSpeaker = 'customer' | 'us' | 'note';

export type ParsedObservationText = {
  speaker: CaptureSpeaker;
  body: string;
  stored: string;
};

export function formatObservationText(text: string, speaker: CaptureSpeaker = 'note'): string {
  const body = stripSpeakerPrefix(text).trim();
  if (!body) return '';
  if (speaker === 'customer') return `Customer: ${body}`;
  if (speaker === 'us') return `Us: ${body}`;
  return body;
}

export function parseObservationText(stored: string): ParsedObservationText {
  const raw = (stored || '').replace(/\s+/g, ' ').trim();
  if (!raw) return { speaker: 'note', body: '', stored: '' };
  const customer = raw.match(/^customer\s*:\s*(.*)$/i);
  if (customer) return { speaker: 'customer', body: customer[1].trim(), stored: raw };
  const us = raw.match(/^us\s*:\s*(.*)$/i);
  if (us) return { speaker: 'us', body: us[1].trim(), stored: raw };
  return { speaker: 'note', body: raw, stored: raw };
}

function stripSpeakerPrefix(text: string): string {
  return (text || '').replace(/^(customer|us|note)\s*:\s*/i, '');
}

export function toEngineSpeaker(
  speaker: CaptureSpeaker
): 'CUSTOMER' | 'CONTRACTOR' | 'UNKNOWN' {
  if (speaker === 'customer') return 'CUSTOMER';
  if (speaker === 'us') return 'CONTRACTOR';
  return 'UNKNOWN';
}

export function observationsToUtterances(
  observations: { id: string; text: string; captured_at?: string | null; created_at?: string }[]
): {
  id: string;
  rawText: string;
  speaker: 'CUSTOMER' | 'CONTRACTOR' | 'UNKNOWN';
  timestamp?: string;
}[] {
  return observations.map((o) => {
    const parsed = parseObservationText(o.text || '');
    return {
      id: o.id,
      rawText: parsed.body || o.text || '',
      speaker: toEngineSpeaker(parsed.speaker),
      timestamp: o.captured_at || o.created_at || undefined,
    };
  });
}
