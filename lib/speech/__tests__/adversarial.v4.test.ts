/**
 * Speech Engine V4 — adversarial torture test.
 * Primary score: action outcome via processCaptureSpeech.
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { evaluateCase, type AdversarialCase } from '../adversarial/runner';

function loadCorpus(): AdversarialCase[] {
  const dir = join(process.cwd(), 'lib/speech/adversarial');
  const full = join(dir, 'corpus.json');
  if (existsSync(full)) {
    return JSON.parse(readFileSync(full, 'utf8')) as AdversarialCase[];
  }
  const p1 = join(dir, 'corpus.part1.json');
  const p2 = join(dir, 'corpus.part2.json');
  const a = JSON.parse(readFileSync(p1, 'utf8')) as AdversarialCase[];
  const b = JSON.parse(readFileSync(p2, 'utf8')) as AdversarialCase[];
  return [...a, ...b];
}

const corpus = loadCorpus();

describe('Speech V4 adversarial corpus', () => {
  it('has at least 500 cases', () => {
    expect(corpus.length).toBeGreaterThanOrEqual(500);
  });

  it('includes named TIM_INSPECTION gate case', () => {
    const hit = corpus.find(
      (c) =>
        /call Tim about the details/i.test(c.input) &&
        /inspection/i.test(c.input) &&
        /end of the week/i.test(c.input)
    );
    expect(hit).toBeTruthy();
  });

  it('P0 mustNotCreate cases never wouldMutateWithoutConfirm', () => {
    const p0 = corpus.filter((c) => c.severity === 'P0' && c.expect.mustNotCreate === true);
    const failures: string[] = [];
    for (const c of p0) {
      const r = evaluateCase(c);
      if (r.actual.wouldMutateWithoutConfirm) {
        failures.push(`${c.id}: ${c.input.slice(0, 60)}`);
      }
    }
    expect(failures, JSON.stringify(failures, null, 2)).toEqual([]);
  });

  it('no case anywhere sets wouldMutateWithoutConfirm', () => {
    const failures: string[] = [];
    for (const c of corpus) {
      const r = evaluateCase(c);
      if (r.actual.wouldMutateWithoutConfirm) {
        failures.push(`${c.id}: ${c.input.slice(0, 80)}`);
      }
    }
    expect(failures, JSON.stringify(failures.slice(0, 30), null, 2)).toEqual([]);
  });

  it('runs full corpus and prints summary (soft expectations)', () => {
    let passed = 0;
    const byCat: Record<string, { t: number; p: number }> = {};
    for (const c of corpus) {
      const r = evaluateCase(c);
      if (!byCat[c.category]) byCat[c.category] = { t: 0, p: 0 };
      byCat[c.category].t++;
      if (r.passed) {
        passed++;
        byCat[c.category].p++;
      }
    }
    console.log(
      JSON.stringify(
        { total: corpus.length, passed, failed: corpus.length - passed, passRate: passed / corpus.length, byCategory: byCat },
        null,
        2
      )
    );
    expect(corpus.length).toBeGreaterThanOrEqual(500);
  });
});
