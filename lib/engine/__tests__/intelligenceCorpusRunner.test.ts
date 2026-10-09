import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { textForCaptureField } from '@/hooks/useCaptureSpeech';
import { runCaptureDock, type CaptureDockResult } from '@/lib/engine/captureDock';
import { processCaptureSpeech } from '@/lib/speech/captureAdapter';

/**
 * Phase E corpus runner.
 *
 * This executes every draft development record through both typed and
 * fixed-transcript speech capture paths and reports what the current engine
 * does. It deliberately does NOT score draft semantic annotations as truth,
 * change expected labels, or impose product-quality thresholds.
 */

type CorpusRecord = {
  id: string;
  family_id: string;
  utterance: string;
  locale: string;
  split: 'development' | 'validation' | 'held_out';
  provenance: { kind: string; source_ref: string; generation_method?: string };
  domains: string[];
  capabilities: string[];
  difficulty: string;
  context?: Record<string, unknown>;
  expected: {
    interaction_mode: 'act' | 'preserve' | 'answer' | 'clarify' | 'no_op';
    semantic_acts: Array<Record<string, unknown>>;
    rationale: string;
  };
  annotation: { review_status: 'draft' | 'reviewed' | 'needs_revision' | 'rejected'; review_note: string };
};

type ObservedMode = 'task' | 'answer' | 'clarify' | 'defer' | 'fallthrough';

type Observation = {
  id: string;
  domains: string[];
  capabilities: string[];
  difficulty: string;
  annotationStatus: CorpusRecord['annotation']['review_status'];
  expectedModeDraftOnly: CorpusRecord['expected']['interaction_mode'];
  typed: {
    mode: ObservedMode;
    taskText?: string;
    location?: string | null;
    surfaceDate?: string | null;
    message?: string;
  };
  speech: {
    transcriptAfterSpeechAdapter: string;
    mode: ObservedMode;
    taskText?: string;
    location?: string | null;
    surfaceDate?: string | null;
    message?: string;
  };
  provisionalModeDifferences: { typed: boolean; speech: boolean };
};

