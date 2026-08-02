'use client';

import { useEffect, useState } from 'react';

// The third signature moment — demonstrates capacity_first sorting itself:
// a new task gets captured, and the list quietly rearranges so whatever
// still fits today floats above whatever doesn't, rather than the new
// item just landing wherever it was typed.

type DemoItem = {
  id: string;
  label: string;
  mins: number;
  fits: boolean;
};

const ITEMS: DemoItem[] = [
  { id: 'reply', label: 'Reply to client', mins: 15, fits: true },
  { id: 'sync', label: 'Team sync', mins: 20, fits: true },
  { id: 'proposal', label: 'Draft proposal', mins: 90, fits: false },
  { id: 'reroof', label: 'Revise Quote', mins: 45, fits: true },
];

const CAPACITY_MINS = 100;

// Explicit slot index per phase — the four items always exist in the DOM
// (so nothing pops in/out awkwardly); only their position and opacity
// change between phases, animated via transform.
const SLOTS = {
  before: { reply: 0, sync: 1, proposal: 2, reroof: 3 },
  captured: { reply: 0, sync: 1, proposal: 2, reroof: 3 },
  after: { reply: 0, sync: 1, reroof: 2, proposal: 3 },
} as const;

type Phase = keyof typeof SLOTS;

const ITEM_H = 54;
const LOOP_MS = 9600;

export default function ReshuffleDemo() {
  const [phase, setPhase] = useState<Phase>('before');

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function schedule(fn: () => void, delay: number) {
      timers.push(setTimeout(() => { if (!cancelled) fn(); }, delay));
    }

    function run() {
      setPhase('before');
      schedule(() => setPhase('captured'), 1400);
      schedule(() => setPhase('after'), 2900);
      schedule(run, LOOP_MS);
    }

    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  const reroofVisible = phase !== 'before';
  const usedMins =
    phase === 'after'
      ? ITEMS.filter((i) => i.id !== 'proposal').reduce((s, i) => s + i.mins, 0)
      : ITEMS.filter((i) => i.fits && i.id !== 'reroof').reduce((s, i) => s + i.mins, 0);

  return (
    <div
      className="reshuffle-demo"
      role="img"
      aria-label="Animated demonstration of Dokkit's list reordering itself so tasks that fit today float above tasks that don't"
    >
      <div className="reshuffle-demo-header">
        <span className="reshuffle-demo-header-label">Fits today</span>
        <span className="reshuffle-demo-header-value mono">{usedMins}m / {CAPACITY_MINS}m</span>
      </div>
      <div className="reshuffle-demo-bar-track">
        <div className="reshuffle-demo-bar-fill" style={{ width: `${Math.min((usedMins / CAPACITY_MINS) * 100, 100)}%` }} />
      </div>

      <div className="reshuffle-demo-list">
        {ITEMS.map((item) => {
          const slot = SLOTS[phase][item.id as keyof (typeof SLOTS)['before']];
          const isNew = item.id === 'reroof';
          const overflow = item.id === 'proposal';
          return (
            <div
              key={item.id}
              className={`reshuffle-demo-item ${overflow ? 'overflow' : ''}`}
              style={{
                transform: `translateY(${slot * ITEM_H}px)`,
                opacity: isNew && !reroofVisible ? 0 : 1,
              }}
            >
              <span className={`reshuffle-demo-dot ${overflow ? 'hazard' : 'fits'}`} />
              <span className="reshuffle-demo-label">{item.label}</span>
              <span className="reshuffle-demo-mins mono">{item.mins}m</span>
              {overflow && <span className="reshuffle-demo-tag">carrying forward</span>}
            </div>
          );
        })}
      </div>

      {phase === 'after' && <p className="reshuffle-demo-note">Reordered to fit today — nothing lost, nothing forced.</p>}
    </div>
  );
}
