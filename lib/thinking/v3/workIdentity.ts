/**
 * S1 / WS-A — Work identity graph.
 *
 * Three layers (never conflated):
 *   taskId   — instance (prediction ↔ outcome)
 *   workKey  — aggregation unit for duration / carry / fragility
 *   clusterId — soft neighbourhood for cold match when workKey is new
 *
 * Pure. Deterministic. No network. No LLM.
 *
 * Algorithm version: WORK_KEY_VERSION — bump when hash material changes.
 */

import {
  discriminativeTokens,
  tokenize,
  weightedJaccard,
  GENERIC_TOKENS,
} from './clusters';

/** Bump when workKey material or normalisation changes (replay safety). */
export const WORK_KEY_VERSION = 1;

/** Ultra-generic titles with no job/place stay instance-scoped (no mega-leaf). */
export const AMBIGUOUS_ONLY_TOKENS = new Set([
  ...GENERIC_TOKENS,
  'misc',
  'todo',
  'tbd',
  'note',
  'notes',
  'xxx',
  'test',
  'asdf',
  'foo',
  'bar',
]);

export type StructuralShapeClass =
  | 'short'
  | 'medium'
  | 'long'
  | 'checklist'
  | 'unknown';

export type WorkKeyParts = {
  lexicalFingerprint: string;
  jobId: string | null;
  placeKey: string | null;
  shapeClass: StructuralShapeClass;
  /** True when key is bound to a single taskId (no safe aggregation). */
  instanceScoped: boolean;
  taskId: string | null;
};

export type WorkKeyResult = {
  workKey: string;
  parts: WorkKeyParts;
  algorithmVersion: number;
};

export type WorkIdentityInput = {
  text: string;
  taskId?: string | null;
  jobId?: string | null;
  locationText?: string | null;
  subtaskCount?: number | null;
  estimateMins?: number | null;
};

export function structuralShapeClass(input: {
  text?: string | null;
  subtaskCount?: number | null;
  estimateMins?: number | null;
}): StructuralShapeClass {
  const subs =
    typeof input.subtaskCount === 'number' && input.subtaskCount > 0
      ? input.subtaskCount
      : 0;
  if (subs >= 2) return 'checklist';

  const est =
    typeof input.estimateMins === 'number' && input.estimateMins > 0
      ? input.estimateMins
      : null;
  if (est != null) {
    if (est <= 20) return 'short';
    if (est <= 60) return 'medium';
    return 'long';
  }

  const len = (input.text ?? '').trim().length;
  if (len === 0) return 'unknown';
  if (len < 24) return 'short';
  if (len < 64) return 'medium';
  return 'long';
}

export function placeKeyFromText(locationText?: string | null): string | null {
  const raw = (locationText ?? '').trim().toLowerCase();
  if (!raw) return null;
  const cleaned = raw
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 4)
    .join('_');
  return cleaned || null;
}

export function lexicalFingerprint(text: string): string {
  const disc = discriminativeTokens(text)
    .map((t) => t.toLowerCase())
    .filter((t) => t.length > 1);
  const unique = [...new Set(disc)].sort();
  if (unique.length === 0) return '';
  return unique.slice(0, 6).join('|');
}

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function instanceScopedKey(taskId: string | null | undefined): string {
  const id = (taskId ?? '').trim();
  if (id) return `wk_inst_${fnv1a(id)}`;
  return `wk_inst_${fnv1a('anonymous')}`;
}

function isAmbiguousOnlyText(text: string): boolean {
  const toks = tokenize(text);
  if (toks.length === 0) return true;
  return toks.every((t) => AMBIGUOUS_ONLY_TOKENS.has(t.toLowerCase()));
}

export function computeWorkKey(input: WorkIdentityInput): WorkKeyResult {
  const text = (input.text ?? '').trim();
  const jobId = (input.jobId ?? '').trim() || null;
  const place = placeKeyFromText(input.locationText ?? null);
  const shape = structuralShapeClass({
    text,
    subtaskCount: input.subtaskCount,
    estimateMins: input.estimateMins,
  });
  const fp = lexicalFingerprint(text);
  const taskId = (input.taskId ?? '').trim() || null;

  const instanceScoped =
    !jobId && !place && (fp === '' || isAmbiguousOnlyText(text));

  if (instanceScoped) {
    const workKey = instanceScopedKey(taskId);
    return {
      workKey,
      parts: {
        lexicalFingerprint: fp,
        jobId,
        placeKey: place,
        shapeClass: shape,
        instanceScoped: true,
        taskId,
      },
      algorithmVersion: WORK_KEY_VERSION,
    };
  }

  const material = [
    `v${WORK_KEY_VERSION}`,
    fp || '_nodisc',
    jobId ? `j:${jobId}` : 'j:_',
    place ? `p:${place}` : 'p:_',
    `s:${shape}`,
  ].join('::');

  return {
    workKey: `wk_${fnv1a(material)}`,
    parts: {
      lexicalFingerprint: fp,
      jobId,
      placeKey: place,
      shapeClass: shape,
      instanceScoped: false,
      taskId,
    },
    algorithmVersion: WORK_KEY_VERSION,
  };
}

