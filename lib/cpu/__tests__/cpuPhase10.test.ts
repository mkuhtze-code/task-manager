import { describe, expect, it } from 'vitest';
import { processCpuInteraction } from '@/lib/cpu';
import { decideAuthority } from '../authority';

describe('hard commitment authority', () => {
  it('allows an explicit executable hard commitment to act', () => {
    const result = processCpuInteraction({
      userId: 'phase10-test',
      input: {
        type: 'text',
        text: 'I need to drop off clips to 64 Grace James Road in Pukekohe at 4pm today',
      },
      context: {
        interface: 'capture',
        surface: 'today',
        todayDate: '2026-10-07',
        remainingMinsToday: 5,
        openTaskCount: 2,
        jobs: [
          {
            id: 'job-grace',
            name: 'Grace James',
            locationText: '64 Grace James Road',
          },
        ],
        meetings: [],
      },
      dryRun: true,
    });

    expect(result.decision.authority.commitmentClass).toBe('HARD_COMMITMENT');
    expect(result.decision.authority.mayAct).toBe(true);
    expect(result.decision.authority.autonomy).toBe('act');
    expect(result.decision.outcome).toBe('ACT');
    expect(result.decision.action?.kind).toBe('create_task');
    expect(result.decision.explanation).not.toContain('Today looks tight');
    expect(result.decision.explanation).not.toContain('consider tomorrow morning');
  });

  it('does not treat hard commitment as permission to rearrange anything', () => {
    const authority = decideAuthority({
      id: 'request-1',
      action: 'create_task',
      objectText: 'drop off clips',
      locationText: '64 Grace James Road',
      dateHint: 'today',
      timeHint: '4pm',
      commitment: 'hard',
      urgency: 'normal',
      confidence: 'high',
      rawUtterances: ['I need to drop off clips to 64 Grace James Road at 4pm today'],
      constraints: [],
    });

    expect(authority.mayAct).toBe(true);
    expect(authority.autonomy).toBe('act');
    expect(authority.reason).toBe('explicit_hard_commitment');
  });
});
