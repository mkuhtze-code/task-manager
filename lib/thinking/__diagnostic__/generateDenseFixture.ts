// lib/thinking/__diagnostic__/generateDenseFixture.ts
//
// Dense contextual fixture for Scope 3B validation.
// Tests spatial ambiguity, nearby jobs, repeated sequences,
// false-positive traps, and multi-dimensional evidence.
//
// Run: npx tsx lib/thinking/__diagnostic__/generateDenseFixture.ts

import { writeFileSync } from 'fs';
import { join } from 'path';
import type { CompletedTaskFacts } from '../types';

// ── Locations (close together for spatial ambiguity) ────────────────

const LOC = {
  home:      { text: 'Home',          lat: 52.4862, lng: -1.8904 },
  homeArea:  { text: '',              lat: 52.4862, lng: -1.8904 },

  // Job A: "Oakwood" — residential, close to home
  oakwood:   { text: 'Oakwood',       lat: 52.4900, lng: -1.8850 }, // ~500m from home
  oakwood2:  { text: 'Oakwood rear',  lat: 52.4905, lng: -1.8845 }, // ~50m from oakwood (GPS drift)

  // Job B: "Maple Drive" — nearby but distinct
  maple:     { text: 'Maple Drive',   lat: 52.4950, lng: -1.8700 }, // ~2km from home

  // Job C: "Elm Terrace" — further away
  elm:       { text: 'Elm Terrace',   lat: 52.4200, lng: -1.5500 }, // ~25km from home

  // Job D: "Birch Close" — close to Elm (false trap: same area, different job)
  birch:     { text: 'Birch Close',   lat: 52.4210, lng: -1.5510 }, // ~100m from Elm

  // Shared locations
  supplier:  { text: 'Supplier',      lat: 52.4734, lng: -1.9108 },
  merchant:  { text: 'Merchants',     lat: 52.4800, lng: -1.8800 },
} as const;

// ── Job IDs ────────────────────────────────────────────────────────

const JOBS = {
  oakwood: 'job-oakwood',
  maple:   'job-maple',
  elm:     'job-elm',
  birch:   'job-birch',
} as const;

// ── Helper ─────────────────────────────────────────────────────────

let _id = 0;

function task(
  text: string,
  created: string,
  completed: string,
  opts: {
    source?: 'planned' | 'came_up';
    estimate?: number;
    actual?: number;
    logged?: number;
    location?: { text: string; lat: number; lng: number };
    job?: string;
    info?: string;
    subtasks?: { count: number; done: number; mins: number };
  } = {}
): CompletedTaskFacts {
  _id++;
  return {
    text,
    status: 'done',
    source: opts.source ?? 'planned',
    estimate_mins: opts.estimate ?? 0,
    actual_mins: opts.actual ?? null,
    logged_mins: opts.logged ?? 0,
    created_at: created,
    completed_at: completed,
    started_at: null,
    surface_date: null,
    location_text: opts.location?.text ?? null,
    lat: opts.location?.lat ?? null,
    lng: opts.location?.lng ?? null,
    job_id: opts.job ?? null,
    info: opts.info ?? null,
    subtaskCount: opts.subtasks?.count ?? 0,
    subtaskDoneCount: opts.subtasks?.done ?? 0,
    subtaskTotalMins: opts.subtasks?.mins ?? 0,
  };
}

// ── Job A: Oakwood Reroof (8 tasks) ───────────────────────────────
// Site visits at oakwood + oakwood2 (GPS drift). Quotes at home.
// Tests: spatial grouping with GPS drift, place association

