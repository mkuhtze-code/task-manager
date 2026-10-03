/**
 * Text-layer quality harness (no audio / STT).
 * Scores normalisation and understanding separately so a change in one
 * layer cannot hide regressions in the other.
 */

import { normaliseSpeech } from './normalise';
import { interpretSpeech } from './interpret';
import type {
  SpeechCertainty,
  CommitmentStrength,
  AmbiguityLevel,
} from './types';
import { MUST_NOT_CORRECT } from './golden/mustNotCorrect';

export type BenchmarkCase = {
  id: string;
  input: string;
  todayIso?: string;
  expect: {
    contains?: string[];
    notContains?: string[];
    hasCorrection?: boolean;
    temporalKind?: string;
    intent?: string | RegExp;
    certainty?: SpeechCertainty | RegExp;
    commitment?: CommitmentStrength | RegExp;
    ambiguity?: AmbiguityLevel | RegExp;
    requiresConfirmation?: boolean;
  };
};

export type LayerScore = {
  total: number;
  passed: number;
  failed: { id: string; reasons: string[] }[];
};

export type BenchmarkReport = {
  normalisation: LayerScore;
  understanding: LayerScore;
  cases: number;
};

export const DEFAULT_BENCHMARK_CASES: BenchmarkCase[] = [
  {
    id: 'basic',
    input: 'Call John tomorrow.',
    expect: {
      contains: ['john', 'tomorrow'],
      intent: /create|remember|plan/,
    },
  },
  {
    id: 'filler',
    input: 'Um, I need to, uh, call John tomorrow.',
    expect: {
      contains: ['call', 'john'],
      notContains: ['um', 'uh'],
    },
  },
  {
    id: 'correction_date',
    input: 'Call John tomorrow, actually Friday.',
    expect: {
      hasCorrection: true,
      contains: ['friday'],
    },
  },
  {
    id: 'correction_time',
    input: 'Meet Sarah at three, no, four.',
    expect: {
      hasCorrection: true,
      contains: ['four'],
    },
  },
  {
    id: 'spoken_punct',
    input: "Send Mike a message comma I'll call him tomorrow period.",
    expect: {
      contains: [',', '.'],
    },
  },
  {
    id: 'day_after',
    input: 'Do that the day after tomorrow.',
    todayIso: '2026-10-02',
    expect: {
      temporalKind: 'relative_day',
    },
  },
  {
    id: 'uncertain',
    input: "I'll probably get that done tomorrow.",
    expect: {
      certainty: /probable|tentative|uncertain/,
      commitment: /weak|moderate|none/,
    },
  },
  {
    id: 'strong',
    input: 'I absolutely need to get that done tomorrow.',
    expect: {
      commitment: 'strong',
      certainty: /definite|likely/,
    },
  },
  {
    id: 'ambiguous',
    input: 'Maybe sometime next week.',
    expect: {
      ambiguity: /high|partial/,
      requiresConfirmation: true,
      certainty: /uncertain|speculative|tentative/,
    },
  },
  {
    id: 'entity_correction',
    input: 'Create a job for Henderson roof — sorry, Henderson extension.',
    expect: {
      hasCorrection: true,
      contains: ['extension'],
    },
  },
  {
    id: 'repetition',
    input: 'I need to call John John tomorrow.',
    expect: {
      contains: ['john', 'tomorrow'],
    },
  },
  {
    id: 'refusal_not_correction',
    input: 'I said no to the Henderson job yesterday.',
    expect: {
      hasCorrection: false,
      contains: ['henderson'],
    },
  },
  {
    id: 'empty',
    input: '   ',
    expect: {
      intent: 'unknown',
    },
  },
  {
    id: 'trades_quote',
    input: 'Need to send the Henderson quote by Friday.',
    expect: {
      contains: ['henderson', 'friday'],
      intent: /create|remember|plan|schedule/,
    },
  },
  {
    id: 'trades_site',
    input: 'Go back to the Queen Street site this afternoon.',
    expect: {
      contains: ['queen', 'afternoon'],
      temporalKind: 'time_of_day',
    },
  },
  {
    id: 'trades_materials',
    input: 'Order more gib board for the extension, um, tomorrow.',
    expect: {
      contains: ['gib', 'tomorrow'],
      notContains: ['um'],
    },
  },
  {
    id: 'correction_entity_job',
    input: 'Create a job for Henderson roof, sorry, Henderson extension.',
    expect: {
      hasCorrection: true,
      contains: ['extension'],
    },
  },
  {
    id: 'next_friday',
    input: 'Book the scaffold for next Friday.',
    todayIso: '2026-10-02',
    expect: {
      contains: ['scaffold', 'friday'],
      temporalKind: 'weekday',
    },
  },
  {
    id: 'bare_friday',
    input: 'Finish the invoice Friday.',
    todayIso: '2026-10-02',
    expect: {
      contains: ['invoice', 'friday'],
      temporalKind: 'weekday',
    },
  },
  {
    id: 'multi_action',
    input: 'Call John tomorrow and send Sarah the invoice on Friday.',
    expect: {
      contains: ['john', 'sarah'],
    },
  },
  {
    id: 'vague_sometime',
    input: 'Maybe do the tidy-up sometime next week.',
    expect: {
      ambiguity: /high|partial/,
      requiresConfirmation: true,
      certainty: /uncertain|speculative|tentative|probable/,
    },
  },
  {
    id: 'postpone',
    input: 'Push the paint job to early next week.',
    expect: {
      intent: /postpone|schedule|plan|create|remember/,
    },
  },
  {
    id: 'complete_signal',
    input: 'Mark the bathroom install as done.',
    expect: {
      intent: /complete|edit|create|remember/,
    },
  },
  {
    id: 'spoken_time',
    input: 'Meet the tiler at three thirty.',
    expect: {
      contains: ['3:30', 'tiler'],
    },
  },
  {
    id: 'repetition_name',
    input: 'I need to call Mike Mike about the deposit.',
    expect: {
      contains: ['mike'],
    },
  },
  {
    id: 'commitment_weak',
    input: 'I might get around to the COA paperwork tomorrow.',
    expect: {
      commitment: /weak|none|moderate/,
      certainty: /tentative|uncertain|probable|speculative/,
    },
  },
  {
    id: 'urgency_explicit',
    input: 'This is urgent — call the council before lunch.',
    expect: {
      contains: ['council'],
    },
  },
  {
    id: 'constraint_dependency',
    input: 'Cannot start until the windows arrive.',
    expect: {
      contains: ['windows'],
    },
  },
  {
    id: 'new_line_punct',
    input: 'Site notes new line check flashings period',
    expect: {
      contains: ['.'],
    },
  },
  {
    id: 'end_of_month',
    input: 'Invoice everything by end of the month.',
    todayIso: '2026-10-02',
    expect: {
      temporalKind: 'deadline',
    },
  },
  {
    id: 'yesterday_note',
    input: 'We finished the first fix yesterday.',
    todayIso: '2026-10-02',
    expect: {
      temporalKind: 'yesterday',
    },
  },
  {
    id: 'observe_only',
    input: 'Just noting the client was happy with the progress.',
    expect: {
      intent: /observe|record|remember|unknown/,
    },
  },
  {
    id: 'search_like',
    input: 'Where is the variation for unit three?',
    expect: {
      intent: /search|ask|unknown/,
    },
  },
];

