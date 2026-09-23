'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Quiet control: a pill that opens an overlay panel (dropdown style).
 * Used for Connections, Job files, Meetings — calm surface, detail on demand.
 */
export default function PillReveal(props: {
  label: string;
  count?: number;
  children: ReactNode;
  /** Prefer 'end' when the trigger sits on the right of the bar. */
  align?: 'start' | 'end';
  className?: string;
  /** Extra classes on the overlay panel (e.g. pill-reveal-panel--wide). */
  panelClassName?: string;
}) {
  const {
    label,
    count,
    children,
    align = 'start',
    className = '',
    panelClassName = '',
  } = props;
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const panelClasses = [
    'pill-reveal-panel',
    align === 'end' ? 'align-end' : '',
    panelClassName,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={`pill-reveal${open ? ' is-open' : ''} ${className}`.trim()}
      ref={wrapRef}
    >
      <button
        type="button"
        className={open ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        {typeof count === 'number' && count > 0 ? (
          <span className="pill-reveal-count">{count}</span>
        ) : null}
      </button>
      {open && (
        <div className={panelClasses} role="dialog">
          {children}
        </div>
      )}
    </div>
  );
}
