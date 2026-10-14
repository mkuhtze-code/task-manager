'use client';

/** Shared stable identity layer for the Jobs, Meetings, and Travel surfaces. */
type SurfaceHeaderIdentityProps = {
  kicker: string;
  title: string;
  signal: string;
  meta?: string | null;
  attention?: boolean;
  clear?: boolean;
};

export default function SurfaceHeaderIdentity({
  kicker, title, signal, meta = null, attention = false, clear = false,
}: SurfaceHeaderIdentityProps) {
  return (
    <div className="surface-header-orient surface-context-heading">
      <div className="surface-identity">
        <span className="surface-kicker">{kicker}</span>
        <h1 className="surface-title">{title}</h1>
      </div>
      <div
        className={['surface-pulse', attention ? 'is-attention' : '', clear ? 'is-clear' : ''].filter(Boolean).join(' ')}
        role="group"
        aria-label={`${title}: ${attention ? "attention" : clear ? "clear" : "status"}, ${signal}${meta ? `. ${meta}` : ""}`}
      >
        <div className="surface-pulse-body">
          <span className="surface-pulse-title">{signal}</span>
          {meta ? <span className="surface-pulse-meta">{meta}</span> : null}
        </div>
      </div>
    </div>
  );
}
