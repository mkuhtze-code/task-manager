// lib/thinking/__diagnostic__/generateFixture.ts
//
// Deterministic fixture generator for Scope 2.5 validation.
// Represents "Dan" — a 38-year-old roofer/general builder in the
// Midlands, UK, working solo with occasional apprentice (Jake).
//
// Run: npx tsx lib/thinking/__diagnostic__/generateFixture.ts

import { writeFileSync } from 'fs';
import { join } from 'path';
import type { CompletedTaskFacts } from '../types';

// ── Locations ──────────────────────────────────────────────────────

const LOC = {
  home:     { text: 'Home workshop',      lat: 52.4862, lng: -1.8904 },
  henderson:{ text: 'Henderson',          lat: 52.4521, lng: -1.7434 },
  smith:    { text: 'Smith',              lat: 52.4068, lng: -1.5556 },
  jones:    { text: 'Jones',              lat: 52.4270, lng: -1.5800 },
  patel:    { text: 'Patel office',       lat: 52.4814, lng: -1.8989 },
  williams: { text: 'Williams',           lat: 52.4643, lng: -1.7841 },
  brown:    { text: 'Brown',              lat: 52.4155, lng: -1.5132 },
  taylor:   { text: 'Taylor',             lat: 52.4478, lng: -1.8325 },
  supplier: { text: 'Roofing supplier',   lat: 52.4734, lng: -1.9108 },
  merchant: { text: 'Local merchants',     lat: 52.4800, lng: -1.8800 },
  homeArea: { text: '',                    lat: 52.4862, lng: -1.8904 },
} as const;

// ── Job IDs ────────────────────────────────────────────────────────

const JOBS = {
  henderson: 'job-henderson',
  smith:     'job-smith',
  jones:     'job-jones',
  patel:     'job-patel',
  williams:  'job-williams',
  brown:     'job-brown',
  taylor:    'job-taylor',
} as const;

// ── Helper ─────────────────────────────────────────────────────────

let _id = 0;
function tid(): string {
  return `task-${String(++_id).padStart(4, '0')}`;
}

