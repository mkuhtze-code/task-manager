'use client';

import { useState, type ReactNode } from 'react';

/**
 * Quiet connective tissue between geo stops.
 * Hairline + mono duration — not a competing task row.
 */
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
        <button
          type="button"
          className="leg-connector-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? `Hide: ${detail}` : `Drive ${label}. Show detail.`}
        >
          <span className="leg-connector-line" aria-hidden />
          <span className="leg-connector-label">{label}</span>
          <span className="leg-connector-line" aria-hidden />
        </button>
        {action ? <div className="leg-connector-action">{action}</div> : null}
      </div>
      {open ? <div className="leg-detail">{detail}</div> : null}
    </div>
  );
}
