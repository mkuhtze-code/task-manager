import { describe, it, expect } from 'vitest';
import {
  computeWorkKey,
  workIdentitiesCompatible,
  buildWorkLeaves,
  matchWorkLeaf,
  lexicalFingerprint,
  structuralShapeClass,
  WORK_KEY_VERSION,
} from '../workIdentity';

describe('S1 work identity graph', () => {
  it('same title + different jobId → different workKey', () => {
    const a = computeWorkKey({
      text: 'Site inspection report',
      jobId: 'job-a',
      taskId: 't1',
    });
    const b = computeWorkKey({
      text: 'Site inspection report',
      jobId: 'job-b',
      taskId: 't2',
    });
    expect(a.workKey).not.toBe(b.workKey);
    expect(a.parts.jobId).toBe('job-a');
    expect(b.parts.jobId).toBe('job-b');
  });

  it('renamed title + same job + overlapping fingerprint → compatible leaf', () => {
    const a = computeWorkKey({
      text: 'Weekly status report for Acme',
      jobId: 'job-1',
      taskId: 't1',
    });
    const b = computeWorkKey({
      text: 'Weekly status report Acme client',
      jobId: 'job-1',
      taskId: 't2',
    });
    // May differ as exact keys if fingerprint set differs, but must be compatible
    expect(workIdentitiesCompatible(a.parts, b.parts)).toBe(true);

    const leaves = buildWorkLeaves([
      {
        text: 'Weekly status report for Acme',
        jobId: 'job-1',
        taskId: 't1',
        actualMins: 40,
        completedAt: '2026-01-01T12:00:00Z',
      },
      {
        text: 'Weekly status report Acme client',
        jobId: 'job-1',
        taskId: 't2',
        actualMins: 42,
        completedAt: '2026-01-02T12:00:00Z',
      },
    ]);
    expect(leaves.length).toBe(1);
    expect(leaves[0].cleanDurationMins).toHaveLength(2);
    expect(leaves[0].memberTaskIds.sort()).toEqual(['t1', 't2']);
  });

  it('ambiguous-only vocabulary without job stays instance-scoped', () => {
    const a = computeWorkKey({ text: 'stuff todo', taskId: 't1' });
    const b = computeWorkKey({ text: 'stuff todo', taskId: 't2' });
    expect(a.parts.instanceScoped).toBe(true);
    expect(b.parts.instanceScoped).toBe(true);
    expect(a.workKey).not.toBe(b.workKey);
    expect(workIdentitiesCompatible(a.parts, b.parts)).toBe(false);
  });

  it('does not create a global misc mega-leaf for generic titles', () => {
    const leaves = buildWorkLeaves([
      { text: 'todo', taskId: 'a', actualMins: 10 },
      { text: 'misc', taskId: 'b', actualMins: 20 },
      { text: 'stuff', taskId: 'c', actualMins: 30 },
    ]);
    expect(leaves.length).toBe(3);
  });

  it('matchWorkLeaf finds leaf under same job after title drift', () => {
    const leaves = buildWorkLeaves([
      {
        text: 'Invoice batch Acme',
        jobId: 'j1',
        taskId: 't1',
        actualMins: 25,
        completedAt: '2026-01-01T10:00:00Z',
      },
    ]);
    const hit = matchWorkLeaf(
      { text: 'Invoice batch for Acme', jobId: 'j1', taskId: 't9' },
      leaves
    );
    expect(hit).not.toBeNull();
    expect(hit!.leaf.cleanDurationMins).toContain(25);
  });

  it('matchWorkLeaf does not cross jobs', () => {
    const leaves = buildWorkLeaves([
      {
        text: 'Invoice batch Acme',
        jobId: 'j1',
        taskId: 't1',
        actualMins: 25,
      },
    ]);
    const hit = matchWorkLeaf(
      { text: 'Invoice batch Acme', jobId: 'j2', taskId: 't9' },
      leaves
    );
    expect(hit).toBeNull();
  });

  it('contaminated samples do not enter clean duration', () => {
    const leaves = buildWorkLeaves([
      {
        text: 'Deep analysis pack',
        jobId: 'j1',
        actualMins: 5,
        durationContaminated: true,
      },
      {
        text: 'Deep analysis pack',
        jobId: 'j1',
        actualMins: 90,
        durationContaminated: false,
      },
    ]);
    expect(leaves).toHaveLength(1);
    expect(leaves[0].cleanDurationMins).toEqual([90]);
  });

  it('shape class distinguishes checklist', () => {
    expect(structuralShapeClass({ text: 'x', subtaskCount: 4 })).toBe(
      'checklist'
    );
    expect(structuralShapeClass({ text: 'short one', estimateMins: 10 })).toBe(
      'short'
    );
  });

  it('algorithm version is stamped', () => {
    const k = computeWorkKey({ text: 'Filing ledger', jobId: 'j' });
    expect(k.algorithmVersion).toBe(WORK_KEY_VERSION);
  });

  it('lexical fingerprint ignores generic verbs', () => {
    const fp = lexicalFingerprint('review update the Acme contract');
    expect(fp.includes('acme')).toBe(true);
    expect(fp.includes('contract')).toBe(true);
  });
});