const oakwood: CompletedTaskFacts[] = [
  task('site visit Oakwood reroof',
    '2026-04-01T09:00:00Z', '2026-04-01T10:00:00Z',
    { estimate: 60, actual: 60, location: LOC.oakwood, job: JOBS.oakwood }),
  task('quote Oakwood reroof',
    '2026-04-02T14:00:00Z', '2026-04-02T16:00:00Z',
    { estimate: 120, actual: 110, location: LOC.home, job: JOBS.oakwood }),
  task('site visit Oakwood reroof day 1',
    '2026-04-08T08:00:00Z', '2026-04-08T16:00:00Z',
    { estimate: 480, actual: 480, location: LOC.oakwood2, job: JOBS.oakwood,
      subtasks: { count: 5, done: 5, mins: 470 } }),
  task('collect materials Oakwood',
    '2026-04-09T07:30:00Z', '2026-04-09T09:00:00Z',
    { estimate: 60, actual: 80, location: LOC.supplier, job: JOBS.oakwood }),
  task('site visit Oakwood reroof day 2',
    '2026-04-10T08:00:00Z', '2026-04-10T16:00:00Z',
    { estimate: 480, actual: 460, location: LOC.oakwood, job: JOBS.oakwood,
      subtasks: { count: 4, done: 4, mins: 440 } }),
  task('site visit Oakwood reroof day 3',
    '2026-04-15T08:00:00Z', '2026-04-15T15:00:00Z',
    { estimate: 420, actual: 420, location: LOC.oakwood2, job: JOBS.oakwood }),
  task('site visit Oakwood finish',
    '2026-04-17T08:00:00Z', '2026-04-17T12:00:00Z',
    { estimate: 240, actual: 230, location: LOC.oakwood, job: JOBS.oakwood }),
  task('invoice Oakwood reroof',
    '2026-04-18T10:00:00Z', '2026-04-18T10:30:00Z',
    { estimate: 15, actual: 15, location: LOC.home, job: JOBS.oakwood }),
];

// ── Job B: Maple Drive Extension (7 tasks) ────────────────────────
// Tests: temporal association (morning starts), job evidence with unlinked tasks

const maple: CompletedTaskFacts[] = [
  task('site visit Maple Drive extension',
    '2026-05-01T09:00:00Z', '2026-05-01T10:30:00Z',
    { estimate: 60, actual: 90, location: LOC.maple, job: JOBS.maple }),
  task('quote Maple Drive extension',
    '2026-05-02T14:00:00Z', '2026-05-03T11:00:00Z',
    { estimate: 180, actual: 240, location: LOC.home, job: JOBS.maple }),
  task('site visit Maple foundations',
    '2026-05-08T07:30:00Z', '2026-05-08T16:30:00Z',
    { estimate: 480, actual: 510, location: LOC.maple, job: JOBS.maple,
      subtasks: { count: 4, done: 4, mins: 490 } }),
  task('collect materials Maple',
    '2026-05-09T07:00:00Z', '2026-05-09T08:30:00Z',
    { estimate: 60, actual: 80, location: LOC.merchant, job: JOBS.maple }),
  task('site visit Maple blockwork',
    '2026-05-15T08:00:00Z', '2026-05-15T16:00:00Z',
    { estimate: 480, actual: 480, location: LOC.maple, job: JOBS.maple,
      subtasks: { count: 5, done: 5, mins: 470 } }),
  task('site visit Maple roof',
    '2026-05-22T08:00:00Z', '2026-05-22T16:00:00Z',
    { estimate: 480, actual: 480, location: LOC.maple, job: JOBS.maple }),
  task('invoice Maple Drive extension',
    '2026-05-23T10:00:00Z', '2026-05-23T10:45:00Z',
    { estimate: 30, actual: 30, location: LOC.home, job: JOBS.maple }),
];

// ── Job C: Elm Terrace Repair (6 tasks) ───────────────────────────
// Tests: job association with nearby false-positive (Birch Close)
// Elm and Birch are ~100m apart — different jobs, same area

