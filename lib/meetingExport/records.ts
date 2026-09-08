import type { MeetingExportRecord, MeetingExportSections } from './types';

// ── Export record lifecycle (pure) ───────────────────────────────────
// Lists here are always NEWEST-FIRST (the order meeting_exports is read in,
// created_at DESC). The rules:
//   * a successful export makes every older failed attempt meaningless —
//     failed rows are dropped the moment a success lands;
//   * a success keeps the at-most-ten NEWEST successes (a cap enforced here
//     so a busy meeting can't accumulate an unbounded history);
//   * a failed export is prepended and kept until the next success, so
//     "Try again" can always rebuild the exact attempt that failed.

export const MAX_SUCCESSFUL_EXPORTS = 10;

export function byCreatedDesc(a: MeetingExportRecord, b: MeetingExportRecord): number {
  return a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0;
}

export function latestRecord(records: MeetingExportRecord[]): MeetingExportRecord | null {
  return records.length > 0 ? records[0] : null;
}

export function latestSuccessful(records: MeetingExportRecord[]): MeetingExportRecord | null {
  return records.find((r) => r.status === 'successful') ?? null;
}

export function latestFailed(records: MeetingExportRecord[]): MeetingExportRecord | null {
  return records.find((r) => r.status === 'failed') ?? null;
}

export function successCount(records: MeetingExportRecord[]): number {
  return records.filter((r) => r.status === 'successful').length;
}

// A "has anything happened since the last success" flag for the history
// marker: any failed attempt after the newest success, or none at all.
export function hasFailureAfterLatestSuccess(records: MeetingExportRecord[]): boolean {
  const success = latestSuccessful(records);
  if (!success) return records.some((r) => r.status === 'failed');
  const successIndex = records.indexOf(success);
  return records.slice(0, successIndex).some((r) => r.status === 'failed');
}

// Returns the list AFTER applying this new successful record. Pure — the
// caller persists the diff (insert the new row, delete any that fall off).
export function applySuccess(
  records: MeetingExportRecord[],
  newRecord: MeetingExportRecord
): { next: MeetingExportRecord[]; dropped: MeetingExportRecord[] } {
  const successes = [newRecord, ...records.filter((r) => r.status === 'successful')].sort(byCreatedDesc);
  const dropped = successes.slice(MAX_SUCCESSFUL_EXPORTS);
  const keep = successes.slice(0, MAX_SUCCESSFUL_EXPORTS);
  return { next: keep, dropped };
}

// Returns the list AFTER prepending this failed record. Failures are capped
// in the UI, not here: they all stay until the next success clears them.
export function applyFailure(records: MeetingExportRecord[], failedRecord: MeetingExportRecord): MeetingExportRecord[] {
  return [failedRecord, ...records].sort(byCreatedDesc);
}

// The exact snapshot that would reproduce a failed attempt as the starting
// context of a retry — what the review seeds from.
export function retryContext(records: MeetingExportRecord[]): {
  record: MeetingExportRecord | null;
  sections: MeetingExportSections | null;
} {
  const failed = latestFailed(records);
  return { record: failed, sections: failed?.selected_sections ?? null };
}