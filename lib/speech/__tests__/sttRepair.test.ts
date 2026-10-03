import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  repairTranscript,
} from '../sttRepair';

import {
  emptyPersonalLanguageModel,
} from '../types';

describe('contextual STT repair', () => {
  it('repairs weather → whether in a clause', () => {
    const result =
      repairTranscript(
        'check on Monday weather the flashing fits'
      );

    expect(
      result.text.toLowerCase()
    ).toContain(
      'whether the flashing fits'
    );

    expect(
      result.repairs.some(
        (repair) =>
          repair.original.toLowerCase() ===
            'weather' &&
          repair.replacement.toLowerCase() ===
            'whether'
      )
    ).toBe(true);
  });

  it('does not repair genuine weather usage', () => {
    const result =
      repairTranscript(
        'check the weather Monday'
      );

    expect(
      result.text.toLowerCase()
    ).toBe(
      'check the weather monday'
    );

    expect(
      result.repairs.length
    ).toBe(0);
  });

  it('does not globally replace weather', () => {
    const result =
      repairTranscript(
        'the weather is bad but check whether the flashing fits'
      );

    expect(
      result.text.toLowerCase()
    ).toContain(
      'the weather is bad'
    );

    expect(
      result.text.toLowerCase()
    ).toContain(
      'check whether the flashing fits'
    );
  });

  it('repairs youre when followed by a copula-like phrase', () => {
    const result =
      repairTranscript(
        "you're checking the flashing"
      );

    expect(
      result.text.toLowerCase()
    ).toContain(
      "you're checking"
    );
  });

  it('does not invent repairs for ordinary speech', () => {
    const result =
      repairTranscript(
        'call John about the flashing tomorrow'
      );

    expect(
      result.repairs.length
    ).toBe(0);
  });

  it('uses learned contextual evidence', () => {
    const model =
      emptyPersonalLanguageModel(
        'test'
      );

    model.transcriptionRepairs.push({
      from: 'weather',
      to: 'whether',
      context:
        'check on Monday weather the flashing fits',
      evidenceCount: 3,
      lastEvidenceAt:
        new Date().toISOString(),
    });

    const result =
      repairTranscript(
        'check on Monday weather the flashing fits',
        {
          model,
        }
      );

    expect(
      result.text.toLowerCase()
    ).toContain(
      'whether the flashing fits'
    );
  });

  it('does not let learned evidence blindly rewrite weather', () => {
    const model =
      emptyPersonalLanguageModel(
        'test'
      );

    model.transcriptionRepairs.push({
      from: 'weather',
      to: 'whether',
      context:
        'check on Monday weather the flashing fits',
      evidenceCount: 3,
      lastEvidenceAt:
        new Date().toISOString(),
    });

    const result =
      repairTranscript(
        'check the weather tomorrow',
        {
          model,
        }
      );

    expect(
      result.text.toLowerCase()
    ).toBe(
      'check the weather tomorrow'
    );
  });

  it('respects high transcription confidence when semantic evidence is weak', () => {
    const result =
      repairTranscript(
        'check the weather Monday',
        {
          transcriptionConfidence:
            0.96,
        }
      );

    expect(
      result.repairs.length
    ).toBe(0);
  });
});