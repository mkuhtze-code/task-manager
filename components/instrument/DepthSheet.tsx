'use client';

import type { ReactNode, Ref } from 'react';

type DepthSheetProps = {
  dialogRef: Ref<HTMLDivElement>; onDismiss: () => void; title: string;
  identity?: ReactNode; glance?: ReactNode; headerContent?: ReactNode; sections?: ReactNode;
  secondaryActions?: ReactNode; dangerZone?: ReactNode; children?: ReactNode;
  ariaLabel?: string; className?: string;
};

/** Shared modal chrome. Supply the existing useDialogA11y callback ref for focus, Escape and restoration. */
export default function DepthSheet({ dialogRef, onDismiss, title, identity, glance, headerContent, sections, secondaryActions, dangerZone, children, ariaLabel, className = '' }: DepthSheetProps) {
  return <div className="ins-depth-backdrop" data-instrument-depth onMouseDown={(event) => {
    if (event.target === event.currentTarget) onDismiss();
  }}>
    <div ref={dialogRef} className={['ins-depth-sheet', className].filter(Boolean).join(' ')} role="dialog" aria-modal="true" aria-label={ariaLabel ?? title} data-instrument-depth-dialog>
      <header className="ins-depth-sheet__header"><h2>{title}</h2>{headerContent}<button type="button" className="ins-depth-sheet__dismiss" onClick={onDismiss} aria-label="Close details" data-autofocus>×</button></header>
      {identity != null || glance != null ? <section className="ins-depth-sheet__identity">
        {identity != null ? <div className="ins-depth-sheet__title">{identity}</div> : null}
        {glance != null ? <div className="ins-depth-sheet__glance">{glance}</div> : null}
      </section> : null}
      {sections != null ? <div className="ins-depth-sheet__sections">{sections}</div> : null}
      {children}
      {secondaryActions != null ? <div className="ins-depth-sheet__actions">{secondaryActions}</div> : null}
      {dangerZone != null ? <footer className="ins-depth-sheet__danger">{dangerZone}</footer> : null}
    </section>
  </div>;
}
