/**
 * Adversarial corpus runner — scores processCaptureSpeech on action outcomes.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { processCaptureSpeech } from '../captureAdapter';
import type { SemanticActionOutcome } from '../semantic/types';

export type AdversarialExpect = {
  outcomeIn?: SemanticActionOutcome[];
  outcomeNot?: SemanticActionOutcome[];
  mustNotCreate?: boolean;
  wouldMutateWithoutConfirm?: boolean;
  minProposals?: number;
  maxProposals?: number;
  surfaceContainsAny?: string[];
  named?: string;
};

export type AdversarialCase = {
  id: string;
  category: string;
  input: string;
  expect: AdversarialExpect;
  severity: string;
  note?: string;
};

export type FailureTag =
  | 'NORMALIZATION_FAILURE'
  | 'INTERPRETATION_FAILURE'
  | 'ACT_SPLITTING_FAILURE'
  | 'ACT_COMPOSITION_FAILURE'
  | 'TEMPORAL_FAILURE'
  | 'CORRECTION_FAILURE'
  | 'REFERENCE_FAILURE'
  | 'DEPENDENCY_FAILURE'
  | 'NEGATION_FAILURE'
  | 'SAFETY_FAILURE'
  | 'ACTION_DECISION_FAILURE'
  | 'OBSERVATION_FAILURE'
  | 'CONFIRMATION_FAILURE'
  | 'STT_ROBUSTNESS_FAILURE'
  | 'DISCOURSE_STATE_FAILURE'
  | 'PLAN_REVISION_FAILURE'
  | 'UNKNOWN_FAILURE';

export type CaseResult = {
  id: string;
  category: string;
  severity: string;
  input: string;
  passed: boolean;
  actual: {
    outcome: string;
    wouldMutateWithoutConfirm: boolean;
    mustNotCreateTask: boolean;
    requiresConfirmation: boolean;
    proposalCount: number;
    surfaceSummary: string;
    uiMode: string;
  };
  reasons: string[];
  tags: FailureTag[];
};

function tagFailure(c: AdversarialCase, reasons: string[]): FailureTag[] {
  const tags = new Set<FailureTag>();
  const cat = c.category;
  if (cat === 'NEGATION' || cat === 'THINKING') tags.add('SAFETY_FAILURE');
  if (cat === 'OBSERVATION') tags.add('OBSERVATION_FAILURE');
  if (cat === 'CORRECTION') tags.add('CORRECTION_FAILURE');
  if (cat === 'TEMPORAL') tags.add('TEMPORAL_FAILURE');
  if (cat === 'DEPENDENCY') tags.add('DEPENDENCY_FAILURE');
  if (cat === 'REFERENCE') tags.add('REFERENCE_FAILURE');
  if (cat === 'COMPOUND') tags.add('ACT_SPLITTING_FAILURE');
  if (cat === 'PLAN_REVISION') tags.add('PLAN_REVISION_FAILURE');
  if (cat === 'STT_MESS' || cat === 'CAPITALIZATION') tags.add('STT_ROBUSTNESS_FAILURE');
  if (reasons.some((r) => /mutate|mustNot|safety/i.test(r))) tags.add('SAFETY_FAILURE');
  if (reasons.some((r) => /outcome/i.test(r))) tags.add('ACTION_DECISION_FAILURE');
  if (tags.size === 0) tags.add('UNKNOWN_FAILURE');
  return [...tags];
}

export function evaluateCase(c: AdversarialCase): CaseResult {
  const r = processCaptureSpeech({ text: c.input });
  const reasons: string[] = [];
  const exp = c.expect;

  if (exp.wouldMutateWithoutConfirm === false && r.wouldMutateWithoutConfirm) {
    reasons.push('wouldMutateWithoutConfirm=true (unsafe auto-create)');
  }
  if (exp.mustNotCreate === true) {
    if (r.wouldMutateWithoutConfirm) {
      reasons.push('mustNotCreate: wouldMutateWithoutConfirm');
    }
    const safeOutcomes = new Set([
      'DO_NOT_CREATE',
      'ASK_CLARIFICATION',
      'RECORD_OBSERVATION',
      'NOTE_REPORTED',
    ]);
    if (
      !r.mustNotCreateTask &&
      !safeOutcomes.has(r.outcome) &&
      r.outcome === 'CREATE_TASK' &&
      !r.requiresConfirmation
    ) {
      reasons.push(`mustNotCreate but outcome=${r.outcome}`);
    }
  }
  if (exp.outcomeIn && exp.outcomeIn.length > 0) {
    if (!exp.outcomeIn.includes(r.outcome as SemanticActionOutcome)) {
      reasons.push(`outcome=${r.outcome} not in [${exp.outcomeIn.join(',')}]`);
    }
  }
  if (exp.outcomeNot && exp.outcomeNot.includes(r.outcome as SemanticActionOutcome)) {
    reasons.push(`outcome=${r.outcome} forbidden`);
  }
  if (exp.minProposals != null && r.proposals.length < exp.minProposals) {
    reasons.push(`proposals=${r.proposals.length} < min ${exp.minProposals}`);
  }
  if (exp.maxProposals != null && r.proposals.length > exp.maxProposals) {
    reasons.push(`proposals=${r.proposals.length} > max ${exp.maxProposals}`);
  }
  if (exp.surfaceContainsAny && exp.surfaceContainsAny.length > 0) {
    const hay = `${r.surfaceSummary} ${r.normalisedText}`.toLowerCase();
    if (!exp.surfaceContainsAny.some((s) => hay.includes(s.toLowerCase()))) {
      reasons.push(`surface missing any of [${exp.surfaceContainsAny.join(',')}]`);
    }
  }

  const passed = reasons.length === 0;
  return {
    id: c.id,
    category: c.category,
    severity: c.severity,
    input: c.input,
    passed,
    actual: {
      outcome: r.outcome,
      wouldMutateWithoutConfirm: r.wouldMutateWithoutConfirm,
      mustNotCreateTask: r.mustNotCreateTask,
      requiresConfirmation: r.requiresConfirmation,
      proposalCount: r.proposals.length,
      surfaceSummary: r.surfaceSummary,
      uiMode: r.uiMode,
    },
    reasons,
    tags: passed ? [] : tagFailure(c, reasons),
  };
}

export function loadCorpus(path?: string): AdversarialCase[] {
  const p = path ?? join(process.cwd(), 'lib/speech/adversarial/corpus.json');
  return JSON.parse(readFileSync(p, 'utf8')) as AdversarialCase[];
}

export type AdversarialReport = {
  commit: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  byCategory: Record<string, { total: number; passed: number; failed: number }>;
  byTag: Record<string, number>;
  bySeverity: Record<string, { total: number; failed: number }>;
  failures: CaseResult[];
};

export function runAdversarialCorpus(corpus?: AdversarialCase[]): AdversarialReport {
  const cases = corpus ?? loadCorpus();
  const results = cases.map(evaluateCase);
  const failures = results.filter((r) => !r.passed);
  const byCategory: AdversarialReport['byCategory'] = {};
  const byTag: Record<string, number> = {};
  const bySeverity: AdversarialReport['bySeverity'] = {};

  for (const r of results) {
    if (!byCategory[r.category]) byCategory[r.category] = { total: 0, passed: 0, failed: 0 };
    byCategory[r.category].total++;
    if (r.passed) byCategory[r.category].passed++;
    else byCategory[r.category].failed++;
    if (!bySeverity[r.severity]) bySeverity[r.severity] = { total: 0, failed: 0 };
    bySeverity[r.severity].total++;
    if (!r.passed) bySeverity[r.severity].failed++;
    for (const t of r.tags) byTag[t] = (byTag[t] ?? 0) + 1;
  }

  return {
    commit: process.env.SPEECH_COMMIT ?? 'local',
    total: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    passRate: results.length ? (results.length - failures.length) / results.length : 0,
    byCategory,
    byTag,
    bySeverity,
    failures,
  };
}

export function writeReport(report: AdversarialReport, outDir: string) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'adversarial-report.json'), JSON.stringify(report, null, 2));
  return join(outDir, 'adversarial-report.json');
}