function matchVal(
  actual: unknown,
  expected: string | RegExp | undefined
): boolean {
  if (expected === undefined) return true;
  if (expected instanceof RegExp) {
    return expected.test(String(actual ?? ''));
  }
  return String(actual) === expected;
}

export function runSpeechBenchmark(
  cases: BenchmarkCase[] = DEFAULT_BENCHMARK_CASES
): BenchmarkReport {
  const normalisation: LayerScore = {
    total: 0,
    passed: 0,
    failed: [],
  };

  const understanding: LayerScore = {
    total: 0,
    passed: 0,
    failed: [],
  };

  for (const c of cases) {
    const norm = normaliseSpeech(c.input, {
      todayIso: c.todayIso,
    });

    /*
     * interpretSpeech() performs its own normalization internally.
     *
     * Do not pass `normalisation` here: it is not part of
     * InterpretSpeechOptions, and passing it would create a benchmark-only
     * path that differs from the production interpretation pipeline.
     */
    const interp = interpretSpeech(c.input, {
      todayIso: c.todayIso,
    });

    const nReasons: string[] = [];

    normalisation.total += 1;

    const lower = norm.normalisedText.toLowerCase();

    for (const s of c.expect.contains ?? []) {
      if (
        !lower.includes(s.toLowerCase()) &&
        !norm.normalisedText.includes(s)
      ) {
        nReasons.push(`missing:${s}`);
      }
    }

    for (const s of c.expect.notContains ?? []) {
      if (lower.includes(s.toLowerCase())) {
        nReasons.push(`unexpected:${s}`);
      }
    }

    if (
      c.expect.hasCorrection === true &&
      norm.corrections.length === 0
    ) {
      nReasons.push('expected_correction');
    }

    if (
      c.expect.hasCorrection === false &&
      norm.corrections.length > 0
    ) {
      nReasons.push('unexpected_correction');
    }

    if (c.expect.temporalKind) {
      if (
        !norm.temporals.some(
          (t) => t.kind === c.expect.temporalKind
        )
      ) {
        nReasons.push(`temporal:${c.expect.temporalKind}`);
      }
    }

    if (nReasons.length === 0) {
      normalisation.passed += 1;
    } else {
      normalisation.failed.push({
        id: c.id,
        reasons: nReasons,
      });
    }

    const uReasons: string[] = [];

    understanding.total += 1;

    if (!matchVal(interp.intent, c.expect.intent)) {
      uReasons.push(`intent:${interp.intent}`);
    }

    if (!matchVal(interp.certainty, c.expect.certainty)) {
      uReasons.push(`certainty:${interp.certainty}`);
    }

    if (
      !matchVal(
        interp.commitmentStrength,
        c.expect.commitment
      )
    ) {
      uReasons.push(
        `commitment:${interp.commitmentStrength}`
      );
    }

    if (!matchVal(interp.ambiguity, c.expect.ambiguity)) {
      uReasons.push(`ambiguity:${interp.ambiguity}`);
    }

    if (
      c.expect.requiresConfirmation !== undefined &&
      interp.requiresConfirmation !==
        c.expect.requiresConfirmation
    ) {
      uReasons.push(
        `requiresConfirmation:${interp.requiresConfirmation}`
      );
    }

    if (uReasons.length === 0) {
      understanding.passed += 1;
    } else {
      understanding.failed.push({
        id: c.id,
        reasons: uReasons,
      });
    }
  }

  return {
    normalisation,
    understanding,
    cases: cases.length,
  };
}

