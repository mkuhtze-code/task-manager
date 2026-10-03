import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  repairTranscript,
} from '../sttRepair';

import {
  emptyModel,
} from '../learning';

describe('contextual STT repair', () => {
  it('repairs whether after a temporal bridge', () => {
    const result =
      repairTranscript(
        'check on Monday weather the flashing fits'
      );

    expect(
      result.text.toLowerCase()
    ).toBe(
      'check on monday whether the flashing fits'
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

  it('repairs direct check whether construction', () => {
    const result =
      repairTranscript(
        'check whether the flashing fits'
      );

    expect(
      result.text.toLowerCase()
    ).toBe(
      'check whether the flashing fits'
    );
  });

  it('does not change legitimate weather usage', () => {
    const result =
      repairTranscript(
        'check the weather on monday'
      );

    expect(
      result.text.toLowerCase()
    ).toBe(
      'check the weather on monday'
    );

    expect(
      result.repairs.length
    ).toBe(0);
  });

  it('does not change weather forecast', () => {
    const result =
      repairTranscript(
        'check the weather forecast tomorrow'
      );

    expect(
      result.text.toLowerCase()
    ).toBe(
      'check the weather forecast tomorrow'
    );

    expect(
      result.repairs.length
    ).toBe(0);
  });

  it('does not globally replace weather with whether', () => {
    const result =
      repairTranscript(
        'the weather is looking good'
      );

    expect(
      result.text.toLowerCase()
    ).toBe(
      'the weather is looking good'
    );

    expect(
      result.repairs.length
    ).toBe(0);
  });

  it('uses domain context when repairing whether', () => {
    const result =
      repairTranscript(
        'see tomorrow weather the flashing fits'
      );

    expect(
      result.text.toLowerCase()
    ).toContain(
      'whether the flashing fits'
    );
  });

  it('does not repair an isolated ambiguous homophone', () => {
    const result =
      repairTranscript(
        'weather'
      );

    expect(
      result.repairs.length
    ).toBe(0);

    expect(
      result.text.toLowerCase()
    ).toBe('weather');
  });

  it('does not aggressively repair legitimate there usage', () => {
    const result =
      repairTranscript(
        'there is a problem with the flashing'
      );

    expect(
      result.text.toLowerCase()
    ).toBe(
      'there is a problem with the flashing'
    );
  });

  it('does not aggressively repair legitimate their usage', () => {
    const result =
      repairTranscript(
        'their flashing needs repair'
      );

    expect(
      result.text.toLowerCase()
    ).toBe(
      'their flashing needs repair'
    );
  });

  it('repairs youre in a clear copula construction', () => {
    const result =
      repairTranscript(
        'youre checking the flashing'
      );

    expect(
      result.text.toLowerCase()
    ).toContain(
      "you're checking"
    );
  });

  it('keeps a legitimate your construction', () => {
    const result =
      repairTranscript(
        'check your flashing tomorrow'
      );

    expect(
      result.text.toLowerCase()
    ).toBe(
      'check your flashing tomorrow'
    );
  });

  it('uses learned transcription evidence', () => {
    const model =
      emptyModel(
        'user-1'
      );

    model.transcriptionRepairs.push(
      {
        from: 'weather',
        to: 'whether',
        context:
          'check on Monday weather the flashing fits',
        evidenceCount: 3,
        lastEvidenceAt:
          new Date().toISOString(),
      }
    );

    const result =
      repairTranscript(
        'check on Monday weather the flashing fits',
        {
          model,
        }
      );

    expect(
      result.text.toLowerCase()
    ).toBe(
      'check on monday whether the flashing fits'
    );

    expect(
      result.repairs.some(
        (repair) =>
          repair.reason.includes(
            'learned:3'
          )
      )
    ).toBe(true);
  });

  it('does not let learned evidence become absolute', () => {
    const model =
      emptyModel(
        'user-1'
      );

    model.transcriptionRepairs.push(
      {
        from: 'weather',
        to: 'whether',
        context:
          'check whether...',
        evidenceCount: 3,
        lastEvidenceAt:
          new Date().toISOString(),
      }
    );

    const result =
      repairTranscript(
        'check the weather forecast',
        {
          model,
        }
      );

    expect(
      result.text.toLowerCase()
    ).toBe(
      'check the weather forecast'
    );
  });

  it('preserves unrelated speech around a repair', () => {
    const result =
      repairTranscript(
        'um check on Monday weather the flashing fits please'
      );

    expect(
      result.text.toLowerCase()
    ).toContain(
      'check on monday whether the flashing fits'
    );

    expect(
      result.text.toLowerCase()
    ).toContain(
      'please'
    );
  });

  it('repairs confirm next week weather → whether', () => {
    const result = repairTranscript(
      'confirm next week weather the builder approved it'
    );
    expect(result.text.toLowerCase()).toContain('whether the builder');
  });

  it('repairs verify on Friday weather → whether', () => {
    const result = repairTranscript(
      'verify on Friday weather the gutter fits'
    );
    expect(result.text.toLowerCase()).toContain('whether the gutter');
  });

  it('does not leak context across multi-act clauses', () => {
    const result = repairTranscript(
      'check the weather on Monday and call John'
    );
    expect(result.text.toLowerCase()).toContain('check the weather');
    expect(result.repairs.length).toBe(0);
  });

  it('high STT confidence blocks weak contextual repair', () => {
    const result = repairTranscript('weather looks fine', {
      transcriptionConfidence: 0.95,
    });
    expect(result.repairs.length).toBe(0);
  });

  it('does not repair to/too when context is infinitive', () => {
    const result = repairTranscript('need to check the flashing');
    expect(result.text.toLowerCase()).toBe('need to check the flashing');
  });
});
