'use client';
import SheetDismiss from '@/components/instrument/nav/SheetDismiss';

import type { ReactNode } from 'react';
import { useDialogA11y } from '@/hooks/useDialogA11y';

type DepthSheetProps = {
  onDismiss: () => void; title: string;
  identity?: ReactNode; glance?: ReactNode; headerContent?: ReactNode; sections?: ReactNode;
  secondaryActions?: ReactNode; dangerZone?: ReactNode; children?: ReactNode;
  ariaLabel?: string; className?: string;
};

/** Shared modal chrome. Reuses useDialogA11y for focus containment, Escape dismissal and focus restoration. */
export default function DepthSheet({ onDismiss, title, identity, glance, headerContent, sections, secondaryActions, dangerZone, children, ariaLabel, className = '' }: DepthSheetProps) {
  const dialogRef = useDialogA11y(onDismiss);
  return <div className="ins-depth-backdrop" data-instrument-depth onMouseDown={(event) => {
    if (event.target === event.currentTarget) onDismiss();
  }}>
    <div ref={dialogRef} className={['ins-depth-sheet', className].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-label={ariaLabel ?? title} data-instrument-depth-dialog>
      <header className="ins-depth-sheet__header"><h2>{title}</h2>{headerContent}<SheetDismiss onDismiss={onDismiss} label="Close" autoFocus /></header>
      {identity != null || glance != null ? <section className="ins-depth-sheet__identity">
        {identity != null ? <div className="ins-depth-sheet__title">{identity}</div> : null}
        {glance != null ? <div className="ins-depth-sheet__glance">{glance}</div> : null}
      </section> : null}
      {sections != null ? <div className="ins-depth-sheet__sections">{sections}</div> : null}
      {children}
      {secondaryActions != null ? <div className="ins-depth-sheet__actions">{secondaryActions}</div> : null}
      {dangerZone != null ? <footer className="ins-depth-sheet__danger">{dangerZone}</footer> : null}
    </div>
  </div>;
}