export function formatBenchmarkReport(
  report: BenchmarkReport
): string {
  const line = (name: string, s: LayerScore) =>
    `${name}: ${s.passed}/${s.total}` +
    (s.failed.length
      ? `\n  fails: ${s.failed
          .map(
            (f) =>
              `${f.id}(${f.reasons.join(',')})`
          )
          .join('; ')}`
      : '');

  return [
    `Speech benchmark (${report.cases} cases)`,
    line('normalisation', report.normalisation),
    line('understanding', report.understanding),
  ].join('\n');
}

/** Fail if any golden refusal string produces a correction. */
export function runMustNotCorrectAudit(): {
  total: number;
  passed: number;
  failed: {
    input: string;
    corrections: string[];
  }[];
} {
  const failed: {
    input: string;
    corrections: string[];
  }[] = [];

  for (const input of MUST_NOT_CORRECT) {
    const norm = normaliseSpeech(input);

    if (norm.corrections.length > 0) {
      failed.push({
        input,
        corrections: norm.corrections.map(
          (c) =>
            `${c.marker}:${c.originalRaw}->${c.correctedRaw}`
        ),
      });
    }
  }

  return {
    total: MUST_NOT_CORRECT.length,
    passed: MUST_NOT_CORRECT.length - failed.length,
  };
}
