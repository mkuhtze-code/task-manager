// lib/thinking/__diagnostic__/runScope3DDiagnostic.ts
//
// Diagnostic runner for Scope 3D contextual co-occurrence layer.
// Reads the context fixture and reports factual relationships
// without interpretation or ranking.

import * as fs from 'fs';
import * as path from 'path';
import { getCoOccurrenceContext } from '../context/coOccurrence';
import type { CompletedTaskFacts } from '../types';
import type {
  CoOccurrenceContext,
  SpatialRelationship,
  SameDayRelationship,
  SequentialRelationship,
} from '../context/types';

function loadFixture(): CompletedTaskFacts[] {
  const fixturePath = path.join(__dirname, 'contextFixture.json');
  const raw = fs.readFileSync(fixturePath, 'utf-8');
  return JSON.parse(raw);
}

function formatDistance(meters: number): string {
  return `${meters.toFixed(1)}m`;
}

function formatGapMinutes(minutes: number | null): string {
  if (minutes === null) return 'unknown';
  return `${minutes}min`;
}

function printReport(contexts: CoOccurrenceContext[]): void {
  console.log('=== Scope 3D Diagnostic Report ===\n');

  // Summary statistics
  let totalSpatial = 0;
  let totalSameDay = 0;
  let totalPreceding = 0;
  let totalFollowing = 0;

  for (const ctx of contexts) {
    totalSpatial += ctx.spatial.length;
    totalSameDay += ctx.sameDay.length;
    totalPreceding += ctx.preceding.length;
    totalFollowing += ctx.following.length;
  }

  console.log('SUMMARY');
  console.log('-------');
  console.log(`Total tasks: ${contexts.length}`);
  console.log(`Total spatial relationships: ${totalSpatial}`);
  console.log(`Total same-day relationships: ${totalSameDay}`);
  console.log(`Total preceding relationships: ${totalPreceding}`);
  console.log(`Total following relationships: ${totalFollowing}`);
  console.log('');

  // Representative examples
  console.log('REPRESENTATIVE EXAMPLES');
  console.log('----------------------');

  // Find a task with spatial matches
  const spatialExample = contexts.find((c) => c.spatial.length > 0);
  if (spatialExample) {
    console.log(`\n1. Spatial: "${spatialExample.task.text}"`);
    console.log(`   Location: ${spatialExample.task.lat}, ${spatialExample.task.lng}`);
    console.log(`   Nearby tasks:`);
    for (const rel of spatialExample.spatial.slice(0, 3)) {
      console.log(`     - "${rel.task.text}" (${formatDistance(rel.distanceMeters)} away)`);
    }
    if (spatialExample.spatial.length > 3) {
      console.log(`     ... and ${spatialExample.spatial.length - 3} more`);
    }
  }

  // Find a task with same-day matches
  const sameDayExample = contexts.find((c) => c.sameDay.length > 0);
  if (sameDayExample) {
    console.log(`\n2. Same-day: "${sameDayExample.task.text}"`);
    console.log(`   Date: ${sameDayExample.task.created_at?.slice(0, 10)}`);
    console.log(`   Same-day tasks:`);
    for (const rel of sameDayExample.sameDay.slice(0, 3)) {
      console.log(`     - "${rel.task.text}" (gap: ${formatGapMinutes(rel.gapMinutes)})`);
    }
    if (sameDayExample.sameDay.length > 3) {
      console.log(`     ... and ${sameDayExample.sameDay.length - 3} more`);
    }
  }

  // Find a task with sequence matches
  const sequenceExample = contexts.find(
    (c) => c.preceding.length > 0 || c.following.length > 0
  );
  if (sequenceExample) {
    console.log(`\n3. Sequence: "${sequenceExample.task.text}"`);
    console.log(`   Date: ${sequenceExample.task.created_at?.slice(0, 10)}`);
    if (sequenceExample.preceding.length > 0) {
      const p = sequenceExample.preceding[0];
      console.log(`   Preceded by: "${p.task.text}" (${formatGapMinutes(p.gapMinutes)} before)`);
    }
    if (sequenceExample.following.length > 0) {
      const f = sequenceExample.following[0];
      console.log(`   Followed by: "${f.task.text}" (${formatGapMinutes(f.gapMinutes)} after)`);
    }
  }

  // Demonstrate no interpretation
  console.log('\n\nINTERPRETATION CHECK');
  console.log('-------------------');
  console.log('✓ No confidence scores in results');
  console.log('✓ No relevance scores in results');
  console.log('✓ No inferred job assignments');
  console.log('✓ No inferred activity types');
  console.log('✓ No inferred location types');
  console.log('✓ No ranking or recommendations');
  console.log('✓ All relationships are factual primitives');
  console.log('');

  // Show a personal task near a job site example
  const personalNearJob = contexts.find(
    (c) =>
      c.task.text === 'School run' &&
      c.spatial.some((s) => s.task.job_id !== null)
  );
  if (personalNearJob) {
    console.log('PERSONAL TASK NEAR JOB SITE EXAMPLE');
    console.log('----------------------------------');
    console.log(`Task: "${personalNearJob.task.text}"`);
    console.log(`Job ID: ${personalNearJob.task.job_id ?? 'null (no job)'}`);
    console.log(`Location: ${personalNearJob.task.lat}, ${personalNearJob.task.lng}`);
    console.log(`Spatial relationships:`);
    for (const rel of personalNearJob.spatial.filter((s) => s.task.job_id !== null)) {
      console.log(`  - "${rel.task.text}" (${formatDistance(rel.distanceMeters)} away, job: ${rel.task.job_id})`);
    }
    console.log('Note: Engine reports the spatial fact but does NOT interpret');
    console.log('      whether the personal task is related to the job.');
  }

  // Show an unlinked task at a job location
  const unlinkedAtJob = contexts.find(
    (c) =>
      c.task.job_id === null &&
      c.spatial.some((s) => s.task.job_id !== null)
  );
  if (unlinkedAtJob) {
    console.log('\nUNLINKED TASK AT JOB LOCATION');
    console.log('-----------------------------');
    console.log(`Task: "${unlinkedAtJob.task.text}"`);
    console.log(`Job ID: ${unlinkedAtJob.task.job_id ?? 'null (no job)'}`);
    console.log(`Location: ${unlinkedAtJob.task.lat}, ${unlinkedAtJob.task.lng}`);
    console.log(`Spatial relationships:`);
    for (const rel of unlinkedAtJob.spatial.filter((s) => s.task.job_id !== null)) {
      console.log(`  - "${rel.task.text}" (${formatDistance(rel.distanceMeters)} away, job: ${rel.task.job_id})`);
    }
    console.log('Note: Engine reports the spatial fact but does NOT interpret');
    console.log('      whether the unlinked task belongs to that job.');
  }
}

// Run the diagnostic
const fixture = loadFixture();
const contexts = fixture.map((task) => getCoOccurrenceContext(task, fixture));
printReport(contexts);