function task(
  text: string,
  created: string,
  completed: string,
  opts: {
    source?: 'planned' | 'came_up';
    estimate?: number;
    actual?: number;
    logged?: number;
    surface?: string;
    location?: { text: string; lat: number; lng: number };
    job?: string;
    info?: string;
    subtasks?: { count: number; done: number; mins: number };
    started?: string;
  } = {}
): CompletedTaskFacts {
  return {
    text,
    status: 'done',
    source: opts.source ?? 'planned',
    estimate_mins: opts.estimate ?? 0,
    actual_mins: opts.actual ?? null,
    logged_mins: opts.logged ?? 0,
    created_at: created,
    completed_at: completed,
    started_at: opts.started ?? null,
    surface_date: opts.surface ?? null,
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

// ── Job 1: Henderson Reroof ───────────────────────────────────────
// Major job. Old clay tiles off, new flat roof section, re-bed ridge.
// User is experienced at this but the scaffolding delays caused carryover.

const henderson: CompletedTaskFacts[] = [
  task('site visit Henderson reroof assessment',
    '2026-01-08T09:00:00Z', '2026-01-08T10:30:00Z',
    { source: 'planned', estimate: 60, actual: 90, logged: 85,
      location: LOC.henderson, job: JOBS.henderson,
      info: 'Full strip needed. ridge pointing gone. flat roof section sagging' }),

  task('quote reroof Henderson',
    '2026-01-08T14:00:00Z', '2026-01-09T11:00:00Z',
    { source: 'planned', estimate: 120, actual: 180, logged: 170,
      location: LOC.home, job: JOBS.henderson,
      info: 'Materials list: marley tiles, breathable membrane, treated timber, lead flashings. Scaffolding extra.' }),

  task('send quote Henderson reroof',
    '2026-01-09T14:00:00Z', '2026-01-09T14:15:00Z',
    { source: 'planned', estimate: 15, actual: 10, logged: 10,
      location: LOC.home, job: JOBS.henderson }),

  task('order scaffolding Henderson',
    '2026-01-12T09:00:00Z', '2026-01-12T09:40:00Z',
    { source: 'planned', estimate: 30, actual: 35, logged: 30,
      location: LOC.home, job: JOBS.henderson }),

  task('site visit Henderson reroof start',
    '2026-01-15T08:00:00Z', '2026-01-15T16:30:00Z',
    { source: 'planned', estimate: 480, actual: 510, logged: 490,
      location: LOC.henderson, job: JOBS.henderson,
      info: 'Stripped rear section. found rotten rafters. will need new noggins.',
      subtasks: { count: 6, done: 6, mins: 480 } }),

  task('collect materials Henderson',
    '2026-01-16T07:30:00Z', '2026-01-16T09:00:00Z',
    { source: 'planned', estimate: 60, actual: 85, logged: 80,
      location: LOC.supplier, job: JOBS.henderson,
      info: 'Marley tiles x 200, membrane, timber. van full' }),

  task('site visit Henderson reroof day 2',
    '2026-01-19T08:00:00Z', '2026-01-19T16:00:00Z',
    { source: 'planned', estimate: 480, actual: 480, logged: 465,
      location: LOC.henderson, job: JOBS.henderson,
      subtasks: { count: 5, done: 5, mins: 470 } }),

  task('site visit Henderson reroof day 3',
    '2026-01-22T08:00:00Z', '2026-01-22T16:30:00Z',
    { source: 'planned', estimate: 480, actual: 510, logged: 500,
      location: LOC.henderson, job: JOBS.henderson,
      info: 'Flat roof section done. felt down. lead dressing tomorrow.' }),

  task('collect lead flashings Henderson',
    '2026-01-23T08:00:00Z', '2026-01-23T08:45:00Z',
    { source: 'came_up', estimate: 0, actual: 40, logged: 35,
      location: LOC.supplier, job: JOBS.henderson }),

  task('site visit Henderson reroof day 4',
    '2026-01-26T08:00:00Z', '2026-01-26T15:30:00Z',
    { source: 'planned', estimate: 480, actual: 450, logged: 440,
      location: LOC.henderson, job: JOBS.henderson,
      subtasks: { count: 4, done: 4, mins: 430 } }),

  task('call Henderson about ridge tiles',
    '2026-01-27T10:00:00Z', '2026-01-27T10:12:00Z',
    { source: 'came_up', estimate: 0, actual: 8, logged: 8,
      location: LOC.homeArea, job: JOBS.henderson }),

  task('site visit Henderson reroof day 5',
    '2026-01-29T08:00:00Z', '2026-01-29T16:00:00Z',
    { source: 'planned', estimate: 480, actual: 480, logged: 470,
      location: LOC.henderson, job: JOBS.henderson,
      info: 'Ridge tiles on. pointing done. need to clear up and scaffold down.' }),

  task('scaffold collection Henderson',
    '2026-02-02T09:00:00Z', '2026-02-02T10:00:00Z',
    { source: 'planned', estimate: 60, actual: 60, logged: 55,
      location: LOC.henderson, job: JOBS.henderson }),

  task('site visit Henderson final details',
    '2026-02-05T08:00:00Z', '2026-02-05T12:00:00Z',
    { source: 'planned', estimate: 240, actual: 240, logged: 230,
      location: LOC.henderson, job: JOBS.henderson,
      subtasks: { count: 3, done: 3, mins: 220 } }),

  task('invoice Henderson reroof',
    '2026-02-06T10:00:00Z', '2026-02-06T10:30:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 25,
      location: LOC.home, job: JOBS.henderson }),
];

// ── Job 2: Smith Extension ────────────────────────────────────────
// Medium job. Side extension for kitchen. Foundations, blockwork, roof.
// Slower pace — client away some weeks.

const smith: CompletedTaskFacts[] = [
  task('site visit Smith extension layout',
    '2026-02-03T09:00:00Z', '2026-02-03T11:00:00Z',
    { source: 'planned', estimate: 90, actual: 120, logged: 110,
      location: LOC.smith, job: JOBS.smith,
      info: 'Mark out foundation trenches. check levels.' }),

  task('quote extension Smith',
    '2026-02-04T14:00:00Z', '2026-02-05T10:00:00Z',
    { source: 'planned', estimate: 180, actual: 240, logged: 220,
      location: LOC.home, job: JOBS.smith }),

  task('site visit Smith foundations',
    '2026-02-10T08:00:00Z', '2026-02-10T16:00:00Z',
    { source: 'planned', estimate: 480, actual: 480, logged: 460,
      location: LOC.smith, job: JOBS.smith,
      subtasks: { count: 4, done: 4, mins: 450 } }),

  task('collect materials Smith',
    '2026-02-11T07:30:00Z', '2026-02-11T09:30:00Z',
    { source: 'planned', estimate: 90, actual: 110, logged: 100,
      location: LOC.merchant, job: JOBS.smith }),

  task('site visit Smith blockwork',
    '2026-02-17T08:00:00Z', '2026-02-17T16:30:00Z',
    { source: 'planned', estimate: 480, actual: 510, logged: 490,
      location: LOC.smith, job: JOBS.smith,
      subtasks: { count: 5, done: 5, mins: 480 } }),

  task('site visit Smith blockwork day 2',
    '2026-02-24T08:00:00Z', '2026-02-24T16:00:00Z',
    { source: 'planned', estimate: 480, actual: 480, logged: 470,
      location: LOC.smith, job: JOBS.smith }),

  task('call Smith about window sizes',
    '2026-02-25T11:00:00Z', '2026-02-25T11:20:00Z',
    { source: 'came_up', estimate: 0, actual: 15, logged: 15,
      location: LOC.homeArea, job: JOBS.smith }),

  task('site visit Smith lintels and roof',
    '2026-03-03T08:00:00Z', '2026-03-03T16:30:00Z',
    { source: 'planned', estimate: 480, actual: 510, logged: 495,
      location: LOC.smith, job: JOBS.smith,
      subtasks: { count: 6, done: 6, mins: 490 } }),

  task('collect materials Smith roof',
    '2026-03-04T08:00:00Z', '2026-03-04T09:30:00Z',
    { source: 'planned', estimate: 60, actual: 80, logged: 75,
      location: LOC.supplier, job: JOBS.smith }),

  task('site visit Smith roof structure',
    '2026-03-10T08:00:00Z', '2026-03-10T16:00:00Z',
    { source: 'planned', estimate: 480, actual: 480, logged: 465,
      location: LOC.smith, job: JOBS.smith }),

  task('site visit Smith roofing felt',
    '2026-03-17T08:00:00Z', '2026-03-17T15:00:00Z',
    { source: 'planned', estimate: 420, actual: 420, logged: 410,
      location: LOC.smith, job: JOBS.smith }),

  task('site visit Smith guttering and finish',
    '2026-03-24T08:00:00Z', '2026-03-24T14:00:00Z',
    { source: 'planned', estimate: 360, actual: 360, logged: 345,
      location: LOC.smith, job: JOBS.smith,
      subtasks: { count: 3, done: 3, mins: 340 } }),

  task('invoice Smith extension',
    '2026-04-01T10:00:00Z', '2026-04-01T10:45:00Z',
    { source: 'planned', estimate: 30, actual: 40, logged: 35,
      location: LOC.home, job: JOBS.smith }),
];

// ── Job 3: Jones Flat Roof ────────────────────────────────────────
// Small quick job. Garage flat roof repair. Straightforward.

const jones: CompletedTaskFacts[] = [
  task('site visit Jones flat roof',
    '2026-03-16T09:00:00Z', '2026-03-16T10:00:00Z',
    { source: 'planned', estimate: 60, actual: 60, logged: 55,
      location: LOC.jones, job: JOBS.jones,
      info: 'Blisters in felt. small area maybe 3m x 2m' }),

  task('quote flat roof Jones',
    '2026-03-16T14:00:00Z', '2026-03-16T15:00:00Z',
    { source: 'planned', estimate: 60, actual: 50, logged: 45,
      location: LOC.home, job: JOBS.jones }),

  task('site visit Jones flat roof repair',
    '2026-03-23T08:00:00Z', '2026-03-23T12:30:00Z',
    { source: 'planned', estimate: 240, actual: 270, logged: 260,
      location: LOC.jones, job: JOBS.jones,
      subtasks: { count: 3, done: 3, mins: 250 } }),

  task('collect materials Jones',
    '2026-03-23T07:00:00Z', '2026-03-23T07:45:00Z',
    { source: 'planned', estimate: 30, actual: 40, logged: 35,
      location: LOC.merchant, job: JOBS.jones }),

  task('site visit Jones flat roof finish',
    '2026-03-30T08:00:00Z', '2026-03-30T11:00:00Z',
    { source: 'planned', estimate: 180, actual: 180, logged: 170,
      location: LOC.jones, job: JOBS.jones }),

  task('invoice Jones flat roof',
    '2026-04-02T10:00:00Z', '2026-04-02T10:20:00Z',
    { source: 'planned', estimate: 15, actual: 15, logged: 15,
      location: LOC.home, job: JOBS.jones }),
];

// ── Job 4: Patel Office Refurb ────────────────────────────────────
// Larger commercial job. Office roof refurb, new drainage, safe access.
// The biggest job in the period.

const patel: CompletedTaskFacts[] = [
  task('site visit Patel office roof survey',
    '2026-04-14T09:00:00Z', '2026-04-14T12:00:00Z',
    { source: 'planned', estimate: 120, actual: 180, logged: 170,
      location: LOC.patel, job: JOBS.patel,
      info: 'Full survey. multiple leak points. drainage blocked. safe access needed for maintenance.' }),

  task('quote Patel office refurb',
    '2026-04-15T09:00:00Z', '2026-04-16T16:00:00Z',
    { source: 'planned', estimate: 480, actual: 600, logged: 580,
      location: LOC.home, job: JOBS.patel,
      info: 'Detailed quote. 3 pages. broke into phases.' }),

  task('order scaffolding Patel',
    '2026-04-20T09:00:00Z', '2026-04-20T09:30:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 25,
      location: LOC.home, job: JOBS.patel }),

  task('site visit Patel office day 1',
    '2026-04-27T07:30:00Z', '2026-04-27T17:00:00Z',
    { source: 'planned', estimate: 540, actual: 570, logged: 555,
      location: LOC.patel, job: JOBS.patel,
      info: 'Scaffold up. started stripping old felt.',
      subtasks: { count: 5, done: 5, mins: 540 } }),

  task('collect materials Patel',
    '2026-04-28T07:00:00Z', '2026-04-28T09:00:00Z',
    { source: 'planned', estimate: 90, actual: 120, logged: 110,
      location: LOC.supplier, job: JOBS.patel }),

  task('site visit Patel office day 2',
    '2026-05-04T07:30:00Z', '2026-05-04T17:00:00Z',
    { source: 'planned', estimate: 540, actual: 570, logged: 555,
      location: LOC.patel, job: JOBS.patel,
      subtasks: { count: 6, done: 6, mins: 550 } }),

  task('call Patel about drainage',
    '2026-05-05T10:00:00Z', '2026-05-05T10:25:00Z',
    { source: 'came_up', estimate: 0, actual: 20, logged: 18,
      location: LOC.homeArea, job: JOBS.patel,
      info: 'Drainage options discussed. he wants black plastic not cast iron.' }),

  task('site visit Patel office day 3',
    '2026-05-11T07:30:00Z', '2026-05-11T17:00:00Z',
    { source: 'planned', estimate: 540, actual: 570, logged: 560,
      location: LOC.patel, job: JOBS.patel,
      subtasks: { count: 5, done: 5, mins: 540 } }),

  task('site visit Patel office day 4',
    '2026-05-18T07:30:00Z', '2026-05-18T17:00:00Z',
    { source: 'planned', estimate: 540, actual: 540, logged: 530,
      location: LOC.patel, job: JOBS.patel }),

  task('site visit Patel office day 5',
    '2026-05-21T07:30:00Z', '2026-05-21T17:00:00Z',
    { source: 'planned', estimate: 540, actual: 570, logged: 555,
      location: LOC.patel, job: JOBS.patel,
      subtasks: { count: 4, done: 4, mins: 530 } }),

  task('collect drainage materials Patel',
    '2026-05-22T08:00:00Z', '2026-05-22T09:30:00Z',
    { source: 'planned', estimate: 60, actual: 80, logged: 75,
      location: LOC.supplier, job: JOBS.patel }),

  task('site visit Patel drainage install',
    '2026-06-01T07:30:00Z', '2026-06-01T17:00:00Z',
    { source: 'planned', estimate: 540, actual: 570, logged: 560,
      location: LOC.patel, job: JOBS.patel,
      subtasks: { count: 5, done: 5, mins: 540 } }),

  task('site visit Patel safe access',
    '2026-06-08T07:30:00Z', '2026-06-08T17:00:00Z',
    { source: 'planned', estimate: 540, actual: 540, logged: 530,
      location: LOC.patel, job: JOBS.patel }),

  task('site visit Patel felt finish',
    '2026-06-15T07:30:00Z', '2026-06-15T17:00:00Z',
    { source: 'planned', estimate: 540, actual: 570, logged: 555,
      location: LOC.patel, job: JOBS.patel,
      subtasks: { count: 4, done: 4, mins: 520 } }),

  task('site visit Patel detail work',
    '2026-06-22T08:00:00Z', '2026-06-22T16:00:00Z',
    { source: 'planned', estimate: 480, actual: 480, logged: 470,
      location: LOC.patel, job: JOBS.patel }),

  task('site visit Patel final inspection',
    '2026-07-01T09:00:00Z', '2026-07-01T12:00:00Z',
    { source: 'planned', estimate: 180, actual: 180, logged: 170,
      location: LOC.patel, job: JOBS.patel }),

  task('scaffold collection Patel',
    '2026-07-02T09:00:00Z', '2026-07-02T10:30:00Z',
    { source: 'planned', estimate: 60, actual: 90, logged: 85,
      location: LOC.patel, job: JOBS.patel }),

  task('invoice Patel office refurb',
    '2026-07-04T10:00:00Z', '2026-07-04T11:30:00Z',
    { source: 'planned', estimate: 60, actual: 90, logged: 85,
      location: LOC.home, job: JOBS.patel,
      info: 'Final invoice. sent by email and post.' }),
];

