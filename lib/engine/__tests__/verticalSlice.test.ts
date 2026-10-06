import { describe, it, expect } from 'vitest';
import { runConversation, runEngineCycle } from '../orchestrate';
import { resolveReference } from '../references';
import { emptyWorkingMemory, makeMemoryItem, remember, setFocus } from '../workingMemory';
import { interpretRequestUtterance } from '../request';

describe('vertical slice — flashing / ABC Roofing', () => {
  const jobs = [
    { id: 'j1', name: 'Henderson', locationText: '12 Henderson Rd' },
    { id: 'j2', name: 'ABC Roofing', locationText: 'ABC Roofing yard' },
  ];
  const meetings = [{ id: 'm1', text: 'Site meeting', startAt: '2026-10-05T14:00:00' }];

  it('understands pickup reminder and proposes create_task', () => {
    const r = runEngineCycle({
      utterance: 'Remind me to pick up the flashing from ABC Roofing.',
      todayDate: '2026-10-05',
      context: {
        jobs,
        meetings,
        remainingMinsToday: 120,
        openTaskCount: 3,
      },
    });

    expect(r.request.action).toMatch(/remind|pickup/);
    expect(r.request.objectText?.toLowerCase()).toContain('flashing');
    expect(r.request.locationText?.toLowerCase()).toMatch(/abc/);
    expect(r.action.kind).toBe('create_task');
    if (r.action.kind === 'create_task') {
      expect(r.action.text.toLowerCase()).toContain('flashing');
      expect(r.action.jobId).toBe('j2');
    }
    expect(r.explanation.length).toBeGreaterThan(10);
    expect(r.evidence.length).toBeGreaterThan(0);
    expect(r.authority.mayAct).toBe(true);
  });

  it('refines same request with today + Henderson consequence', () => {
    const turns = runConversation(
      [
        'Remind me to pick up the flashing from ABC Roofing.',
        "Actually I need it today because I'm using it on the Henderson job.",
      ],
      {
        todayDate: '2026-10-05',
        context: { jobs, meetings, remainingMinsToday: 90 },
      }
    );

    expect(turns).toHaveLength(2);
    const second = turns[1];
    expect(second.request.id).toBe(turns[0].request.id);
    expect(second.request.dateHint).toBe('today');
    expect(second.request.relatedJobText?.toLowerCase()).toContain('henderson');
    expect(second.request.urgency).not.toBe('none');
    expect(second.request.consequence?.toLowerCase()).toMatch(/henderson|using/);
    const facts = second.facts.join(' ').toLowerCase();
    expect(facts).toMatch(/today|henderson|abc/);
  });

  it('adds route opportunity after meeting without dropping prior request', () => {
    const turns = runConversation(
      [
        'Remind me to pick up the flashing from ABC Roofing.',
        "Actually I need it today because I'm using it on the Henderson job.",
        "I'm heading through there after the meeting.",
      ],
      {
        todayDate: '2026-10-05',
        context: { jobs, meetings, remainingMinsToday: 60 },
      }
    );

    const last = turns[2];
    expect(last.request.id).toBe(turns[0].request.id);
    expect(last.request.constraints.some((c) => c.value === 'route_opportunity')).toBe(
      true
    );
    expect(last.request.constraints.some((c) => c.value === 'after_meeting')).toBe(true);
    expect(last.plan.steps.some((s) => s.kind === 'suggest')).toBe(true);
    expect(last.explanation.toLowerCase()).toMatch(/meeting|route|flashing|abc/);
  });
});

describe('working memory references', () => {
  it('resolves "that" to current focus', () => {
    let mem = emptyWorkingMemory('today');
    mem = remember(
      mem,
      makeMemoryItem({
        type: 'task',
        label: 'Pick up flashing',
        source: 'test',
        salience: 0.9,
        id: 't1',
      })
    );
    mem = setFocus(mem, { kind: 'task', id: 't1', label: 'Pick up flashing' });
    const r = resolveReference('add that', mem);
    expect(r.status).toBe('resolved');
    if (r.status === 'resolved') {
      expect(r.item.label).toMatch(/flashing/i);
    }
  });
});

describe('request interpretation', () => {
  it('reads temporal and flexibility without domain recipes for grocery', () => {
    const a = interpretRequestUtterance('Put that on tomorrow');
    expect(a.dateHint).toBe('tomorrow');
    expect(a.isRefinement).toBe(true);

    const b = interpretRequestUtterance("It's not urgent — whenever");
    expect(b.urgency).toBe('none');
    expect(b.flexibility).toBe('high');
  });
});

it('understands a concrete drop-off with address, time and today as executable work', () => {
  const r = runEngineCycle({
    utterance:
      'I need to drop off clips to 64 Grace James Road in Pukekohe at 12pm today',
    todayDate: '2026-10-06',
    context: {
      nowIso: '2026-10-06T09:00:00+13:00',
      surfaceDate: '2026-10-06',
      remainingMinsToday: 480,
      openTaskCount: 3,
      jobs: [],
      meetings: [],
      knownLocations: [],
      communicationHints: [],
    },
  });

  expect(r.request.action).toBe('create_task');

  expect(r.request.objectText).toBe('clips');

  expect(r.request.locationText?.toLowerCase()).toContain(
    '64 grace james road'
  );

  expect(r.request.locationText?.toLowerCase()).toContain(
    'pukekohe'
  );

  expect(r.request.dateHint).toBe('today');

  expect(r.request.timeHint).toBe('12:00');

  expect(r.request.confidence).toBe('high');

  expect(r.authority.mayAct).toBe(true);

  expect(r.action.kind).toBe('create_task');

  if (r.action.kind === 'create_task') {
    expect(r.action.text).toBe('Drop off clips');

    expect(r.action.locationText?.toLowerCase()).toContain(
      '64 grace james road'
    );

    expect(r.action.surfaceDate).toBe('2026-10-06');
  }
});
