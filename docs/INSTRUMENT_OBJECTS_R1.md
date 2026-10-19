# Instrument Experience R1 — ObjectRow and DepthSheet

## Contract
Shared presentational primitives live in components/instrument/ObjectRow.tsx, components/instrument/DepthSheet.tsx, and app/instrument-objects.css. New chrome uses only --ins-* tokens and is scoped beneath [data-instrument-shell].

## ObjectRow
- Required state is emitted as data-object-state. Active/live/running use a steel edge; state remains textual and accessible.
- Identity, glance and optional context are distinct landmarks. Glance uses tabular monospace; context is a single truncated line.
- Leading/trailing controls reserve at least 44px. Destructive actions must remain outside navigation links.
- href preserves route navigation; onOpen is for non-link rows. No data access, domain calculations, or mutations belong here.
- children is a temporary strangler bridge for complex legacy controls. New adapters should use slots; do not remove the bridge until task timer, drag, completion and accessibility semantics can be preserved.

## DepthSheet
- The caller supplies the existing useDialogA11y callback ref and dismiss handler to retain Escape, focus containment, focus restoration, and topmost-modal arbitration.
- Slot order is header, identity/glance, domain sections, secondary actions, danger zone. Danger zone is last.
- Domain callers retain loading, validation, edits, mutations and confirmation rules.

## Migration boundary
TaskDetailSheet remains the task editor and should not be rewritten wholesale; its validation, draft preservation, inline delete placement, and timer actions make it a high-risk migration. DepthSheet is shipped with a focused contract test harness; migrate a detail flow only when its sections can be placed in the required order without changing existing behavior. Existing job, meeting and trip detail flows must be assessed individually. R1 does not rewrite all four detail experiences.
- Keep IDs, routes, timer/complete callbacks, entitlement redirects and trip-delete confirmation unchanged.
- No engine, capacity, offline, travel-window, search/filter/sort or entitlement logic changes.
