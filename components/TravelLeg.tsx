'use client';

import { useState, type ReactNode } from 'react';

// Quiet connective tissue between two geo-located stops/tasks in
// geo_aware (Today) and Travel modes. Renders as a hairline with a tiny
// drive-time label so the leg reads as a property of the gap rather than
// a competing row; tapping it reveals the full origin → destination
// detail (and an optional action) without becoming a visual focal point.
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
      <button className="leg-connector" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="leg-connector-line" />
        <span className="leg-connector-label">{label}</span>
        <span className="leg-connector-line" />
      </button>
      {open && (
        <div className="leg-detail">
          {detail}
          {action && <div className="leg-detail-action">{action}</div>}
        </div>
      )}
    </div>
  );
}
