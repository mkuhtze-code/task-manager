'use client';

import { useEffect, useRef, useState } from 'react';

// A live, looping miniature of Dokkit's own day-rail — this is the landing
// page's signature element. Rather than describe the capacity model in
// prose, it plays it out: a day ticking past, tasks resolving as "now"
// reaches them, and the last one deliberately never gets checked off —
// it carries forward instead, the same way it would in the real app.

const WORK_START_MIN = 8 * 60; // 8:00a
const WORK_END_MIN = 16 * 60; // 4:00p
const LOOP_MS = 13000;

const DEMO_TASKS: { label: string; atPercent: number }[] = [
  { label: 'Client reply', atPercent: 10 },
  { label: 'Revise quote', atPercent: 36 },
  { label: 'Team sync', atPercent: 64 },
  { label: 'Proposal', atPercent: 90 },
];

function fmtClock(minutesOfDay: number): string {
  let h = Math.floor(minutesOfDay / 60);
  const m = Math.floor(minutesOfDay % 60);
  const ampm = h >= 12 ? 'p' : 'a';
  h = h % 12;
  if (h === 0) h = 12;
  return m === 0 ? `${h}${ampm}` : `${h}:${String(m).padStart(2, '0')}${ampm}`;
}

export default function DayRailDemo() {
  const [percent, setPercent] = useState(0);
  const startRef = useRef<number | null>(null);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    function tick(now: number) {
      if (startRef.current === null) startRef.current = now;
      const elapsed = (now - startRef.current) % LOOP_MS;
      setPercent((elapsed / LOOP_MS) * 100);
      frameRef.current = requestAnimationFrame(tick);
    }
    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);

  const currentMinutes = WORK_START_MIN + (percent / 100) * (WORK_END_MIN - WORK_START_MIN);
  // The last demo task is the one that "carries forward" — it never
  // resolves, even after "now" passes it, and even after the loop resets.
  // No guilt language, no red X: it just stays present until the loop
  // starts fresh, exactly like the real product's philosophy.
  const carryForwardThreshold = DEMO_TASKS[DEMO_TASKS.length - 1].atPercent;

  return (
    <div className="rail-demo" role="img" aria-label="Animated demonstration of Dokkit's daily capacity view">
      <div className="rail-demo-readout">
        <span className="rail-demo-time mono">{fmtClock(currentMinutes)}</span>
        <span className="rail-demo-label">today</span>
      </div>

      <div className="rail-demo-track">
        <div className="rail-demo-elapsed" style={{ width: `${percent}%` }} />
        <div className="rail-demo-now-dot" style={{ left: `${percent}%` }} />
        {DEMO_TASKS.map((t, i) => {
          const resolved = percent >= t.atPercent && t.atPercent !== carryForwardThreshold;
          const carrying = t.atPercent === carryForwardThreshold && percent >= t.atPercent;
          // Alternate near/far tiers so adjacent markers never fight for
          // the same horizontal space — this is what was causing labels
          // to visually collide before.
          const tier = i % 2 === 0 ? 'near' : 'far';
          return (
            <div
              key={t.label}
              className={`rail-demo-marker tier-${tier} ${resolved ? 'resolved' : ''} ${carrying ? 'carrying' : ''}`}
              style={{ left: `${t.atPercent}%` }}
            >
              <span className="rail-demo-marker-dot" />
              <span className="rail-demo-marker-label">
                {t.label}
                {carrying && <em>carrying forward</em>}
              </span>
            </div>
          );
        })}
      </div>

      <div className="rail-demo-endpoints">
        <span>{fmtClock(WORK_START_MIN)}</span>
        <span>{fmtClock(WORK_END_MIN)}</span>
      </div>
    </div>
  );
}
