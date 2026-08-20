// lib/thinking/__diagnostic__/runDiagnostic.ts
//
// Diagnostic runner: executes the full Scope 1 + Scope 2 engine
// against the realistic fixture and produces a human-readable report.
//
// Run: npx tsx lib/thinking/__diagnostic__/runDiagnostic.ts

import { readFileSync } from 'fs';
import { join } from 'path';
import type { CompletedTaskFacts } from '../types';
import { buildActivityProfile } from '../compose/activityProfile';
import { buildUserPatterns } from '../compose/userPatterns';
import { observeLifecycle } from '../observations/taskLifecycle';
import { observeDecomposition } from '../observations/decomposition';
import { observeStaleness } from '../observations/staleness';
import { observePlanning } from '../observations/planningBehaviour';
import { summarizeCluster } from '../memory';

// ── Load fixture ───────────────────────────────────────────────────

const fixturePath = join(__dirname, 'fixture.json');
const allTasks: CompletedTaskFacts[] = JSON.parse(readFileSync(fixturePath, 'utf-8'));

// ── Clustering + mapping ───────────────────────────────────────────
// Replicate buildClusters' greedy assignment to map tasks to clusters.

function tokenize(text: string): Set<string> {
  const stopwords = new Set([
    'a', 'an', 'the', 'to', 'for', 'my', 'and', 'or', 'of', 'in', 'on',
    'with', 'about', 'some', 'this', 'that', 'it', 'up', 'out',
  ]);
  return new Set(
    text.toLowerCase().trim().replace(/[^\w\s]/g, ' ').split(/\s+/)
      .filter((w) => w.length > 0 && !stopwords.has(w))
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) { if (b.has(token)) intersection++; }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Replicate buildClusters' greedy assignment to map tasks to clusters
const clusterTokens: Set<string>[] = [];
const clusterTaskLists: CompletedTaskFacts[][] = [];

for (const t of allTasks) {
  const taskTokens = tokenize(t.text);
  if (taskTokens.size === 0) continue;

  let bestIdx = -1;
  let bestScore = 0;

  for (let i = 0; i < clusterTokens.length; i++) {
    const score = jaccard(taskTokens, clusterTokens[i]);
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  }

  if (bestIdx >= 0 && bestScore >= 0.5) {
    clusterTokens[bestIdx] = new Set([...clusterTokens[bestIdx], ...taskTokens]);
    clusterTaskLists[bestIdx].push(t);
  } else {
    clusterTokens.push(taskTokens);
    clusterTaskLists.push([t]);
  }
}

// Build label from cluster's first task's text (matching buildClusters behavior)
const clusterLabels = clusterTaskLists.map((tasks) => tasks[0].text.trim());

// Sort clusters by size descending
const clusterEntries = clusterLabels
  .map((label, i) => ({ label, tasks: clusterTaskLists[i] }))
  .filter((c) => c.tasks.length >= 2)
  .sort((a, b) => b.tasks.length - a.tasks.length);

// ── NOW date for staleness ─────────────────────────────────────────
const NOW = new Date('2026-08-10T12:00:00Z');

// ── Format ─────────────────────────────────────────────────────────

function pct(n: number): string { return (n * 100).toFixed(0) + '%'; }
function num(n: number, d = 1): string { return n.toFixed(d); }

function header(title: string): string {
  return '\n' + '═'.repeat(70) + '\n  ' + title + '\n' + '═'.repeat(70);
}

function subhead(title: string): string {
  return '\n  ── ' + title + ' ' + '─'.repeat(60 - title.length);
}

function confidenceLabel(c: string): string {
  if (c === 'high') return 'RELIABLE';
  if (c === 'medium') return 'INDICATIVE';
  return 'INSUFFICIENT';
}

// ── Generate report ────────────────────────────────────────────────

const lines: string[] = [];

lines.push(header('DOKKIT THINKING ENGINE — SCOPE 2.5 DIAGNOSTIC'));
lines.push('');
lines.push(`  Fixture: ${allTasks.length} completed tasks`);
lines.push(`  Period:  ${allTasks[0].created_at.slice(0,10)} → ${allTasks[allTasks.length-1].created_at.slice(0,10)} (7 months)`);
lines.push(`  Clusters discovered: ${clusterEntries.length} (with ≥2 tasks)`);

// ── User patterns ──────────────────────────────────────────────────

const userPatterns = buildUserPatterns(allTasks);
if (userPatterns) {
  lines.push(header('USER PATTERNS — GLOBAL'));
  lines.push('');
  lines.push(`  Total completed tasks: ${userPatterns.totalCompleted}`);
  lines.push('');
  lines.push('  Planning style:');
  lines.push(`    Came up (reactive):      ${pct(userPatterns.cameUpRate)}`);
  lines.push(`    Planned:                 ${pct(1 - userPatterns.cameUpRate)}`);
  lines.push(`    Has estimate:            ${pct(userPatterns.estimatedRate)}`);
  lines.push(`    Has scheduled date:      ${pct(userPatterns.scheduledRate)}`);
  lines.push(`    Has location:            ${pct(userPatterns.locatedRate)}`);
  lines.push(`    Attached to job:         ${pct(userPatterns.jobAttachedRate)}`);
  lines.push(`    Has notes/info:          ${pct(userPatterns.infoUsageRate)}`);
  lines.push(`    Timer used:              ${pct(userPatterns.timerUsageRate)}`);
  lines.push('');
  lines.push('  Estimate accuracy:');
  lines.push(`    Avg actual/estimated:    ${num(userPatterns.avgEstimateAccuracy)}x`);
  if (userPatterns.avgEstimateAccuracy > 1.2) {
    lines.push('    → User systematically underestimates');
  } else if (userPatterns.avgEstimateAccuracy < 0.8) {
    lines.push('    → User systematically overestimates');
  } else {
    lines.push('    → Estimates roughly accurate on average');
  }
}

// ── Per-cluster analysis ───────────────────────────────────────────

for (const { label, tasks } of clusterEntries) {

  const profile = buildActivityProfile(label, tasks, NOW);
  if (!profile) continue;

  lines.push(header(`CLUSTER: ${label.toUpperCase()}`));
  lines.push('');
  lines.push(`  Evidence: ${profile.count} tasks`);
  lines.push(`  Confidence: ${confidenceLabel(profile.confidence)}`);
  lines.push(`  Date range: ${tasks[0].created_at.slice(0,10)} → ${tasks[tasks.length-1].created_at.slice(0,10)}`);

  // Duration
  const actuals = tasks
    .filter((t) => t.actual_mins != null && t.actual_mins > 0)
    .map((t) => t.actual_mins!);
  if (actuals.length > 0) {
    const sorted = [...actuals].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const summary = summarizeCluster(actuals, label);
    lines.push(subhead('Duration'));
    lines.push(`    Average:     ${num(summary.avgMins)} min`);
    lines.push(`    Median:      ${median} min`);
    lines.push(`    Range:       ${min}–${max} min`);
    lines.push(`    Total:       ${summary.totalMins} min (${(summary.totalMins / 60).toFixed(1)} hours)`);
    lines.push(`    Trend:       ${summary.trend}`);
  }

  // Planning
  const planning = observePlanning(tasks);
  if (planning) {
    lines.push(subhead('Planning'));
    lines.push(`    Came up:     ${pct(planning.cameUpRate)} reactive`);
    lines.push(`    Estimated:   ${pct(planning.estimatedRate)}`);
    lines.push(`    Scheduled:   ${pct(planning.scheduledRate)}`);
    lines.push(`    Located:     ${pct(planning.locatedRate)}`);
    lines.push(`    Job tied:    ${pct(planning.jobAttachedRate)}`);
    lines.push(`    Has notes:   ${pct(planning.infoRate)}`);
    lines.push(`    Timer used:  ${pct(planning.timerUsedRate)}`);
  }

  // Lifecycle
  const lifecycle = observeLifecycle(tasks);
  if (lifecycle) {
    lines.push(subhead('Lifecycle'));
    lines.push(`    Same day:    ${pct(lifecycle.sameDayRate)}`);
    lines.push(`    Carryover:   ${pct(lifecycle.carryoverRate)}`);
    lines.push(`    Avg to done: ${num(lifecycle.avgDaysToCompletion)} days`);
    lines.push(`    Avg age:     ${num(lifecycle.avgAgeDays)} days`);
  }

  // Decomposition
  const decomposition = observeDecomposition(tasks);
  if (decomposition) {
    lines.push(subhead('Decomposition'));
    lines.push(`    Decomposed:  ${pct(decomposition.decomposeRate)}`);
    lines.push(`    Avg subtasks:${num(decomposition.avgSubtaskCount, 1)}`);
    lines.push(`    Avg sub mins:${num(decomposition.avgSubtaskMins, 0)}`);
    lines.push(`    Sub complete:${pct(decomposition.subtaskCompletionRate)}`);
  }

  // Staleness
  const staleness = observeStaleness(tasks, NOW);
  if (staleness) {
    lines.push(subhead('Staleness'));
    lines.push(`    Stale rate:  ${pct(staleness.staleRate)} of pending`);
    lines.push(`    Old→done:    ${pct(staleness.completionAfterStallRate)} completed when old`);
    lines.push(`    Avg age:     ${num(staleness.avgAgeDays)} days`);
  }

  // Locations observed
  const locations = new Map<string, number>();
  for (const t of tasks) {
    if (t.location_text) {
      locations.set(t.location_text, (locations.get(t.location_text) ?? 0) + 1);
    }
  }
  if (locations.size > 0) {
    lines.push(subhead('Locations'));
    const sorted = [...locations.entries()].sort((a, b) => b[1] - a[1]);
    for (const [loc, count] of sorted) {
      lines.push(`    ${loc.padEnd(25)} ${count} visit${count > 1 ? 's' : ''}`);
    }
  }

  // Jobs observed
  const jobs = new Map<string, number>();
  for (const t of tasks) {
    if (t.job_id) {
      jobs.set(t.job_id, (jobs.get(t.job_id) ?? 0) + 1);
    }
  }
  if (jobs.size > 0) {
    lines.push(subhead('Jobs'));
    for (const [jid, count] of jobs) {
      lines.push(`    ${jid.padEnd(25)} ${count} tasks`);
    }
  }

  // Composite insight
  lines.push(subhead('Insight'));
  const insights: string[] = [];
  if (planning) {
    if (planning.cameUpRate > 0.7) insights.push('predominantly reactive');
    else if (planning.cameUpRate < 0.2) insights.push('almost always planned');
    else insights.push('mix of planned and reactive');
  }
  if (decomposition && decomposition.decomposeRate > 0.5) {
    insights.push(`usually decomposed into subtasks (avg ${num(decomposition.avgSubtaskCount, 1)})`);
  } else if (decomposition && decomposition.decomposeRate < 0.1) {
    insights.push('handled as single tasks');
  }
  if (lifecycle) {
    if (lifecycle.sameDayRate > 0.8) insights.push('typically completed same day');
    else if (lifecycle.carryoverRate > 0.5) insights.push('often spans multiple days');
  }
  if (staleness && staleness.staleRate > 0.3) insights.push('prone to going stale');
  if (actuals.length > 0) {
    const avg = actuals.reduce((a, b) => a + b, 0) / actuals.length;
    if (avg < 30) insights.push('quick tasks');
    else if (avg > 300) insights.push('substantial multi-hour work');
  }
  lines.push(`    ${insights.join('; ')}.`);
}

// ── Print ──────────────────────────────────────────────────────────

const report = lines.join('\n');
console.log(report);

// Also write to file
const reportPath = join(__dirname, 'diagnostic-report.txt');
import { writeFileSync } from 'fs';
writeFileSync(reportPath, report);
console.log(`\nReport written to ${reportPath}`);