function loadCorpus(): CorpusRecord[] {
  const directory = join(process.cwd(), 'data/intelligence-corpus/examples');
  const files = readdirSync(directory).filter((file) => file.endsWith('.jsonl')).sort();
  const allRecords = files.flatMap((file) =>
    readFileSync(join(directory, file), 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .map((line, index) => {
        try {
          return JSON.parse(line) as CorpusRecord;
        } catch (error) {
          throw new Error(`${file}:${index + 1}: invalid JSON: ${String(error)}`);
        }
      }),
  );
  // Normal development runs must never evaluate validation or held-out records.
  return allRecords.filter((record) => record.split === 'development');
}

function observedMode(result: CaptureDockResult): ObservedMode {
  if (result.kind === 'act_create' || result.kind === 'act_update') return 'task';
  return result.kind;
}

function observeDock(result: CaptureDockResult) {
  if (result.kind === 'act_create' || result.kind === 'act_update') {
    return {
      mode: observedMode(result),
      taskText: result.overrides.text,
      location: result.overrides.locationText ?? null,
      surfaceDate: result.overrides.surfaceDate ?? null,
      message: result.message,
    };
  }
  return {
    mode: observedMode(result),
    message: result.message ?? '',
  };
}

function runDock(utterance: string, inputType: 'text' | 'speech_transcript'): CaptureDockResult {
  return runCaptureDock({
    line: utterance,
    userId: null,
    priorRequest: null,
    jobs: [],
    captureJobId: null,
    captureSurfaceDate: '2026-10-09',
    remainingMinsToday: 240,
    openTaskCount: 0,
    inputType,
  });
}

function groupCounts(rows: Observation[], key: 'domains' | 'capabilities') {
  const counts = new Map<string, { examples: number; typedModes: Record<string, number>; speechModes: Record<string, number> }>();
  for (const row of rows) {
    for (const tag of row[key]) {
      const entry = counts.get(tag) ?? { examples: 0, typedModes: {}, speechModes: {} };
      entry.examples += 1;
      entry.typedModes[row.typed.mode] = (entry.typedModes[row.typed.mode] ?? 0) + 1;
      entry.speechModes[row.speech.mode] = (entry.speechModes[row.speech.mode] ?? 0) + 1;
      counts.set(tag, entry);
    }
  }
  return Object.fromEntries([...counts.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function observe(record: CorpusRecord): Observation {
  const speech = processCaptureSpeech({ text: record.utterance, todayIso: '2026-10-09' });
  const transcript = textForCaptureField(speech);
  const typedResult = runDock(record.utterance, 'text');
  const speechResult = runDock(transcript, 'speech_transcript');
  const typed = observeDock(typedResult);
  const speechObservation = observeDock(speechResult);

  const provisionalMode = (mode: ObservedMode): string => mode === 'task' ? 'act' : mode;
  return {
    id: record.id,
    domains: record.domains,
    capabilities: record.capabilities,
    difficulty: record.difficulty,
    annotationStatus: record.annotation.review_status,
    expectedModeDraftOnly: record.expected.interaction_mode,
    typed,
    speech: { transcriptAfterSpeechAdapter: transcript, ...speechObservation },
    provisionalModeDifferences: {
      typed: provisionalMode(typed.mode) !== record.expected.interaction_mode,
      speech: provisionalMode(speechObservation.mode) !== record.expected.interaction_mode,
    },
  };
}

describe('Phase E — cross-domain intelligence corpus runner (diagnostic only)', () => {
  it('runs every corpus example through typed and fixed-transcript speech capture and reports observed behavior', () => {
    const records = loadCorpus();
    const ids = records.map((record) => record.id);
    expect(records.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(records.every((record) => record.utterance.trim().length > 0)).toBe(true);

    const observations = records.map(observe);
    const draftCount = records.filter((record) => record.annotation.review_status === 'draft').length;
    const summary = {
      benchmark: 'phase-e-corpus-runner-v1',
      purpose: 'diagnostic observations only; draft labels are not gold truth',
      corpusRecords: records.length,
      evaluatedRecords: observations.length,
      executionPaths: ['typed text', 'fixed transcript through speech adapter then capture'],
      transcriptSource: 'fixed text; acoustic ASR is not measured',
      splitPolicy: 'development records only; validation and held-out records are excluded from this routine runner',
      contextPolicy: 'Runs with empty prior context. Context-dependent records are ambiguity probes, not context-resolution coverage yet.',
      annotationStatus: {
        draft: draftCount,
        reviewed: records.filter((record) => record.annotation.review_status === 'reviewed').length,
        needsRevision: records.filter((record) => record.annotation.review_status === 'needs_revision').length,
        rejected: records.filter((record) => record.annotation.review_status === 'rejected').length,
      },
      observedModes: {
        typed: observations.reduce<Record<string, number>>((counts, row) => {
          counts[row.typed.mode] = (counts[row.typed.mode] ?? 0) + 1;
          return counts;
        }, {}),
        speech: observations.reduce<Record<string, number>>((counts, row) => {
          counts[row.speech.mode] = (counts[row.speech.mode] ?? 0) + 1;
          return counts;
        }, {}),
      },
      typedSpeechModeDisagreements: observations.filter((row) => row.typed.mode !== row.speech.mode).map((row) => row.id),
      provisionalDraftLabelDifferences: {
        typed: observations.filter((row) => row.provisionalModeDifferences.typed).map((row) => row.id),
        speech: observations.filter((row) => row.provisionalModeDifferences.speech).map((row) => row.id),
        warning: 'These are review candidates only. Draft expected labels are not treated as gold truth or a release gate.',
      },
      byDomain: groupCounts(observations, 'domains'),
      byCapability: groupCounts(observations, 'capabilities'),
      observations,
    };

    console.info('\nPHASE_E_CORPUS_RUNNER=' + JSON.stringify(summary));
    expect(observations).toHaveLength(records.length);
    expect(observations.every((row) => row.typed.mode && row.speech.mode)).toBe(true);
  });
});
