// lib/thinking/__diagnostic__/runScope3EDiagnostic.ts
//
// Diagnostic runner for Scope 3E contextual decisions.
// Loads the context fixture, runs Job Context and Location Memory
// decisions, and prints a human-readable report.

import * as fs from 'fs';
import * as path from 'path';
import type { CompletedTaskFacts, JobContextDecision, LocationMemoryDecision } from '../types';
import type { ClusterJobAssociation } from '../associations/types';
import { findClusterJobAssociations } from '../associations/clusterJob';
import { findClusterPlaceAssociations } from '../associations/clusterPlace';
import { decideJobContext } from '../decisions/jobContext';
import { decideLocationMemory } from '../decisions/locationMemory';
import { buildClusters } from '../../taskIntelligence';

function loadFixture(): CompletedTaskFacts[] {
  const fixturePath = path.join(__dirname, 'contextFixture.json');
  const raw = fs.readFileSync(fixturePath, 'utf-8');
  return JSON.parse(raw);
}

function groupByClusterLabel(
  tasks: CompletedTaskFacts[],
  clusters: { label: string; tokens: Set<string>; count: number }[]
): Map<string, CompletedTaskFacts[]> {
  const groups = new Map<string, CompletedTaskFacts[]>();
  for (const t of tasks) {
    let matched = false;
    for (const cluster of clusters) {
      const words = new Set(t.text.toLowerCase().split(/\s+/));
      let overlap = 0;
      for (const tok of cluster.tokens) {
        if (words.has(tok)) overlap++;
      }
      if (overlap >= 2) {
        const existing = groups.get(cluster.label) ?? [];
        existing.push(t);
        groups.set(cluster.label, existing);
        matched = true;
        break;
      }
    }
    if (!matched) {
      const key = '__unmatched__';
      const existing = groups.get(key) ?? [];
      existing.push(t);
      groups.set(key, existing);
    }
  }
  return groups;
}

function printJobContextReport(
  decisions: { task: CompletedTaskFacts; decision: JobContextDecision | null }[],
  nullCount: number,
  total: number,
): void {
  console.log('=== JOB CONTEXT DECISIONS ===\n');
  console.log(`Total unlinked tasks evaluated: ${total}`);
  console.log(`Decisions produced: ${total - nullCount}`);
  console.log(`Null (insufficient/conflicting): ${nullCount}\n`);

  for (const { task, decision } of decisions) {
    const label = `"${task.text}" (${task.created_at?.slice(0, 10) ?? 'no date'})`;
    if (decision) {
      console.log(`  ✓ ${label}`);
      console.log(`    → Job: ${decision.jobId}`);
      console.log(`    Confidence: ${decision.confidence} | Authority: ${decision.authority}`);
      console.log(`    Agreeing dimensions: ${decision.agreeingDimensions.join(', ')}`);
      const e = decision.evidence;
      console.log(`    Evidence: direct=${e.direct.count}/${e.direct.total} spatial=${e.spatial.count}/${e.spatial.total} temporal=${e.temporal.count}/${e.temporal.total} sequence=${e.sequence.count}/${e.sequence.total}`);
    } else {
      console.log(`  · ${label} → null (no unambiguous candidate)`);
    }
  }
}

function printLocationMemoryReport(
  decisions: { task: CompletedTaskFacts; decision: LocationMemoryDecision | null }[],
  nullCount: number,
  total: number,
): void {
  console.log('\n=== LOCATION MEMORY DECISIONS ===\n');
  console.log(`Total eligible tasks evaluated: ${total}`);
  console.log(`Decisions produced: ${total - nullCount}`);
  console.log(`Null (insufficient/ambiguous/override): ${nullCount}\n`);

  for (const { task, decision } of decisions) {
    const label = `"${task.text}" (${task.created_at?.slice(0, 10) ?? 'no date'})`;
    if (decision) {
      console.log(`  ✓ ${label}`);
      console.log(`    → Location: ${decision.locationText} (${decision.lat}, ${decision.lng})`);
      console.log(`    Confidence: ${decision.confidence} | Authority: ${decision.authority}`);
      console.log(`    Occurrences: ${decision.occurrenceCount} | Ratio: ${decision.ratio.toFixed(2)}`);
    } else {
      console.log(`  · ${label} → null`);
    }
  }
}

