import { describe, expect, it } from 'vitest';
import {
  canonicalRequestCandidate,
  isCanonicalUtteranceMeaning,
  type CanonicalUtteranceMeaning,
} from '../canonicalMeaning';

const base: CanonicalUtteranceMeaning = {
  version: 1,
  rawText: 'Call Jordan tomorrow',
  normalisedText: 'Call Jordan tomorrow',
  acts: [{
    id: 'act-1', kind: 'create', actionVerb: 'call', participants: ['Jordan'],
    object: 'Jordan', location: null, time: 'tomorrow', polarity: 'positive',
    modality: 'requested', confidence: 'high', rawSpan: 'Call Jordan tomorrow',
  }],
  constraints: [],
  discourse: { corrections: [], references: [], conditions: [] },
  safety: { mustNotCreateTask: false, requiresConfirmation: false, reasons: [] },
  provenance: { path: 'typed', repairs: [], interpreterId: 'test' },
  confidence: { transcription: 'high', interpretation: 'high', action: 'high' },
};

describe('canonical post-recognition meaning contract', () => {
  it('accepts a complete versioned envelope and preserves the raw source', () => {
    expect(isCanonicalUtteranceMeaning(base)).toBe(true);
    expect(base.rawText).toBe('Call Jordan tomorrow');
  });

  it('rejects unknown contract versions and incomplete envelopes', () => {
    expect(isCanonicalUtteranceMeaning({ ...base, version: 2 })).toBe(false);
    expect(isCanonicalUtteranceMeaning({ rawText: base.rawText })).toBe(false);
  });

  it('never offers a request candidate when safety requires a block or confirmation', () => {
    expect(canonicalRequestCandidate({
      ...base, safety: { mustNotCreateTask: true, requiresConfirmation: false, reasons: ['negation'] },
    })).toBeNull();
    expect(canonicalRequestCandidate({
      ...base, safety: { mustNotCreateTask: false, requiresConfirmation: true, reasons: ['confirm'] },
    })).toBeNull();
  });

  it('requires the configured action-confidence threshold before reusing a request', () => {
    expect(canonicalRequestCandidate({
      ...base, confidence: { ...base.confidence, action: 'low' },
    })).toBeNull();
  });
});
