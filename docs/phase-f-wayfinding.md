# Phase F — Wayfinding & cross-surface consistency

## Scope

Presentation-only polish on top of Phases A–E. Primary navigation destinations/order, routing targets, filter semantics, capture, data loading, entitlements, Today hierarchy, and collapsed list-row contracts are unchanged.

## Before / after notes

### Navigation

- **Before:** active tabs used a filled inset background, stronger border, enlarged glyph, and heavy label treatment; locked tabs used opacity only.
- **After:** the active tab uses a persistent bottom hairline and stronger type weight, without the competing filled panel or enlarged icon. Locked destinations remain visible and muted. Existing tab labels, four-destination order, click targets, and billing feature routing are untouched.
- **Verification note:** light/dark contrast and touch target geometry require device/browser visual acceptance.

### Filters

- **Before:** shared filter primitives existed, but their appearance could vary through per-surface overrides.
- **After:** common segmented controls share compact padding, minimum height, active border, and tabular/monospace count treatment where count markup uses the shared hooks. Filter values and filtering code are untouched.

### Search

- **Before:** the three desktop headers already use an icon button with an explicit open/close state; Jobs had the same pattern and Meetings/Travel were aligned in the existing header components.
- **After:** shared search controls receive consistent icon sizing and a constrained expanded-field width. The existing state handlers continue to own expansion; no search semantics or query logic changed.

### Back / orientation

- Surface title and kicker remain the orientation anchors. This change adds consistent keyboard focus treatment to header links and buttons without adding a second “you are here” label or changing mobile back links.

### Date carousel

- Adds a shared selected-state treatment for date-carousel controls when the component exposes its selected state through `aria-current="date"`, `aria-pressed="true"`, `.selected`, or `.active`.
- No date-selection logic or carousel interaction was changed. The selector is intentionally additive; confirm against each actual rendered carousel variant during visual QA.

### Featured strips

- Adds only spacing/radius alignment hooks for existing featured-strip wrappers. Existing pressure/featured gating and object content are unchanged. If a surface does not use one of these wrapper class names, its featured strip remains governed by its current styles.

### Focus and keyboard

- Adds visible focus outlines to nav tabs, add action, shared filters, search, and header links/buttons, using existing theme tokens with a steel fallback.
- Reduced-motion preference disables the new transitions. No page/layout animation is introduced.

## Files touched

- `app/phase-f-wayfinding.css` — shared presentation overrides
- `app/layout.tsx` — imports the Phase F stylesheet after Phase D

## Contract checks

- Primary navigation remains Today / Jobs / Meetings / Travel in the existing order.
- Locked Pro destinations remain visible and continue routing to billing with their existing `feature` parameter.
- Today capacity-first hierarchy is untouched.
- Phase C collapsed list-row content contracts are untouched.
- Phase B pulse strings, filter semantics, data loading, entitlements, and routing destinations are untouched.
- No scores, badges, or new decorative motion added.

## Residual issues / acceptance still required

This is a source-level implementation record, not a claim of device-level visual verification. Before merging, run the repository's normal build/checks and manually inspect mobile and desktop Jobs, Meetings, and Travel in light/dark themes; keyboard-tab through all controls; and verify reduced-motion behavior. In particular, confirm the selected date and featured-strip wrapper selectors match the rendered markup on each surface. No behavior changes were intentionally made.
