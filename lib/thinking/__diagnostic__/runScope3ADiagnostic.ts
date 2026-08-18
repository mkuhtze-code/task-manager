// lib/thinking/__diagnostic__/runScope3ADiagnostic.ts
//
// Diagnostic runner: executes Scope 3A spatial, temporal, and sequencing
// primitives against the historical fixture and produces a validation report.
//
// Run: npx tsx lib/thinking/__diagnostic__/runScope3ADiagnostic.ts

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { CompletedTaskFacts } from '../types';
import { distanceMeters, areSamePlace } from '../relationships/spatial';
import { extractTemporalContext, isSameDay, groupByDate } from '../relationships/temporal';
import { orderChronologically, buildAdjacencyPairs, aggregateAdjacency } from '../relationships/sequencing';

// ── Load fixture ───────────────────────────────────────────────────

const fixturePath = join(__dirname, 'fixture.json');
const allTasks: CompletedTaskFacts[] = JSON.parse(readFileSync(fixturePath, 'utf-8'));

// ── Format helpers ─────────────────────────────────────────────────

function header(title: string): string {
  return '\n' + '═'.repeat(70) + '\n  ' + title + '\n' + '═'.repeat(70);
}

function subhead(title: string): string {
  return '\n  ── ' + title + ' ' + '─'.repeat(60 - title.length);
}

// ── Generate report ────────────────────────────────────────────────

const lines: string[] = [];

lines.push(header('DOKKIT THINKING ENGINE — SCOPE 3A DIAGNOSTIC'));
lines.push('');
lines.push(`  Fixture: ${allTasks.length} completed tasks`);
lines.push(`  Period:  ${allTasks[0].created_at.slice(0, 10)} → ${allTasks[allTasks.length - 1].created_at.slice(0, 10)}`);

// ── 1. Spatial analysis ───────────────────────────────────────────

lines.push(header('SPATIAL RELATIONSHIPS'));

const locatedTasks = allTasks.filter((t) => t.lat != null && t.lng != null);
lines.push(`\n  Tasks with coordinates: ${locatedTasks.length} / ${allTasks.length}`);

// Unique locations by text
const locationTexts = new Map<string, { lat: number; lng: number; count: number }>();
for (const t of locatedTasks) {
  const key = t.location_text ?? '(no text)';
  const existing = locationTexts.get(key);
  if (existing) {
    existing.count++;
  } else {
    locationTexts.set(key, { lat: t.lat!, lng: t.lng!, count: 1 });
  }
}

lines.push(subhead('Known Locations (by text)'));
const sortedLocs = [...locationTexts.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [text, info] of sortedLocs) {
  lines.push(`    ${text.padEnd(30)} ${info.count} tasks  (${info.lat.toFixed(4)}, ${info.lng.toFixed(4)})`);
}

// Same-place pairs: which location texts share coordinates within 50m?
lines.push(subhead('Same-Place Pairs (≤50m)'));
const locEntries = [...locationTexts.entries()];
let samePlaceCount = 0;
const samePlacePairs: string[] = [];
for (let i = 0; i < locEntries.length; i++) {
  for (let j = i + 1; j < locEntries.length; j++) {
    const [textA, infoA] = locEntries[i];
    const [textB, infoB] = locEntries[j];
    if (areSamePlace(infoA, infoB)) {
      const d = distanceMeters(infoA, infoB);
      samePlacePairs.push(`    "${textA}" ↔ "${textB}" (${d.toFixed(1)}m)`);
      samePlaceCount++;
    }
  }
}
if (samePlaceCount === 0) {
  lines.push('    No location texts share coordinates within 50m.');
  lines.push('    (This is expected — the fixture uses distinct locations per job.)');
} else {
  for (const pair of samePlacePairs) {
    lines.push(pair);
  }
}
lines.push(`\n  Total same-place pairs: ${samePlaceCount}`);