// ── Job 5: Williams Garden Room ───────────────────────────────────
// Small-medium job. Timber frame garden room with flat roof.

const williams: CompletedTaskFacts[] = [
  task('site visit Williams garden room',
    '2026-05-06T09:00:00Z', '2026-05-06T10:30:00Z',
    { source: 'planned', estimate: 60, actual: 90, logged: 85,
      location: LOC.williams, job: JOBS.williams,
      info: 'Measure up. want 4m x 3m. power and light needed.' }),

  task('quote garden room Williams',
    '2026-05-07T14:00:00Z', '2026-05-08T11:00:00Z',
    { source: 'planned', estimate: 180, actual: 240, logged: 230,
      location: LOC.home, job: JOBS.williams }),

  task('site visit Williams base',
    '2026-05-19T08:00:00Z', '2026-05-19T16:00:00Z',
    { source: 'planned', estimate: 480, actual: 480, logged: 465,
      location: LOC.williams, job: JOBS.williams,
      subtasks: { count: 4, done: 4, mins: 450 } }),

  task('collect materials Williams',
    '2026-05-20T07:30:00Z', '2026-05-20T09:00:00Z',
    { source: 'planned', estimate: 60, actual: 80, logged: 75,
      location: LOC.merchant, job: JOBS.williams }),

  task('site visit Williams frame',
    '2026-05-26T08:00:00Z', '2026-05-26T16:30:00Z',
    { source: 'planned', estimate: 480, actual: 510, logged: 495,
      location: LOC.williams, job: JOBS.williams,
      subtasks: { count: 5, done: 5, mins: 480 } }),

  task('site visit Williams roof',
    '2026-06-02T08:00:00Z', '2026-06-02T16:00:00Z',
    { source: 'planned', estimate: 480, actual: 480, logged: 470,
      location: LOC.williams, job: JOBS.williams }),

  task('site visit Williams cladding',
    '2026-06-09T08:00:00Z', '2026-06-09T15:00:00Z',
    { source: 'planned', estimate: 420, actual: 420, logged: 410,
      location: LOC.williams, job: JOBS.williams,
      subtasks: { count: 3, done: 3, mins: 400 } }),

  task('site visit Williams finish',
    '2026-06-12T08:00:00Z', '2026-06-12T14:00:00Z',
    { source: 'planned', estimate: 360, actual: 360, logged: 345,
      location: LOC.williams, job: JOBS.williams }),

  task('invoice Williams garden room',
    '2026-06-13T10:00:00Z', '2026-06-13T10:30:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 25,
      location: LOC.home, job: JOBS.williams }),
];