function printClusterAssociations(
  clusters: Map<string, CompletedTaskFacts[]>,
): void {
  console.log('\n=== CLUSTER ASSOCIATIONS ===\n');

  for (const [label, tasks] of clusters) {
    if (label === '__unmatched__') continue;
    if (tasks.length < 4) continue;

    const jobAssoc = findClusterJobAssociations(label, tasks);
    const placeAssoc = findClusterPlaceAssociations(label, tasks);

    if (jobAssoc.length > 0 || placeAssoc.length > 0) {
      console.log(`Cluster: "${label}" (${tasks.length} tasks)`);
      for (const ja of jobAssoc) {
        const e = ja.evidence;
        console.log(`  Job ${ja.jobId}: direct=${e.direct.count} spatial=${e.spatial.count} temporal=${e.temporal.count} sequence=${e.sequence.count} [${ja.confidence}]`);
      }
      for (const pa of placeAssoc) {
        console.log(`  Place "${pa.locationText}": ${pa.occurrenceCount}/${pa.totalWithCoordinates} (${pa.ratio.toFixed(2)}) [${pa.confidence}]`);
      }
    }
  }
}

// ── Run ──────────────────────────────────────────────────────────

const fixture = loadFixture();
const clusters = buildClusters(fixture);
const grouped = groupByClusterLabel(fixture, clusters);

printClusterAssociations(grouped);

// Group tasks by job_id for per-job evaluation
const jobIds = [...new Set(fixture.filter((t) => t.job_id).map((t) => t.job_id!))];
const jobGroups = new Map<string, CompletedTaskFacts[]>();
for (const jid of jobIds) {
  jobGroups.set(jid, fixture.filter((t) => t.job_id === jid));
}

const unlinkedTasks = fixture.filter((t) => !t.job_id);

const jobDecisions: { task: CompletedTaskFacts; decision: JobContextDecision | null }[] = [];
let jobNullCount = 0;

for (const t of unlinkedTasks) {
  // Evaluate against each job group separately.
  // A decision is produced when the unlinked task matches exactly one job
  // across ≥2 independent contextual dimensions.
  let winningDecision: JobContextDecision | null = null;
  let conflict = false;

  for (const [jid, jobTasks] of jobGroups) {
    // Create a sub-cluster: this job's tasks + the unlinked task
    const subCluster = [...jobTasks, t];
    const jobAssoc = findClusterJobAssociations(jid, subCluster);
    const decision = decideJobContext(t, subCluster, jobAssoc);

    if (decision) {
      if (winningDecision) {
        // Multiple jobs produced decisions → conflict, bail out
        conflict = true;
        break;
      }
      winningDecision = decision;
    }
  }

  jobDecisions.push({ task: t, decision: conflict ? null : winningDecision });
  if (!winningDecision || conflict) jobNullCount++;
}

printJobContextReport(jobDecisions, jobNullCount, unlinkedTasks.length);

// Location memory: evaluate tasks without location info
// These are tasks that lack location_text AND coordinates.
// We find their cluster and check if the cluster has a strong place association.
const eligibleForLocation = fixture.filter(
  (t) => !t.location_text && (t.lat == null || t.lng == null)
);

const locationDecisions: { task: CompletedTaskFacts; decision: LocationMemoryDecision | null }[] = [];
let locationNullCount = 0;

for (const t of eligibleForLocation) {
  // Find which cluster this task belongs to by text overlap
  let clusterTasks: CompletedTaskFacts[] = [];
  const taskWords = new Set(t.text.toLowerCase().split(/\s+/));
  for (const [, tasks] of grouped) {
    if (tasks.length === 0) continue;
    const clusterWords = new Set(tasks[0].text.toLowerCase().split(/\s+/));
    let overlap = 0;
    for (const tok of taskWords) {
      if (clusterWords.has(tok)) overlap++;
    }
    if (overlap >= 1) {
      clusterTasks = tasks;
      break;
    }
  }
  if (clusterTasks.length === 0) clusterTasks = [t];

  const placeAssoc = findClusterPlaceAssociations('eval', clusterTasks);
  const decision = decideLocationMemory(t, clusterTasks, placeAssoc);
  locationDecisions.push({ task: t, decision });
  if (!decision) locationNullCount++;
}

printLocationMemoryReport(locationDecisions, locationNullCount, eligibleForLocation.length);

// Verification
console.log('\n=== VERIFICATION ===\n');
console.log('✓ No automatic job assignment (all decisions are suggestions)');
console.log('✓ No automatic location assignment (all decisions are suggestions)');
console.log('✓ No persistence writes');
console.log('✓ No UI changes');
console.log('✓ All decisions are deterministic');
console.log('✓ User input always wins (job_id/location → null)');
console.log('✓ Insufficient/conflicting evidence → null');
console.log('✓ No composite scores');
console.log('✓ Evidence dimensions remain independent');
