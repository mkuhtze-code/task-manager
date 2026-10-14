'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * Quiet control: a non-modal popover panel (dropdown style).
 * It is named for assistive technology and returns focus on Escape, but never
 * traps focus because users must be able to move naturally to the surrounding page.
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const triggerId = useId();
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const panel = wrapRef.current?.querySelector<HTMLElement>('[role="dialog"]');
    const focusTarget = panel?.querySelector<HTMLElement>(
      'a[href]:not([tabindex="-1"]), button:not([disabled]):not([tabindex="-1"]), input:not([type="hidden"]):not([disabled]):not([tabindex="-1"]), textarea:not([disabled]):not([tabindex="-1"]), select:not([disabled]):not([tabindex="-1"]), [contenteditable="true"]:not([tabindex="-1"]), [tabindex]:not([tabindex="-1"])',
    ) ?? panel;

    if (focusTarget) {
      requestAnimationFrame(() => {
        if (panel && document.body.contains(panel)) focusTarget.focus();
      });
    }

    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => {
      document.removeEventListener('mousedown', onDoc);
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
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        // A focused non-modal disclosure closes before an enclosing modal sees Escape.
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }}
    >
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={open ? 'meeting-pill meeting-pill--primary' : 'meeting-pill'}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        {typeof count === 'number' && count > 0 ? (
          <span className="pill-reveal-count">{count}</span>
        ) : null}
      </button>
      {open && (
        <div
          id={panelId}
          className={panelClasses}
          role="dialog"
          aria-labelledby={triggerId}
          tabIndex={-1}
        >
          {children}
        </div>
      )}
    </div>
  );
}
