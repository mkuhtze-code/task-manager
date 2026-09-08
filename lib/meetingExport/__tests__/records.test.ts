import { describe, expect, it } from 'vitest';
import {
  MAX_SUCCESSFUL_EXPORTS,
  applyFailure,
  applySuccess,
  byCreatedDesc,
  hasFailureAfterLatestSuccess,
  latestFailed,
  latestRecord,
  latestSuccessful,
  retryContext,
  successCount,
} from '@/lib/meetingExport/records';
import { makeRecord } from './fixtures';
import type { MeetingExportRecord } from '@/lib/meetingExport';

function rec(
  id: string,
  status: 'successful' | 'failed',
  createdAt: string,
  overrides: Partial<MeetingExportRecord> = {}
) {
  return makeRecord({ ...overrides, id, status, created_at: createdAt });
}

describe('latest helpers', () => {
  it('treats lists as newest-first', () => {
    const records = [
      rec('b', 'successful', '2025-01-02T12:00:00'),
      rec('a', 'failed', '2025-01-02T11:00:00'),
    ];
    expect(latestRecord(records)?.id).toBe('b');
    expect(latestSuccessful(records)?.id).toBe('b');
    expect(latestFailed(records)?.id).toBe('a');
  });

  it('returns null when no record of that kind exists', () => {
    expect(latestSuccessful([rec('x', 'failed', 't')])).toBeNull();
    expect(latestFailed([rec('x', 'successful', 't')])).toBeNull();
    expect(latestRecord([])).toBeNull();
  });
});

describe('applySuccess', () => {
  it('drops every failed attempt when a success lands', () => {
    const old = [
      rec('f2', 'failed', '2025-01-02T12:00:00'),
      rec('s1', 'successful', '2025-01-02T10:00:00'),
      rec('f1', 'failed', '2025-01-02T09:00:00'),
    ];
    const fresh = rec('s2', 'successful', '2025-01-02T13:00:00');
    const { next, dropped } = applySuccess(old, fresh);
    expect(next.map((r) => r.id)).toEqual(['s2', 's1']);
    expect(dropped).toEqual([]);
    expect(next.every((r) => r.status === 'successful')).toBe(true);
    expect(successCount(next)).toBe(2);
  });

  it(`caps history at ${MAX_SUCCESSFUL_EXPORTS} successes, dropping the oldest`, () => {
    const old = Array.from({ length: MAX_SUCCESSFUL_EXPORTS }, (_, i) =>
      rec(`s${String(i).padStart(2, '0')}`, 'successful', `2025-01-02T${String(10 + i).padStart(2, '0')}:00:00`)
    );
    const fresh = rec('new', 'successful', '2025-01-02T23:00:00');
    const { next, dropped } = applySuccess(old, fresh);
    expect(next).toHaveLength(MAX_SUCCESSFUL_EXPORTS);
    expect(next[0].id).toBe('new');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].id).toBe('s00'); // the oldest visible one
    // The cap only counts successes — newest ten stay.
    expect(next.every((r) => r.status === 'successful')).toBe(true);
  });
});

describe('applyFailure', () => {
  it('prepends failures newest-first and keeps them until a success clears them', () => {
    const records = [
      rec('s1', 'successful', '2025-01-02T10:00:00'),
      rec('f1', 'failed', '2025-01-02T09:00:00'),
    ];
    const afterFail = applyFailure(records, rec('f2', 'failed', '2025-01-02T11:00:00'));
    expect(afterFail.map((r) => r.id)).toEqual(['f2', 's1', 'f1']);
    const cleared = applySuccess(afterFail, rec('s2', 'successful', '2025-01-02T12:00:00'));
    expect(cleared.next.every((r) => r.status === 'successful')).toBe(true);
    expect(cleared.next.map((r) => r.id)).toEqual(['s2', 's1']);
  });

  it('sorts by created_at desc regardless of insertion order', () => {
    const records = [
      rec('f1', 'failed', '2025-01-02T12:00:00'),
      rec('f2', 'failed', '2025-01-02T10:00:00'),
    ];
    expect(records.slice().sort(byCreatedDesc).map((r) => r.id)).toEqual(['f1', 'f2']);
  });
});

describe('hasFailureAfterLatestSuccess', () => {
  it('is true when a failure sits after the newest success', () => {
    expect(hasFailureAfterLatestSuccess([rec('f', 'failed', '2025-01-02T11:00:00'), rec('s', 'successful', '2025-01-02T10:00:00')])).toBe(true);
  });

  it('is true when there are failures but no successes at all', () => {
    expect(hasFailureAfterLatestSuccess([rec('f1', 'failed', 't'), rec('f2', 'failed', 't')])).toBe(true);
  });

  it('is false when the newest record is a success (older failures are moot)', () => {
    expect(hasFailureAfterLatestSuccess([rec('s', 'successful', '2025-01-02T12:00:00'), rec('f', 'failed', '2025-01-02T11:00:00')])).toBe(false);
  });

  it('is false for consecutive successes', () => {
    expect(hasFailureAfterLatestSuccess([rec('s2', 'successful', 't2'), rec('s1', 'successful', 't1')])).toBe(false);
  });
});

describe('retryContext', () => {
  it('exposes the newest failed record and its snapshot for the retry seed', () => {
    const failed = rec('f2', 'failed', '2025-01-02T11:00:00', { selected_sections: null });
    const records = [
      failed,
      rec('s1', 'successful', '2025-01-02T10:00:00'),
      rec('f1', 'failed', '2025-01-02T09:00:00'),
    ];
    const ctx = retryContext(records);
    expect(ctx.record?.id).toBe('f2');
    expect(ctx.sections).toBeNull();
  });

  it('returns nulls with no failed record', () => {
    expect(retryContext([rec('s', 'successful', 't')])).toEqual({ record: null, sections: null });
  });
});