// ── Job 6: Brown Chimney Repair ───────────────────────────────────
// Small job. Repoint chimney stack, new pots.

const brown: CompletedTaskFacts[] = [
  task('site visit Brown chimney',
    '2026-06-16T09:00:00Z', '2026-06-16T09:45:00Z',
    { source: 'planned', estimate: 30, actual: 40, logged: 35,
      location: LOC.brown, job: JOBS.brown,
      info: 'Repoint stack. two pots cracked.' }),

  task('quote chimney Brown',
    '2026-06-16T14:00:00Z', '2026-06-16T14:45:00Z',
    { source: 'planned', estimate: 30, actual: 35, logged: 30,
      location: LOC.home, job: JOBS.brown }),

  task('site visit Brown chimney repoint',
    '2026-06-23T08:00:00Z', '2026-06-23T14:00:00Z',
    { source: 'planned', estimate: 360, actual: 360, logged: 350,
      location: LOC.brown, job: JOBS.brown,
      subtasks: { count: 3, done: 3, mins: 340 } }),

  task('collect chimney pots Brown',
    '2026-06-23T07:00:00Z', '2026-06-23T07:30:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 20,
      location: LOC.merchant, job: JOBS.brown }),

  task('site visit Brown chimney finish',
    '2026-06-30T08:00:00Z', '2026-06-30T11:00:00Z',
    { source: 'planned', estimate: 180, actual: 180, logged: 170,
      location: LOC.brown, job: JOBS.brown }),

  task('invoice Brown chimney',
    '2026-07-01T10:00:00Z', '2026-07-01T10:15:00Z',
    { source: 'planned', estimate: 15, actual: 10, logged: 10,
      location: LOC.home, job: JOBS.brown }),
];

