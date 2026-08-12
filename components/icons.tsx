export function CheckIcon({ done }: { done: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 18 18">
      <circle cx="9" cy="9" r="7.6" fill={done ? 'var(--moss)' : 'none'} stroke={done ? 'var(--moss)' : 'var(--line-strong)'} strokeWidth="1.6" />
      <path
        d="M5.3 9.3 L7.7 11.8 L12.7 6"
        fill="none"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="12"
        strokeDashoffset={done ? 0 : 12}
      />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M7 5.5c0-1.2 1.3-1.9 2.3-1.3l10 6.5c.9.6.9 2 0 2.6l-10 6.5c-1 .6-2.3-.1-2.3-1.3V5.5Z" fill="currentColor" />
    </svg>
  );
}

export function StopIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <rect x="5.5" y="5.5" width="13" height="13" rx="4" fill="currentColor" />
    </svg>
  );
}

export function DragHandleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

export function FitCheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FitWarnIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 9v4M12 17h.01M10.29 3.86l-8.18 14A2 2 0 0 0 3.82 21h16.36a2 2 0 0 0 1.71-3.14l-8.18-14a2 2 0 0 0-3.42 0Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