export function workIdentitiesCompatible(
  a: WorkKeyParts,
  b: WorkKeyParts,
  opts?: { minLexicalOverlap?: number }
): boolean {
  if (a.instanceScoped || b.instanceScoped) {
    return (
      a.instanceScoped &&
      b.instanceScoped &&
      a.taskId != null &&
      a.taskId === b.taskId
    );
  }
  if (a.jobId !== b.jobId) return false;
  if (a.placeKey !== b.placeKey) return false;
  if (a.shapeClass !== b.shapeClass) return false;

  const minOverlap = opts?.minLexicalOverlap ?? 0.5;
  if (!a.lexicalFingerprint && !b.lexicalFingerprint) {
    return Boolean(a.jobId || a.placeKey);
  }
  if (!a.lexicalFingerprint || !b.lexicalFingerprint) return false;

  const ta = a.lexicalFingerprint.split('|');
  const tb = b.lexicalFingerprint.split('|');
  return weightedJaccard(ta, tb) >= minOverlap;
}

export function resolveWorkKeyToLeaf(
  sample: WorkKeyResult,
  existingLeaves: Array<{ workKey: string; parts: WorkKeyParts }>
): string {
  if (sample.parts.instanceScoped) return sample.workKey;

  for (const leaf of existingLeaves) {
    if (leaf.workKey === sample.workKey) return leaf.workKey;
    if (workIdentitiesCompatible(sample.parts, leaf.parts)) {
      return leaf.workKey;
    }
  }
  return sample.workKey;
}

export type WorkLeafSample = WorkIdentityInput & {
  actualMins?: number | null;
  completedAt?: string | null;
  createdAt?: string | null;
  durationContaminated?: boolean;
};

export type WorkLeaf = {
  workKey: string;
  parts: WorkKeyParts;
  sampleCount: number;
  cleanDurationMins: number[];
  timedClean: Array<{ mins: number; completedAt: string }>;
  memberTaskIds: string[];
};

export function buildWorkLeaves(samples: WorkLeafSample[]): WorkLeaf[] {
  const computed = samples.map((s) => ({
    sample: s,
    key: computeWorkKey(s),
  }));

  const leaves: WorkLeaf[] = [];
  const byKey = new Map<string, WorkLeaf>();

  for (const { sample, key } of computed) {
    const resolved = resolveWorkKeyToLeaf(
      key,
      leaves.map((l) => ({ workKey: l.workKey, parts: l.parts }))
    );

    let leaf = byKey.get(resolved);
    if (!leaf) {
      const existing = leaves.find((l) => l.workKey === resolved);
      if (existing) {
        leaf = existing;
      } else {
        leaf = {
          workKey: resolved,
          parts: key.parts,
          sampleCount: 0,
          cleanDurationMins: [],
          timedClean: [],
          memberTaskIds: [],
        };
        leaves.push(leaf);
        byKey.set(resolved, leaf);
      }
    }

    leaf.sampleCount += 1;
    const tid = (sample.taskId ?? '').trim();
    if (tid && !leaf.memberTaskIds.includes(tid)) {
      leaf.memberTaskIds.push(tid);
    }

    const contaminated = Boolean(sample.durationContaminated);
    const mins = sample.actualMins;
    if (
      !contaminated &&
      typeof mins === 'number' &&
      Number.isFinite(mins) &&
      mins > 0
    ) {
      leaf.cleanDurationMins.push(mins);
      if (sample.completedAt) {
        leaf.timedClean.push({ mins, completedAt: sample.completedAt });
      }
    }
  }

  return leaves;
}

export function matchWorkLeaf(
  input: WorkIdentityInput,
  leaves: WorkLeaf[]
): { leaf: WorkLeaf; workKey: string } | null {
  if (leaves.length === 0) return null;
  const probe = computeWorkKey(input);

  const exact = leaves.find((l) => l.workKey === probe.workKey);
  if (exact) return { leaf: exact, workKey: exact.workKey };

  for (const leaf of leaves) {
    if (workIdentitiesCompatible(probe.parts, leaf.parts)) {
      return { leaf, workKey: leaf.workKey };
    }
  }
  return null;
}

export function workKeyFromHistoryRow(row: {
  text: string;
  task_id?: string | null;
  job_id?: string | null;
  location_text?: string | null;
  subtask_count?: number | null;
  estimate_mins?: number | null;
}): WorkKeyResult {
  return computeWorkKey({
    text: row.text,
    taskId: row.task_id,
    jobId: row.job_id,
    locationText: row.location_text,
    subtaskCount: row.subtask_count,
    estimateMins: row.estimate_mins,
  });
}