// ── Job 7: Taylor Garage ──────────────────────────────────────────
// Small-medium job. Garage rebuild after vehicle damage.

const taylor: CompletedTaskFacts[] = [
  task('site visit Taylor garage',
    '2026-07-08T09:00:00Z', '2026-07-08T10:30:00Z',
    { source: 'planned', estimate: 60, actual: 90, logged: 85,
      location: LOC.taylor, job: JOBS.taylor,
      info: 'Wall collapsed. needs full rebuild on one side. roof trusses OK.' }),

  task('quote garage rebuild Taylor',
    '2026-07-09T14:00:00Z', '2026-07-10T11:00:00Z',
    { source: 'planned', estimate: 180, actual: 240, logged: 220,
      location: LOC.home, job: JOBS.taylor }),

  task('site visit Taylor garage day 1',
    '2026-07-14T08:00:00Z', '2026-07-14T16:30:00Z',
    { source: 'planned', estimate: 480, actual: 510, logged: 495,
      location: LOC.taylor, job: JOBS.taylor,
      subtasks: { count: 4, done: 4, mins: 480 } }),

  task('collect materials Taylor',
    '2026-07-15T07:30:00Z', '2026-07-15T09:00:00Z',
    { source: 'planned', estimate: 60, actual: 80, logged: 75,
      location: LOC.merchant, job: JOBS.taylor }),

  task('site visit Taylor garage day 2',
    '2026-07-21T08:00:00Z', '2026-07-21T16:00:00Z',
    { source: 'planned', estimate: 480, actual: 480, logged: 470,
      location: LOC.taylor, job: JOBS.taylor,
      subtasks: { count: 5, done: 5, mins: 460 } }),

  task('site visit Taylor garage day 3',
    '2026-07-28T08:00:00Z', '2026-07-28T16:00:00Z',
    { source: 'planned', estimate: 480, actual: 480, logged: 465,
      location: LOC.taylor, job: JOBS.taylor }),

  task('site visit Taylor garage finish',
    '2026-08-04T08:00:00Z', '2026-08-04T14:00:00Z',
    { source: 'planned', estimate: 360, actual: 360, logged: 345,
      location: LOC.taylor, job: JOBS.taylor,
      subtasks: { count: 3, done: 3, mins: 330 } }),

  task('scaffold collection Taylor',
    '2026-08-05T09:00:00Z', '2026-08-05T10:00:00Z',
    { source: 'planned', estimate: 60, actual: 60, logged: 55,
      location: LOC.taylor, job: JOBS.taylor }),

  task('invoice Taylor garage',
    '2026-08-06T10:00:00Z', '2026-08-06T10:30:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 25,
      location: LOC.home, job: JOBS.taylor }),
];

// ── Recurring: Material Runs ──────────────────────────────────────
// Quick runs to merchants or supplier. Various jobs.

const materialRuns: CompletedTaskFacts[] = [
  // January
  task('collect materials roof nails and screws',
    '2026-01-13T08:00:00Z', '2026-01-13T08:40:00Z',
    { source: 'came_up', estimate: 0, actual: 35, logged: 30,
      location: LOC.merchant }),
  task('collect membrane and timber',
    '2026-01-20T07:30:00Z', '2026-01-20T09:00:00Z',
    { source: 'planned', estimate: 60, actual: 70, logged: 65,
      location: LOC.supplier, job: JOBS.henderson }),

  // February
  task('collect mortar sand and cement',
    '2026-02-10T07:00:00Z', '2026-02-10T07:30:00Z',
    { source: 'came_up', estimate: 0, actual: 25, logged: 20,
      location: LOC.merchant }),
  task('collect blocks and insulation',
    '2026-02-17T07:00:00Z', '2026-02-17T08:30:00Z',
    { source: 'planned', estimate: 60, actual: 80, logged: 75,
      location: LOC.merchant, job: JOBS.smith }),

  // March
  task('collect felt and batten',
    '2026-03-23T07:00:00Z', '2026-03-23T08:00:00Z',
    { source: 'planned', estimate: 45, actual: 50, logged: 45,
      location: LOC.supplier }),
  task('collect ridge tiles',
    '2026-03-25T08:00:00Z', '2026-03-25T08:30:00Z',
    { source: 'came_up', estimate: 0, actual: 25, logged: 20,
      location: LOC.merchant }),

  // April
  task('collect safety gear',
    '2026-04-25T08:00:00Z', '2026-04-25T08:45:00Z',
    { source: 'planned', estimate: 30, actual: 40, logged: 35,
      location: LOC.merchant, job: JOBS.patel }),

  // May
  task('collect timber framing',
    '2026-05-19T07:00:00Z', '2026-05-19T08:30:00Z',
    { source: 'planned', estimate: 60, actual: 80, logged: 75,
      location: LOC.supplier, job: JOBS.williams }),

  // June
  task('collect pointing tools and mix',
    '2026-06-22T08:00:00Z', '2026-06-22T08:30:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 20,
      location: LOC.merchant, job: JOBS.brown }),
];