const elm: CompletedTaskFacts[] = [
  task('site visit Elm Terrace repair',
    '2026-06-01T09:00:00Z', '2026-06-01T10:00:00Z',
    { estimate: 60, actual: 60, location: LOC.elm, job: JOBS.elm }),
  task('quote Elm Terrace repair',
    '2026-06-02T14:00:00Z', '2026-06-02T15:00:00Z',
    { estimate: 60, actual: 50, location: LOC.home, job: JOBS.elm }),
  task('site visit Elm repair day 1',
    '2026-06-08T08:00:00Z', '2026-06-08T16:00:00Z',
    { estimate: 480, actual: 480, location: LOC.elm, job: JOBS.elm,
      subtasks: { count: 3, done: 3, mins: 460 } }),
  task('collect materials Elm',
    '2026-06-09T07:30:00Z', '2026-06-09T08:30:00Z',
    { estimate: 30, actual: 40, location: LOC.merchant, job: JOBS.elm }),
  task('site visit Elm repair day 2',
    '2026-06-15T08:00:00Z', '2026-06-15T12:00:00Z',
    { estimate: 240, actual: 240, location: LOC.elm, job: JOBS.elm }),
  task('invoice Elm Terrace repair',
    '2026-06-16T10:00:00Z', '2026-06-16T10:20:00Z',
    { estimate: 15, actual: 15, location: LOC.home, job: JOBS.elm }),
];

// ── Job D: Birch Close guttering (5 tasks) ────────────────────────
// Tests: false-positive spatial trap — Birch is ~100m from Elm
// These should NOT be grouped with Elm in place analysis
// But unlinked tasks at Elm might show spatial evidence for Elm job

const birch: CompletedTaskFacts[] = [
  task('site visit Birch Close guttering',
    '2026-06-20T09:00:00Z', '2026-06-20T09:45:00Z',
    { estimate: 30, actual: 40, location: LOC.birch, job: JOBS.birch }),
  task('quote Birch Close guttering',
    '2026-06-21T14:00:00Z', '2026-06-21T14:45:00Z',
    { estimate: 30, actual: 35, location: LOC.home, job: JOBS.birch }),
  task('site visit Birch guttering',
    '2026-06-28T08:00:00Z', '2026-06-28T14:00:00Z',
    { estimate: 360, actual: 360, location: LOC.birch, job: JOBS.birch,
      subtasks: { count: 3, done: 3, mins: 340 } }),
  task('collect guttering materials',
    '2026-06-28T07:00:00Z', '2026-06-28T07:30:00Z',
    { estimate: 30, actual: 25, location: LOC.merchant, job: JOBS.birch }),
  task('invoice Birch Close guttering',
    '2026-06-30T10:00:00Z', '2026-06-30T10:15:00Z',
    { estimate: 15, actual: 10, location: LOC.home, job: JOBS.birch }),
];

// ── Recurring: Material runs (unlinked, various jobs) ─────────────
// Tests: unlinked tasks at supplier/merchant show up as spatial/temporal
// evidence for multiple jobs

const materialRuns: CompletedTaskFacts[] = [
  // Near Oakwood days — spatial evidence for Oakwood
  task('collect roof tiles',
    '2026-04-07T07:30:00Z', '2026-04-07T09:00:00Z',
    { source: 'came_up', actual: 80, location: LOC.supplier }),
  task('collect timber battens',
    '2026-04-14T07:00:00Z', '2026-04-14T08:30:00Z',
    { source: 'planned', estimate: 60, actual: 75, location: LOC.supplier }),

  // Near Maple days — temporal evidence for Maple
  task('collect concrete blocks',
    '2026-05-07T07:30:00Z', '2026-05-07T09:00:00Z',
    { source: 'planned', estimate: 60, actual: 80, location: LOC.merchant }),
  task('collect insulation boards',
    '2026-05-14T07:00:00Z', '2026-05-14T08:30:00Z',
    { source: 'planned', estimate: 60, actual: 70, location: LOC.supplier }),

  // Near Elm/Birch days — could be spatial evidence for either
  task('collect pointing mix',
    '2026-06-07T08:00:00Z', '2026-06-07T08:30:00Z',
    { source: 'came_up', actual: 25, location: LOC.merchant }),
  task('collect lead flashing',
    '2026-06-14T08:00:00Z', '2026-06-14T08:45:00Z',
    { source: 'planned', estimate: 30, actual: 35, location: LOC.supplier }),
];

