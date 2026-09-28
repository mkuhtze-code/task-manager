import { describe, it, expect } from 'vitest';
import {
  classifyOutcomeChannel,
  mayTrainDurationFromChannel,
  channelFromEpisode,
} from '../outcomeChannels';
import type { WorkEpisode } from '../episodes';

function ep(partial: Partial<WorkEpisode>): WorkEpisode {
  return {
    episodeId: 'e1',
    taskId: 't1',
    userId: 'u1',
    startedAt: null,
    endedAt: null,
    activeMinutes: null,
    elapsedMinutes: null,
    interruptionMinutes: null,
    waitingMinutes: null,
    jobId: null,
    locationText: null,
    localHour: null,
    precedingTaskId: null,
    followingTaskId: null,
    outcome: 'done',
    durationEvidence: 'reported',
    trainActiveMinutes: 30,
    confidence: 'medium',
    ...partial,
  };
}

describe('FP-0 outcome channels', () => {
  it('clean done may train duration', () => {
    const r = classifyOutcomeChannel({
      realityOutcome: 'done',
      durationEvidence: 'active_measured',
      measuredMins: 25,
      hasTaskId: true,
    });
    expect(r.channel).toBe('clean_done');
    expect(r.mayTrainDuration).toBe(true);
    expect(r.logOutcomeKind).toBe('done');
  });

  it('partial never trains duration', () => {
    const r = classifyOutcomeChannel({
      realityOutcome: 'partial',
      measuredMins: 40,
      hasTaskId: true,
    });
    expect(r.channel).toBe('partial');
    expect(r.mayTrainDuration).toBe(false);
  });

  it('carry never trains duration', () => {
    const r = classifyOutcomeChannel({ realityOutcome: 'carried' });
    expect(r.channel).toBe('carry');
    expect(r.mayTrainDuration).toBe(false);
    expect(r.logOutcomeKind).toBe('carry');
  });

  it('skip never trains duration', () => {
    const r = classifyOutcomeChannel({ realityOutcome: 'skipped' });
    expect(r.channel).toBe('skip');
    expect(r.mayTrainDuration).toBe(false);
  });

  it('contaminated episode → interrupted, no duration', () => {
    const r = channelFromEpisode(
      ep({ durationEvidence: 'contaminated', interruptionMinutes: 15 })
    );
    expect(r.channel).toBe('interrupted');
    expect(r.mayTrainDuration).toBe(false);
  });

  it('outcomeKind carry string maps', () => {
    const r = classifyOutcomeChannel({ outcomeKind: 'carry' });
    expect(r.channel).toBe('carry');
    expect(r.mayTrainDuration).toBe(false);
  });

  it('mayTrainDurationFromChannel only clean_done', () => {
    expect(mayTrainDurationFromChannel('clean_done')).toBe(true);
    expect(mayTrainDurationFromChannel('partial')).toBe(false);
    expect(mayTrainDurationFromChannel('interrupted')).toBe(false);
  });
});