// ── Recurring: Client Calls ───────────────────────────────────────

const clientCalls: CompletedTaskFacts[] = [
  task('call Henderson progress update',
    '2026-01-30T10:00:00Z', '2026-01-30T10:15:00Z',
    { source: 'came_up', estimate: 0, actual: 12, logged: 10,
      location: LOC.homeArea, job: JOBS.henderson }),
  task('call Henderson about snag list',
    '2026-02-10T14:00:00Z', '2026-02-10T14:10:00Z',
    { source: 'came_up', estimate: 0, actual: 8, logged: 8,
      location: LOC.homeArea, job: JOBS.henderson }),
  task('call Smith about progress',
    '2026-02-20T11:00:00Z', '2026-02-20T11:20:00Z',
    { source: 'came_up', estimate: 0, actual: 15, logged: 15,
      location: LOC.homeArea, job: JOBS.smith }),
  task('call Smith week off',
    '2026-03-07T10:00:00Z', '2026-03-07T10:08:00Z',
    { source: 'came_up', estimate: 0, actual: 5, logged: 5,
      location: LOC.homeArea, job: JOBS.smith }),
  task('call Patel about drainage',
    '2026-05-14T10:00:00Z', '2026-05-14T10:20:00Z',
    { source: 'came_up', estimate: 0, actual: 15, logged: 12,
      location: LOC.homeArea, job: JOBS.patel }),
  task('call Patel inspection date',
    '2026-06-28T14:00:00Z', '2026-06-28T14:15:00Z',
    { source: 'came_up', estimate: 0, actual: 10, logged: 10,
      location: LOC.homeArea, job: JOBS.patel }),
  task('call Williams about finish date',
    '2026-06-08T11:00:00Z', '2026-06-08T11:12:00Z',
    { source: 'came_up', estimate: 0, actual: 8, logged: 8,
      location: LOC.homeArea, job: JOBS.williams }),
  task('call Brown schedule',
    '2026-06-20T10:00:00Z', '2026-06-20T10:10:00Z',
    { source: 'came_up', estimate: 0, actual: 8, logged: 8,
      location: LOC.homeArea, job: JOBS.brown }),
  task('call Taylor garage',
    '2026-07-11T10:00:00Z', '2026-07-11T10:18:00Z',
    { source: 'came_up', estimate: 0, actual: 12, logged: 12,
      location: LOC.homeArea, job: JOBS.taylor }),
];

// ── Recurring: Admin ──────────────────────────────────────────────

