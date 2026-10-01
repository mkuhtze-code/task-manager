import { describe, expect, it } from 'vitest';
import {
  formatObservationText,
  parseObservationText,
  toEngineSpeaker,
  observationsToUtterances,
} from '@/lib/communication/speaker';

describe('speaker attribution', () => {
  it('formats customer and us with prefix; note plain', () => {
    expect(formatObservationText('Match the fascia', 'customer')).toBe('Customer: Match the fascia');
    expect(formatObservationText("I'll need to check", 'us')).toBe("Us: I'll need to check");
    expect(formatObservationText('Existing fascia is rotten', 'note')).toBe('Existing fascia is rotten');
  });

  it('parses stored text back to speaker + body', () => {
    expect(parseObservationText('Customer: No box gutters').speaker).toBe('customer');
    expect(parseObservationText('Us: Yep.').body).toBe('Yep.');
    expect(parseObservationText('Just a note').speaker).toBe('note');
  });

  it('round-trips format → parse', () => {
    for (const speaker of ['customer', 'us', 'note'] as const) {
      const stored = formatObservationText('Hello world', speaker);
      const parsed = parseObservationText(stored);
      expect(parsed.speaker).toBe(speaker);
      expect(parsed.body).toBe('Hello world');
    }
  });

  it('maps to engine speaker roles', () => {
    expect(toEngineSpeaker('customer')).toBe('CUSTOMER');
    expect(toEngineSpeaker('us')).toBe('CONTRACTOR');
    expect(toEngineSpeaker('note')).toBe('UNKNOWN');
  });

  it('builds utterances from observations', () => {
    const utts = observationsToUtterances([
      { id: '1', text: 'Customer: We want the skylight moved' },
      { id: '2', text: "Us: I'll need to check that." },
    ]);
    expect(utts[0].speaker).toBe('CUSTOMER');
    expect(utts[1].speaker).toBe('CONTRACTOR');
  });
});