// ── Recurring: Admin tasks (repeated sequences) ───────────────────
// Tests: repeated adjacency patterns, temporal association

const admin: CompletedTaskFacts[] = [
  // Weekly admin on Fridays — repeated sequence
  task('update accounts spreadsheet',
    '2026-04-03T16:00:00Z', '2026-04-03T17:00:00Z',
    { estimate: 60, actual: 55, location: LOC.home }),
  task('file receipts',
    '2026-04-03T17:00:00Z', '2026-04-03T17:30:00Z',
    { estimate: 30, actual: 25, location: LOC.home }),

  task('update accounts spreadsheet',
    '2026-04-10T16:00:00Z', '2026-04-10T17:00:00Z',
    { estimate: 60, actual: 60, location: LOC.home }),
  task('file receipts',
    '2026-04-10T17:00:00Z', '2026-04-10T17:30:00Z',
    { estimate: 30, actual: 30, location: LOC.home }),

  task('update accounts spreadsheet',
    '2026-04-17T16:00:00Z', '2026-04-17T17:00:00Z',
    { estimate: 60, actual: 55, location: LOC.home }),
  task('file receipts',
    '2026-04-17T17:00:00Z', '2026-04-17T17:30:00Z',
    { estimate: 30, actual: 25, location: LOC.home }),

  task('update accounts spreadsheet',
    '2026-05-01T16:00:00Z', '2026-05-01T17:30:00Z',
    { estimate: 60, actual: 80, location: LOC.home }),
  task('file receipts',
    '2026-05-01T17:30:00Z', '2026-05-01T18:00:00Z',
    { estimate: 30, actual: 25, location: LOC.home }),

  task('update accounts spreadsheet',
    '2026-05-08T16:00:00Z', '2026-05-08T17:00:00Z',
    { estimate: 60, actual: 60, location: LOC.home }),
  task('file receipts',
    '2026-05-08T17:00:00Z', '2026-05-08T17:30:00Z',
    { estimate: 30, actual: 30, location: LOC.home }),

  task('update accounts spreadsheet',
    '2026-05-15T16:00:00Z', '2026-05-15T17:00:00Z',
    { estimate: 60, actual: 55, location: LOC.home }),
  task('file receipts',
    '2026-05-15T17:00:00Z', '2026-05-15T17:30:00Z',
    { estimate: 30, actual: 25, location: LOC.home }),

  task('update accounts spreadsheet',
    '2026-05-22T16:00:00Z', '2026-05-22T17:00:00Z',
    { estimate: 60, actual: 60, location: LOC.home }),
  task('file receipts',
    '2026-05-22T17:00:00Z', '2026-05-22T17:30:00Z',
    { estimate: 30, actual: 30, location: LOC.home }),
];

// ── Personal: False-positive traps ─────────────────────────────────
// Tests: tasks at home that should NOT show job evidence