// Coordinate distance distribution
lines.push(subhead('Coordinate Distance Distribution'));
if (locatedTasks.length >= 2) {
  const distances: number[] = [];
  // Sample pairwise distances between located tasks (max 500 pairs to keep fast)
  const sampleSize = Math.min(locatedTasks.length, 30);
  const sample = locatedTasks.slice(0, sampleSize);
  for (let i = 0; i < sample.length; i++) {
    for (let j = i + 1; j < sample.length; j++) {
      distances.push(
        distanceMeters(
          { lat: sample[i].lat!, lng: sample[i].lng! },
          { lat: sample[j].lat!, lng: sample[j].lng! }
        )
      );
    }
  }
  distances.sort((a, b) => a - b);
  const min = distances[0];
  const max = distances[distances.length - 1];
  const median = distances[Math.floor(distances.length / 2)];
  const p10 = distances[Math.floor(distances.length * 0.1)];
  const p90 = distances[Math.floor(distances.length * 0.9)];
  lines.push(`    Min:       ${min.toFixed(0)}m`);
  lines.push(`    P10:       ${p10.toFixed(0)}m`);
  lines.push(`    Median:    ${median.toFixed(0)}m`);
  lines.push(`    P90:       ${p90.toFixed(0)}m`);
  lines.push(`    Max:       ${max.toFixed(0)}m`);
  lines.push(`    Pairs:     ${distances.length}`);
} else {
  lines.push('    Not enough located tasks for distance analysis.');
}

// ── 2. Temporal analysis ──────────────────────────────────────────

lines.push(header('TEMPORAL RELATIONSHIPS'));

// Time-of-day distribution
lines.push(subhead('Hour-of-Day Distribution (all tasks)'));
const hourCounts = new Map<number, number>();
const periodCounts = new Map<string, number>();
for (const t of allTasks) {
  const ctx = extractTemporalContext(t.created_at);
  hourCounts.set(ctx.hour, (hourCounts.get(ctx.hour) ?? 0) + 1);
  periodCounts.set(ctx.period, (periodCounts.get(ctx.period) ?? 0) + 1);
}
for (let h = 0; h < 24; h++) {
  const count = hourCounts.get(h) ?? 0;
  const bar = '█'.repeat(Math.round((count / allTasks.length) * 80));
  lines.push(`    ${String(h).padStart(2, '0')}:00  ${bar} ${count}`);
}

lines.push(subhead('Period Distribution'));
for (const [period, count] of [...periodCounts.entries()].sort((a, b) => b[1] - a[1])) {
  const pct = ((count / allTasks.length) * 100).toFixed(0);
  lines.push(`    ${period.padEnd(12)} ${String(count).padStart(3)} tasks  (${pct}%)`);
}

// Day-of-week distribution
lines.push(subhead('Day-of-Week Distribution'));
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const dowCounts = new Map<number, number>();
for (const t of allTasks) {
  const ctx = extractTemporalContext(t.created_at);
  dowCounts.set(ctx.dayOfWeek, (dowCounts.get(ctx.dayOfWeek) ?? 0) + 1);
}
for (let d = 0; d < 7; d++) {
  const count = dowCounts.get(d) ?? 0;
  const bar = '█'.repeat(Math.round((count / allTasks.length) * 60));
  lines.push(`    ${dayNames[d]}  ${bar} ${count}`);
}

// Same-day relationships
lines.push(subhead('Same-Day Relationships'));
const dayGroups = groupByDate(allTasks, (t) => t.created_at);
let totalSameDayPairs = 0;
const multiTaskDays: { date: string; count: number }[] = [];
for (const [date, tasks] of dayGroups) {
  if (tasks.length >= 2) {
    multiTaskDays.push({ date, count: tasks.length });
    totalSameDayPairs += tasks.length - 1; // sequential pairs per day
  }
}
lines.push(`  Days with tasks:            ${dayGroups.size}`);
lines.push(`  Days with ≥2 tasks:         ${multiTaskDays.length}`);
lines.push(`  Total same-day pairs:       ${totalSameDayPairs}`);
if (multiTaskDays.length > 0) {
  lines.push('');
  lines.push('  Busiest days:');
  const sorted = multiTaskDays.sort((a, b) => b.count - a.count).slice(0, 10);
  for (const { date, count } of sorted) {
    lines.push(`    ${date}  ${count} tasks`);
  }
}

// ── 3. Sequencing analysis ────────────────────────────────────────

