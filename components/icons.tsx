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

/* ── Travel & app chrome icons ───────────────────────────────
   Shared line icons, stroke-based, drawn on a 24px grid so they
   inherit color and scale with their button. Sizes default to the
   slot each icon most often occupies. */

export function BackIcon({ size = 22 }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M15 5.5 8.5 12l6.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlusIcon({ size = 20 }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon({ size = 16 }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6.4 6.4l11.2 11.2M17.6 6.4 6.4 17.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon({ size = 15 }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M10 11v6M14 11v6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BedIcon({ size = 16 }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M3 20V7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M21 20v-8a2 2 0 0 0-2-2h-9v10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3 15h18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="7" cy="9.5" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function ChevronIcon({ size = 16 }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M6 9.5l6 6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MapPinIcon({ size = 16 }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

export function RefreshIcon({ size = 15, spinning = false }: { size?: number; spinning?: boolean } = {}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={spinning ? { animation: 'spin 0.9s linear infinite' } : undefined}
    >
      <path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CompassIcon({ size = 13 }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" fill="currentColor" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}

export function LockIcon({ size = 16 }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

/* ── Surface section markers ──────────────────────────────────
   One family: outline frame + single filled accent dot, drawn on
   the same 24px grid with the shared 1.7 stroke so the four
   switcher symbols stay optically consistent. Abstract wayfinding,
   sized to sit in the bottom navigation at rest. */

export function TodayIcon({ size = 24 }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="7.4" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
    </svg>
  );
}

export function JobsIcon({ size = 24 }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="5" y="5" width="14" height="14" rx="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M5 9.8h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="14.4" r="1.7" fill="currentColor" />
    </svg>
  );
}

export function MeetingsIcon({ size = 24 }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="4.5" y="6" width="15" height="12" rx="3.5" stroke="currentColor" strokeWidth="1.7" />
      <path d="M12 6v12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="8.6" cy="12.5" r="1.7" fill="currentColor" />
      <circle cx="15.4" cy="12.5" r="1.7" fill="currentColor" />
    </svg>
  );
}

export function TravelIcon({ size = 24 }: { size?: number } = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M7 16.5 17.5 6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 6h5v5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="7" cy="16.5" r="1.7" fill="currentColor" />
    </svg>
  );
}
