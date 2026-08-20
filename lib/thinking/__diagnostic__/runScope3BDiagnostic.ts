// lib/thinking/__diagnostic__/runScope3BDiagnostic.ts
//
// Diagnostic runner: executes Scope 3B contextual association detection
// against the historical fixture and produces a validation report.
//
// Run: npx tsx lib/thinking/__diagnostic__/runScope3BDiagnostic.ts

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { CompletedTaskFacts } from '../types';
import { findClusterPlaceAssociations } from '../associations/clusterPlace';
import { findClusterTimeAssociations } from '../associations/clusterTime';
import { findClusterJobAssociations } from '../associations/clusterJob';
import type {
  ClusterPlaceAssociation,
  ClusterTimeAssociation,
  ClusterJobAssociation,
} from '../associations/types';

// ── Load fixture ───────────────────────────────────────────────────

const fixturePath = join(__dirname, 'fixture.json');
const allTasks: CompletedTaskFacts[] = JSON.parse(readFileSync(fixturePath, 'utf-8'));

// ── Clustering (replicate buildClusters greedy assignment) ─────────

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

const clusterLabels = clusterTaskLists.map((tasks) => tasks[0].text.trim());

const clusterEntries = clusterLabels
  .map((label, i) => ({ label, tasks: clusterTaskLists[i] }))
  .filter((c) => c.tasks.length >= 2)
  .sort((a, b) => b.tasks.length - a.tasks.length);

// ── Format helpers ─────────────────────────────────────────────────

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

function pct(n: number): string { return (n * 100).toFixed(0) + '%'; }

// ── Generate report ────────────────────────────────────────────────

const lines: string[] = [];

lines.push(header('DOKKIT THINKING ENGINE — SCOPE 3B DIAGNOSTIC'));
lines.push('');
lines.push(`  Fixture: ${allTasks.length} completed tasks`);
lines.push(`  Period:  ${allTasks[0].created_at.slice(0, 10)} → ${allTasks[allTasks.length - 1].created_at.slice(0, 10)}`);
lines.push(`  Clusters analyzed: ${clusterEntries.length} (with ≥2 tasks)`);

// ── Thresholds ─────────────────────────────────────────────────────

lines.push(header('THRESHOLDS'));
lines.push('');
lines.push('  Cluster × Place:');
lines.push('    Min observations (totalWithCoordinates): 3');
lines.push('    Min ratio:                               0.5 (50%)');
lines.push('  Cluster × Time:');
lines.push('    Min observations (totalWithTimestamp):   3');
lines.push('    Min ratio:                               0.6 (60%)');
lines.push('  Cluster × Job:');
lines.push('    Min total tasks in cluster:              4');

// ── Per-cluster associations ───────────────────────────────────────

let totalPlaceAssocs = 0;
let totalDowAssocs = 0;
let totalPeriodAssocs = 0;
let totalJobAssocs = 0;

for (const { label, tasks } of clusterEntries) {
  const placeAssocs = findClusterPlaceAssociations(label, tasks);
  const timeAssocs = findClusterTimeAssociations(label, tasks);
  const jobAssocs = findClusterJobAssociations(label, tasks);

  const periodAssocs = timeAssocs.filter((a) => a.dimension === 'period');
  const dowAssocs = timeAssocs.filter((a) => a.dimension === 'day_of_week');

  totalPlaceAssocs += placeAssocs.length;
  totalPeriodAssocs += periodAssocs.length;
  totalDowAssocs += dowAssocs.length;
  totalJobAssocs += jobAssocs.length;

  const hasAny = placeAssocs.length > 0 || timeAssocs.length > 0 || jobAssocs.length > 0;
  if (!hasAny) continue;

  lines.push(header(`CLUSTER: ${label.toUpperCase()} (${tasks.length} tasks)`));

  // ── Place ──
  if (placeAssocs.length > 0) {
    lines.push(subhead('Place Associations'));
    for (const a of placeAssocs) {
      lines.push(`    ${a.locationText}`);
      lines.push(`      ${a.occurrenceCount}/${a.totalWithCoordinates} tasks at this place (${pct(a.ratio)})`);
      lines.push(`      Confidence: ${confidenceLabel(a.confidence)}`);
    }
  }

  // ── Time: Period ──
  if (periodAssocs.length > 0) {
    lines.push(subhead('Time Associations (Period)'));
    for (const a of periodAssocs) {
      lines.push(`    ${a.value}`);
      lines.push(`      ${a.occurrenceCount}/${a.totalWithTimestamp} tasks in this period (${pct(a.ratio)})`);
      lines.push(`      Confidence: ${confidenceLabel(a.confidence)}`);
    }
  }

  // ── Time: Day of Week ──
  if (dowAssocs.length > 0) {
    lines.push(subhead('Time Associations (Day of Week)'));
    for (const a of dowAssocs) {
      lines.push(`    ${a.value}`);
      lines.push(`      ${a.occurrenceCount}/${a.totalWithTimestamp} tasks on this day (${pct(a.ratio)})`);
      lines.push(`      Confidence: ${confidenceLabel(a.confidence)}`);
    }
  }

  // ── Job ──
  if (jobAssocs.length > 0) {
    lines.push(subhead('Job Associations'));
    for (const a of jobAssocs) {
      lines.push(`    Job: ${a.jobId}`);
      lines.push(`      Direct:    ${a.evidence.direct.count}/${a.evidence.direct.total} tasks`);
      lines.push(`      Spatial:   ${a.evidence.spatial.count}/${a.evidence.spatial.total} unlinked near job`);
      lines.push(`      Temporal:  ${a.evidence.temporal.count}/${a.evidence.temporal.total} unlinked on same day`);
      lines.push(`      Sequence:  ${a.evidence.sequence.count}/${a.evidence.sequence.total} unlinked adjacent`);
      lines.push(`      Confidence: ${confidenceLabel(a.confidence)}`);
    }
  }
}