const admin: CompletedTaskFacts[] = [
  task('update accounts spreadsheet',
    '2026-01-10T16:00:00Z', '2026-01-10T17:00:00Z',
    { source: 'planned', estimate: 60, actual: 55, logged: 50,
      location: LOC.home,
      info: 'January invoices and receipts. sorted by job.' }),
  task('update accounts spreadsheet',
    '2026-02-07T16:00:00Z', '2026-02-07T17:30:00Z',
    { source: 'planned', estimate: 60, actual: 80, logged: 75,
      location: LOC.home,
      info: 'February. Henderson and Smith invoices.' }),
  task('update accounts spreadsheet',
    '2026-03-06T16:00:00Z', '2026-03-06T17:00:00Z',
    { source: 'planned', estimate: 60, actual: 60, logged: 55,
      location: LOC.home }),
  task('update accounts spreadsheet',
    '2026-04-10T16:00:00Z', '2026-04-10T17:00:00Z',
    { source: 'planned', estimate: 60, actual: 55, logged: 50,
      location: LOC.home }),
  task('update accounts spreadsheet',
    '2026-05-09T16:00:00Z', '2026-05-09T17:30:00Z',
    { source: 'planned', estimate: 60, actual: 90, logged: 80,
      location: LOC.home,
      info: 'May. Patel deposit and Williams invoice.' }),
  task('update accounts spreadsheet',
    '2026-06-06T16:00:00Z', '2026-06-06T17:00:00Z',
    { source: 'planned', estimate: 60, actual: 60, logged: 55,
      location: LOC.home }),
  task('update accounts spreadsheet',
    '2026-07-10T16:00:00Z', '2026-07-10T17:30:00Z',
    { source: 'planned', estimate: 60, actual: 85, logged: 80,
      location: LOC.home,
      info: 'End of quarter. VAT return prep.' }),

  task('file receipts',
    '2026-01-17T16:30:00Z', '2026-01-17T17:00:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 20,
      location: LOC.home }),
  task('file receipts',
    '2026-02-14T16:30:00Z', '2026-02-14T17:00:00Z',
    { source: 'planned', estimate: 30, actual: 30, logged: 25,
      location: LOC.home }),
  task('file receipts',
    '2026-03-14T16:30:00Z', '2026-03-14T17:00:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 20,
      location: LOC.home }),
  task('file receipts',
    '2026-04-11T16:30:00Z', '2026-04-11T17:00:00Z',
    { source: 'planned', estimate: 30, actual: 30, logged: 25,
      location: LOC.home }),
  task('file receipts',
    '2026-05-16T16:30:00Z', '2026-05-16T17:00:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 20,
      location: LOC.home }),
  task('file receipts',
    '2026-06-13T16:30:00Z', '2026-06-13T17:00:00Z',
    { source: 'planned', estimate: 30, actual: 30, logged: 25,
      location: LOC.home }),
  task('file receipts',
    '2026-07-18T16:30:00Z', '2026-07-18T17:00:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 20,
      location: LOC.home }),

  task('insurance renewal research',
    '2026-03-20T14:00:00Z', '2026-03-20T15:30:00Z',
    { source: 'planned', estimate: 90, actual: 90, logged: 85,
      location: LOC.home,
      info: 'Van insurance due next month. get 3 quotes.' }),

  task('tax return preparation',
    '2026-07-20T14:00:00Z', '2026-07-20T17:00:00Z',
    { source: 'planned', estimate: 180, actual: 180, logged: 170,
      location: LOC.home,
      info: 'Self assessment. gather all receipts and invoices.' }),

  task('book scaffolding for upcoming jobs',
    '2026-03-02T09:00:00Z', '2026-03-02T09:20:00Z',
    { source: 'planned', estimate: 15, actual: 15, logged: 15,
      location: LOC.home }),

  task('organise van service',
    '2026-04-22T09:00:00Z', '2026-04-22T14:00:00Z',
    { source: 'planned', estimate: 240, actual: 240, logged: 230,
      location: LOC.home,
      info: 'Full service plus new brakes. booked for Thursday.' }),

  task('order new tools',
    '2026-05-12T20:00:00Z', '2026-05-12T20:30:00Z',
    { source: 'came_up', estimate: 0, actual: 25, logged: 20,
      location: LOC.home,
      info: 'New SDS drill. old one packed in. ordered online.' }),
];

// ── Recurring: Personal Tasks ─────────────────────────────────────

