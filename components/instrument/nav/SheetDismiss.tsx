'use client';

export default function SheetDismiss({ onDismiss, label = 'Dismiss' }: { onDismiss: () => void; label?: 'Close' | 'Dismiss' | string }) {
  return (
    <button type="button" className="ins-nav-dismiss" aria-label={label} data-instrument-nav="dismiss" onClick={onDismiss}>
      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" focusable="false">
        <path d="m5 5 10 10M15 5 5 15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}