lines.push(header('SEQUENTIAL RELATIONSHIPS'));

// Build adjacency from all tasks
const allPairs = buildAdjacencyPairs(allTasks);
lines.push(`\n  Total adjacency pairs: ${allPairs.length}`);

const aggregated = aggregateAdjacency(allPairs);
lines.push(`  Unique adjacency patterns: ${aggregated.length}`);

lines.push(subhead('Top 20 Repeated Adjacencies'));
const top20 = aggregated.slice(0, 20);
for (const adj of top20) {
  const dates = adj.occurrences.map((o) => o.date.slice(5)).join(', ');
  lines.push(`    ${adj.preceding.padEnd(25)} → ${adj.following.padEnd(25)}  ×${adj.count}  [${dates}]`);
}

// Distribution of adjacency counts
lines.push(subhead('Adjacency Frequency Distribution'));
const freqBuckets = new Map<number, number>();
for (const adj of aggregated) {
  freqBuckets.set(adj.count, (freqBuckets.get(adj.count) ?? 0) + 1);
}
for (const [count, freq] of [...freqBuckets.entries()].sort((a, b) => b[0] - a[0])) {
  lines.push(`    ×${count}  ${freq} pattern${freq > 1 ? 's' : ''}`);
}

// Mean time gap between adjacent tasks
lines.push(subhead('Time Gap Between Adjacent Tasks'));
const gaps = allPairs
  .filter((p) => p.gapMinutes != null && p.gapMinutes >= 0)
  .map((p) => p.gapMinutes!);
if (gaps.length > 0) {
  gaps.sort((a, b) => a - b);
  const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const median = gaps[Math.floor(gaps.length / 2)];
  const min = gaps[0];
  const max = gaps[gaps.length - 1];
  lines.push(`    Min:     ${min} min`);
  lines.push(`    Median:  ${median} min`);
  lines.push(`    Mean:    ${avg.toFixed(0)} min`);
  lines.push(`    Max:     ${max} min`);
  lines.push(`    Pairs:   ${gaps.length}`);
} else {
  lines.push('    No valid time gaps.');
}

// ── 4. Cross-analysis: same-day ordering by period ────────────────

lines.push(header('CROSS-ANALYSIS'));

lines.push(subhead('Typical Daily Sequence (by period)'));
const periodSequence = new Map<string, Map<string, number>>();
for (const pair of allPairs) {
  const aCtx = extractTemporalContext(pair.date + 'T00:00:00Z');
  // Use the preceding task's actual time to get its period
  // Re-derive from the full task list
  const precedingTask = allTasks.find((t) => t.text === pair.preceding && t.created_at.startsWith(pair.date));
  const followingTask = allTasks.find((t) => t.text === pair.following && t.created_at.startsWith(pair.date));
  if (precedingTask && followingTask) {
    const aPeriod = extractTemporalContext(precedingTask.created_at).period;
    const bPeriod = extractTemporalContext(followingTask.created_at).period;
    const key = `${aPeriod} → ${bPeriod}`;
    const inner = periodSequence.get(key) ?? new Map();
    inner.set(pair.preceding + ' → ' + pair.following, (inner.get(pair.preceding + ' → ' + pair.following) ?? 0) + 1);
    periodSequence.set(key, inner);
  }
}
for (const [transition, patterns] of [...periodSequence.entries()].sort((x, y) => {
  const xTotal = [...x[1].values()].reduce((s, v) => s + v, 0);
  const yTotal = [...y[1].values()].reduce((s, v) => s + v, 0);
  return yTotal - xTotal;
})) {
  const total = [...patterns.values()].reduce((s, v) => s + v, 0);
  const topPattern = [...patterns.entries()].sort((a, b) => b[1] - a[1])[0];
  lines.push(`    ${transition.padEnd(25)} ${String(total).padStart(3)} pairs   most common: ${topPattern[0]} (×${topPattern[1]})`);
}

// ── Print ──────────────────────────────────────────────────────────

const report = lines.join('\n');
console.log(report);

// Also write to file
const reportPath = join(__dirname, 'scope3a-diagnostic-report.txt');
writeFileSync(reportPath, report);
console.log(`\nReport written to ${reportPath}`);