const personal: CompletedTaskFacts[] = [
  task('school run',
    '2026-01-06T08:00:00Z', '2026-01-06T08:30:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 0,
      location: LOC.homeArea }),
  task('school run',
    '2026-01-07T08:00:00Z', '2026-01-07T08:30:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 0,
      location: LOC.homeArea }),
  task('school run',
    '2026-01-08T08:00:00Z', '2026-01-08T08:30:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 0,
      location: LOC.homeArea }),
  task('school run',
    '2026-01-09T08:00:00Z', '2026-01-09T08:30:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 0,
      location: LOC.homeArea }),
  task('school run',
    '2026-01-12T08:00:00Z', '2026-01-12T08:30:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 0,
      location: LOC.homeArea }),
  task('school run',
    '2026-01-13T08:00:00Z', '2026-01-13T08:30:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 0,
      location: LOC.homeArea }),
  task('school run',
    '2026-01-14T08:00:00Z', '2026-01-14T08:30:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 0,
      location: LOC.homeArea }),
  task('school run',
    '2026-01-15T08:00:00Z', '2026-01-15T08:30:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 0,
      location: LOC.homeArea }),
  task('school run',
    '2026-01-16T08:00:00Z', '2026-01-16T08:30:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 0,
      location: LOC.homeArea }),
  task('school run',
    '2026-01-19T08:00:00Z', '2026-01-19T08:30:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 0,
      location: LOC.homeArea }),
  task('school run',
    '2026-01-20T08:00:00Z', '2026-01-20T08:30:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 0,
      location: LOC.homeArea }),
  task('school run',
    '2026-01-21T08:00:00Z', '2026-01-21T08:30:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 0,
      location: LOC.homeArea }),
  task('school run',
    '2026-01-22T08:00:00Z', '2026-01-22T08:30:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 0,
      location: LOC.homeArea }),
  task('school run',
    '2026-01-23T08:00:00Z', '2026-01-23T08:30:00Z',
    { source: 'planned', estimate: 30, actual: 25, logged: 0,
      location: LOC.homeArea }),

  task('collect kids football',
    '2026-01-10T15:30:00Z', '2026-01-10T16:30:00Z',
    { source: 'planned', estimate: 60, actual: 60, logged: 0,
      location: LOC.homeArea }),
  task('collect kids football',
    '2026-01-17T15:30:00Z', '2026-01-17T16:30:00Z',
    { source: 'planned', estimate: 60, actual: 55, logged: 0,
      location: LOC.homeArea }),
  task('collect kids football',
    '2026-01-24T15:30:00Z', '2026-01-24T16:30:00Z',
    { source: 'planned', estimate: 60, actual: 60, logged: 0,
      location: LOC.homeArea }),
  task('collect kids football',
    '2026-01-31T15:30:00Z', '2026-01-31T16:30:00Z',
    { source: 'planned', estimate: 60, actual: 55, logged: 0,
      location: LOC.homeArea }),

  task('vet appointment dog',
    '2026-02-12T09:00:00Z', '2026-02-12T10:00:00Z',
    { source: 'planned', estimate: 60, actual: 60, logged: 0,
      location: LOC.homeArea,
      info: 'Annual booster. take records.' }),

  task('fix leaking tap',
    '2026-02-21T19:00:00Z', '2026-02-21T19:45:00Z',
    { source: 'came_up', estimate: 0, actual: 40, logged: 0,
      location: LOC.home }),

  task('garden mowing',
    '2026-03-28T10:00:00Z', '2026-03-28T11:00:00Z',
    { source: 'planned', estimate: 60, actual: 55, logged: 0,
      location: LOC.home }),

  task('garden mowing',
    '2026-04-25T10:00:00Z', '2026-04-25T11:00:00Z',
    { source: 'planned', estimate: 60, actual: 60, logged: 0,
      location: LOC.home }),

  task('garden mowing',
    '2026-05-30T10:00:00Z', '2026-05-30T11:00:00Z',
    { source: 'planned', estimate: 60, actual: 55, logged: 0,
      location: LOC.home }),

  task('garden mowing',
    '2026-06-27T10:00:00Z', '2026-06-27T11:00:00Z',
    { source: 'planned', estimate: 60, actual: 60, logged: 0,
      location: LOC.home }),

  task('garden mowing',
    '2026-07-25T10:00:00Z', '2026-07-25T11:00:00Z',
    { source: 'planned', estimate: 60, actual: 55, logged: 0,
      location: LOC.home }),

  task('fix fence panel',
    '2026-04-18T14:00:00Z', '2026-04-18T16:00:00Z',
    { source: 'came_up', estimate: 0, actual: 120, logged: 0,
      location: LOC.home,
      info: 'Wind blew panel off. had spare timber.' }),

  task('paint hallway',
    '2026-05-02T09:00:00Z', '2026-05-02T17:00:00Z',
    { source: 'planned', estimate: 480, actual: 480, logged: 0,
      location: LOC.home,
      info: 'First coat and second coat. wife chose colour.' }),

  task('paint hallway',
    '2026-05-03T09:00:00Z', '2026-05-03T13:00:00Z',
    { source: 'planned', estimate: 240, actual: 240, logged: 0,
      location: LOC.home,
      info: 'Touch up and second coat in hallway.' }),

  task('replace kitchen tap',
    '2026-06-20T19:00:00Z', '2026-06-20T20:30:00Z',
    { source: 'came_up', estimate: 0, actual: 90, logged: 0,
      location: LOC.home }),

  task('fix garden gate',
    '2026-07-18T14:00:00Z', '2026-07-18T15:30:00Z',
    { source: 'came_up', estimate: 0, actual: 80, logged: 0,
      location: LOC.home }),

  task('service lawnmower',
    '2026-03-15T10:00:00Z', '2026-03-15T11:30:00Z',
    { source: 'planned', estimate: 90, actual: 80, logged: 0,
      location: LOC.home }),

  task('put up shelves',
    '2026-06-14T10:00:00Z', '2026-06-14T12:00:00Z',
    { source: 'came_up', estimate: 0, actual: 120, logged: 0,
      location: LOC.home,
      info: 'Garage shelves. wife been asking for weeks.' }),
];

// ── Recurring: Quick Errands (came_up, no estimate) ──────────────

const errands: CompletedTaskFacts[] = [
  task('pick up screws from B&Q',
    '2026-01-14T17:00:00Z', '2026-01-14T17:40:00Z',
    { source: 'came_up', estimate: 0, actual: 35, logged: 30,
      location: LOC.merchant }),
  task('return unused tiles',
    '2026-02-09T10:00:00Z', '2026-02-09T10:45:00Z',
    { source: 'came_up', estimate: 0, actual: 40, logged: 35,
      location: LOC.supplier }),
  task('collect special order lead',
    '2026-03-05T08:00:00Z', '2026-03-05T08:30:00Z',
    { source: 'came_up', estimate: 0, actual: 25, logged: 20,
      location: LOC.supplier }),
  task('buy paint for hallway',
    '2026-05-01T17:00:00Z', '2026-05-01T17:45:00Z',
    { source: 'came_up', estimate: 0, actual: 40, logged: 0,
      location: LOC.merchant }),
  task('pick up new tap washer',
    '2026-06-19T17:00:00Z', '2026-06-19T17:20:00Z',
    { source: 'came_up', estimate: 0, actual: 15, logged: 10,
      location: LOC.merchant }),
];

// ── Combine all ───────────────────────────────────────────────────

const allTasks: CompletedTaskFacts[] = [
  ...henderson,
  ...smith,
  ...jones,
  ...patel,
  ...williams,
  ...brown,
  ...taylor,
  ...materialRuns,
  ...clientCalls,
  ...admin,
  ...personal,
  ...errands,
];

// Sort by created_at
allTasks.sort((a, b) => a.created_at.localeCompare(b.created_at));

console.log(`Fixture: ${allTasks.length} tasks`);
console.log(`Date range: ${allTasks[0].created_at.slice(0,10)} → ${allTasks[allTasks.length-1].created_at.slice(0,10)}`);

// Write fixture
const outPath = join(__dirname, 'fixture.json');
writeFileSync(outPath, JSON.stringify(allTasks, null, 2));
console.log(`Written to ${outPath}`);