const personal: CompletedTaskFacts[] = [
  task('school run',
    '2026-04-01T08:00:00Z', '2026-04-01T08:30:00Z',
    { estimate: 30, actual: 25, location: LOC.homeArea }),
  task('school run',
    '2026-04-02T08:00:00Z', '2026-04-02T08:30:00Z',
    { estimate: 30, actual: 25, location: LOC.homeArea }),
  task('school run',
    '2026-04-03T08:00:00Z', '2026-04-03T08:30:00Z',
    { estimate: 30, actual: 25, location: LOC.homeArea }),
  task('school run',
    '2026-04-07T08:00:00Z', '2026-04-07T08:30:00Z',
    { estimate: 30, actual: 25, location: LOC.homeArea }),
  task('school run',
    '2026-04-08T08:00:00Z', '2026-04-08T08:30:00Z',
    { estimate: 30, actual: 25, location: LOC.homeArea }),
  task('school run',
    '2026-04-09T08:00:00Z', '2026-04-09T08:30:00Z',
    { estimate: 30, actual: 25, location: LOC.homeArea }),
  task('school run',
    '2026-04-10T08:00:00Z', '2026-04-10T08:30:00Z',
    { estimate: 30, actual: 25, location: LOC.homeArea }),
  task('school run',
    '2026-04-14T08:00:00Z', '2026-04-14T08:30:00Z',
    { estimate: 30, actual: 25, location: LOC.homeArea }),
  task('school run',
    '2026-04-15T08:00:00Z', '2026-04-15T08:30:00Z',
    { estimate: 30, actual: 25, location: LOC.homeArea }),
  task('school run',
    '2026-04-16T08:00:00Z', '2026-04-16T08:30:00Z',
    { estimate: 30, actual: 25, location: LOC.homeArea }),
  task('school run',
    '2026-05-01T08:00:00Z', '2026-05-01T08:30:00Z',
    { estimate: 30, actual: 25, location: LOC.homeArea }),
  task('school run',
    '2026-05-05T08:00:00Z', '2026-05-05T08:30:00Z',
    { estimate: 30, actual: 25, location: LOC.homeArea }),
  task('school run',
    '2026-05-06T08:00:00Z', '2026-05-06T08:30:00Z',
    { estimate: 30, actual: 25, location: LOC.homeArea }),
  task('school run',
    '2026-05-07T08:00:00Z', '2026-05-07T08:30:00Z',
    { estimate: 30, actual: 25, location: LOC.homeArea }),

  // Home tasks — false trap for job association
  task('garden mowing',
    '2026-04-05T10:00:00Z', '2026-04-05T11:00:00Z',
    { estimate: 60, actual: 55, location: LOC.home }),
  task('garden mowing',
    '2026-04-26T10:00:00Z', '2026-04-26T11:00:00Z',
    { estimate: 60, actual: 60, location: LOC.home }),
  task('garden mowing',
    '2026-05-10T10:00:00Z', '2026-05-10T11:00:00Z',
    { estimate: 60, actual: 55, location: LOC.home }),
  task('garden mowing',
    '2026-05-31T10:00:00Z', '2026-05-31T11:00:00Z',
    { estimate: 60, actual: 60, location: LOC.home }),
  task('garden mowing',
    '2026-06-14T10:00:00Z', '2026-06-14T11:00:00Z',
    { estimate: 60, actual: 55, location: LOC.home }),
];

// ── Client calls (unlinked, temporal evidence) ─────────────────────

const clientCalls: CompletedTaskFacts[] = [
  task('call Oakwood about progress',
    '2026-04-11T10:00:00Z', '2026-04-11T10:15:00Z',
    { source: 'came_up', actual: 12, location: LOC.homeArea, job: JOBS.oakwood }),
  task('call Maple about schedule',
    '2026-05-10T11:00:00Z', '2026-05-10T11:20:00Z',
    { source: 'came_up', actual: 15, location: LOC.homeArea, job: JOBS.maple }),
  task('call Elm about finish',
    '2026-06-10T10:00:00Z', '2026-06-10T10:10:00Z',
    { source: 'came_up', actual: 8, location: LOC.homeArea, job: JOBS.elm }),
  task('call Birch about guttering',
    '2026-06-25T10:00:00Z', '2026-06-25T10:12:00Z',
    { source: 'came_up', actual: 10, location: LOC.homeArea, job: JOBS.birch }),
];

// ── Combine all ───────────────────────────────────────────────────

const allTasks: CompletedTaskFacts[] = [
  ...oakwood,
  ...maple,
  ...elm,
  ...birch,
  ...materialRuns,
  ...admin,
  ...personal,
  ...clientCalls,
];

allTasks.sort((a, b) => a.created_at.localeCompare(b.created_at));

console.log(`Dense fixture: ${allTasks.length} tasks`);
console.log(`Date range: ${allTasks[0].created_at.slice(0, 10)} → ${allTasks[allTasks.length - 1].created_at.slice(0, 10)}`);

const outPath = join(__dirname, 'dense-fixture.json');
writeFileSync(outPath, JSON.stringify(allTasks, null, 2));
console.log(`Written to ${outPath}`);
