'use client';

import {
  SectionGlyph,
  useSurfaceNavController,
  type NavSurface,
} from '@/components/SurfaceNav';
import type { InstrumentLens } from '@/components/instrument/AppShell';

/**
 * SystemDock owns the mobile root navigation markup and visual states.
 * SurfaceNav supplies the existing route, entitlement, and visit-tracking behavior.
 */
export default function SystemDock({
  lens,
  onAdd,
  addLabel,
}: {
  lens: InstrumentLens;
  onAdd?: () => void;
  addLabel?: string;
}) {
  const { ordered, isPro, onTab } = useSurfaceNavController(lens as NavSurface);

  return (
    <nav
      className="ins-system-dock"
      aria-label="Primary navigation"
      data-instrument-dock
      data-active-lens={lens}
      data-has-primary={onAdd ? 'true' : 'false'}
    >
      <div className="ins-system-dock__tabs" role="tablist" aria-orientation="horizontal">
        {ordered.map(({ key, label, path, pro }) => {
          const isCurrent = key === lens;
          const locked = Boolean(pro && !isPro);
          return (
            <button
              key={key}
              type="button"
              role="tab"
              className={[
                'ins-system-dock__tab',
                isCurrent ? 'is-active' : '',
                locked ? 'is-locked' : '',
              ].filter(Boolean).join(' ')}
              data-lens={key}
              data-active={isCurrent ? 'true' : undefined}
              aria-selected={isCurrent}
              aria-current={isCurrent ? 'page' : undefined}
              aria-label={locked ? `${label} (plan)` : label}
              onClick={() => onTab(key, path, pro)}
            >
              <span className="ins-system-dock__icon" aria-hidden="true">
                <SectionGlyph surface={key} />
              </span>
              <span className="ins-system-dock__label">{label}</span>
            </button>
          );
        })}
      </div>

      {onAdd ? (
        <button
          type="button"
          className="ins-system-dock__primary"
          onClick={onAdd}
          aria-label={addLabel ?? 'Add'}
        >
          <PlusIconFallback />
        </button>
      ) : null}
    </nav>
  );
}

function PlusIconFallback() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
