'use client';

import { useState, type ReactNode } from 'react';

// Quiet connective tissue between two geo-located stops/tasks in
// geo_aware (Today) and Travel modes. Renders as a hairline with a tiny
// drive-time label so the leg reads as a property of the gap rather than
// a competing row. Tapping the hairline reveals the full origin →
// destination detail without becoming a focal point.
//
// When an action is provided (Travel's "Nearby"), it stays quietly
// visible on the leg itself — a discoverable, one-tap entry to the leg's
// hidden capability — instead of being buried behind the reveal.
export function TravelLeg({
  label,
  detail,
  action,
}: {
  label: string;
  detail: string;
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="leg-wrap">
      <div className="leg-connector">
        <button className="leg-connector-toggle" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span className="leg-connector-line" />
          <span className="leg-connector-label">{label}</span>
          <span className="leg-connector-line" />
        </button>
        {action && <div className="leg-connector-action">{action}</div>}
      </div>
      {open && <div className="leg-detail">{detail}</div>}
    </div>
  );
}