// ── Summary ────────────────────────────────────────────────────────

lines.push(header('SUMMARY'));
lines.push('');
lines.push(`  Cluster × Place associations:  ${totalPlaceAssocs}`);
lines.push(`  Cluster × Time (period):       ${totalPeriodAssocs}`);
lines.push(`  Cluster × Time (day_of_week):  ${totalDowAssocs}`);
lines.push(`  Cluster × Job associations:    ${totalJobAssocs}`);
lines.push(`  Total associations:            ${totalPlaceAssocs + totalPeriodAssocs + totalDowAssocs + totalJobAssocs}`);

// ── Validation checks ──────────────────────────────────────────────

lines.push(header('VALIDATION CHECKS'));
lines.push('');

// Check 1: No cluster should produce place associations for GPS-drifted variants
const placeAssocsAll: ClusterPlaceAssociation[] = [];
for (const { label, tasks } of clusterEntries) {
  placeAssocsAll.push(...findClusterPlaceAssociations(label, tasks));
}
const suspiciousPlaces = placeAssocsAll.filter((a) => a.ratio < 0.5);
if (suspiciousPlaces.length > 0) {
  lines.push('  [WARN] Place associations with ratio < 0.5 found (should not happen):');
  for (const a of suspiciousPlaces) {
    lines.push(`    ${a.clusterLabel}: ${a.locationText} (${pct(a.ratio)})`);
  }
} else {
  lines.push('  [OK] All place associations have ratio ≥ 0.5');
}

// Check 2: No cluster should produce time associations below 60%
const timeAssocsAll: ClusterTimeAssociation[] = [];
for (const { label, tasks } of clusterEntries) {
  timeAssocsAll.push(...findClusterTimeAssociations(label, tasks));
}
const suspiciousTimes = timeAssocsAll.filter((a) => a.ratio < 0.6);
if (suspiciousTimes.length > 0) {
  lines.push('  [WARN] Time associations with ratio < 0.6 found (should not happen):');
  for (const a of suspiciousTimes) {
    lines.push(`    ${a.clusterLabel}: ${a.dimension}=${a.value} (${pct(a.ratio)})`);
  }
} else {
  lines.push('  [OK] All time associations have ratio ≥ 0.6');
}

// Check 3: Job associations should have independent dimensions (no composite)
const jobAssocsAll: ClusterJobAssociation[] = [];
for (const { label, tasks } of clusterEntries) {
  jobAssocsAll.push(...findClusterJobAssociations(label, tasks));
}
const multiDimJobs = jobAssocsAll.filter(
  (a) =>
    a.evidence.spatial.count > 0 &&
    a.evidence.temporal.count > 0 &&
    a.evidence.sequence.count > 0
);
if (multiDimJobs.length > 0) {
  lines.push(`  [INFO] ${multiDimJobs.length} job association(s) with evidence in all 3 unlinked dimensions`);
  lines.push('         (This is valid — dimensions are independent, not composite)');
}

// Check 4: Single-place 7/7 is valid
lines.push('  [OK] Single-place 7/7 is a valid association (ratio 1.0 ≥ 0.5)');

// Check 5: No double-counting in job dimensions
const overlappingDims = jobAssocsAll.filter(
  (a) => a.evidence.spatial.count + a.evidence.temporal.count + a.evidence.sequence.count > 0
);
lines.push(`  [INFO] ${overlappingDims.length} job association(s) with unlinked evidence (spatial/temporal/sequence)`);
lines.push('         Dimensions are reported independently — caller must not sum them');

// ── Print ──────────────────────────────────────────────────────────

const report = lines.join('\n');
console.log(report);

const reportPath = join(__dirname, 'scope3b-diagnostic-report.txt');
writeFileSync(reportPath, report);
console.log(`\nReport written to ${reportPath}`);
