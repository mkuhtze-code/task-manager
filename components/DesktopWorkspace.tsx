'use client';

/**
 * Master–detail workspace for desktop surfaces.
 *
 * Layout:
 *   ┌ secondary (list) ──┬ main (full detail) ──┐
 *   │ compact rows       │ selected item / empty │
 *   └────────────────────┴───────────────────────┘
 *
 * Primary nav stays in DesktopSidebar. Each page owns what goes in
 * secondary vs main. On handheld, callers should not mount this —
 * keep the existing single-column mobile UI.
 */
export default function DesktopWorkspace({
  secondary,
  main,
  secondaryLabel = 'Items',
}: {
  secondary: React.ReactNode;
  main: React.ReactNode;
  secondaryLabel?: string;
}) {
  return (
    <div className="desk-workspace">
      <aside className="desk-secondary" aria-label={secondaryLabel}>
        <div className="desk-secondary-scroll">{secondary}</div>
      </aside>
      <section className="desk-pane" aria-label="Detail">
        <div className="desk-pane-scroll">{main}</div>
      </section>
    </div>
  );
}
