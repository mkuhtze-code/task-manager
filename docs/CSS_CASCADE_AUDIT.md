# Dokkit CSS Cascade Audit

## Purpose

The CSS migration has introduced a shared surface grammar, design tokens, surface primitives, and dedicated CSS for Today/Capture, Jobs/Meetings/Travel, desktop Settings, and the active-task player. The remaining risk is the legacy cascade: later rules and `!important` declarations can silently override the shared grammar.

This audit establishes a measurable guardrail before removing overrides. It does **not** mechanically delete declarations or claim that a high count is automatically a bug.

## Current baseline

The `npm run audit:css-cascade` command checks brace balance and prevents the `!important` count from increasing in the following files.

| File | Baseline ceiling |
| --- | ---: |
| `app/surface-system.css` | 792 |
| `app/ux-today-product.css` | 104 |
| `app/ux-act-product.css` | 5 |
| `app/ux-capture-proposals.css` | 2 |
| `app/desktop-settings.css` | 0 |
| `app/dokkit-player.css` | 0 |

These are ceilings copied from the current mainline, not acceptable end-state targets. The first two files contain the bulk of the remaining cascade debt. A future cleanup should reduce the budgets deliberately. The first consolidation has lowered `surface-system.css` from 792 to 788 `!important` occurrences. If a change genuinely needs a new `!important`, the PR must explain why and update the ceiling explicitly.

## Cleanup rules

1. Do not remove `!important` based only on text search. Check selector specificity, source order, media/theme scope, and the computed visual state it protects.
2. Move declarations to the owning surface or shared primitive before deleting the override that currently wins.
3. Keep sheet overlays, portal stacking, sticky headers/navigation, safe-area padding, responsive breakpoints, dark mode, and focus states as explicit regression checks.
4. Keep CSS-only changes separate from behavior changes. No event handlers, state transitions, capture parsing, or business logic should change in this pass.
5. Run the audit and both Vercel projects before merge.

## Implemented in this pass

- Added a repeatable cascade audit command.
- Added a hard ceiling against increasing `!important` counts in the six high-impact CSS files.
- Added brace-balance validation to catch a class of malformed CSS edits.
- Consolidated the shared navigation border/background values into the canonical base rule; retained distinct dark-theme, mobile, and desktop variants.
- Removed a repeated desktop `.meeting-row.pressure-now` declaration after verifying it duplicates the same selector, media scope, and values without any intervening equal-specificity override.
- Consolidated the duplicate `.context-line-link:focus-visible` rule while retaining its visible keyboard outline in the canonical Relationships section.
- Migrated the capture speech-status label from an undefined `--hairline` fallback and a redundant `--ink-soft` fallback to the established `--line` and `--ink-soft` semantic tokens. The capture proposal file remains at its existing `!important` ceiling of 2.
- Added `--focus-ring` as an alias to the existing theme-aware `--shadow-focus` token and migrated the Act capture input focus state to it. This supplies the token already consumed by Today CSS and removes a hard-coded focus colour from Act.
- Centralized the three fixed end-stop colors used by Today capacity gradients as `--steel-highlight`, `--hazard-highlight`, and `--danger-highlight` in `globals.css`. The values are unchanged; this is palette ownership, not a visual redesign. The existing `!important` count remains 104 for Today.
- Wired the audit into the existing production build chain, so the web and Capacitor-test builds execute it.

## Implemented in the brand-gradient consistency pass

- Added centrally owned `--dk-gradient-start` and `--dk-gradient-end` tokens for decorative brand gradients. Light mode preserves the existing orange-to-blue treatment; dark mode uses orange-to-deeper-orange so blue no longer competes as the default brand-gradient endpoint. Dedicated load/active-end tokens preserve the pre-existing mixed-colour endpoints in light mode instead of flattening those gradients.
- Migrated the decorative orange/blue accent rails, signature strokes, Today header rails, and depth-load accent to the shared gradient tokens. Explicitly split travel route markers remain two-colour because they encode distinct route states rather than a brand gradient.
- Kept capacity fit/tight/over gradients and their semantic end-stop tokens unchanged; this pass does not redefine status meaning.

## Implemented in the shared-row neutralization pass

- Removed the light- and dark-theme blue-tinted background fills from the active meeting row. The row now uses the shared neutral inset surface token, so the state is communicated without turning an entire row into a brand-colour band.
- Preserved the separate soon/open pressure rails, row structure, click targets, focus outline, and reduced-motion behavior. No meeting data, ordering, or interaction logic changed.

## Still to complete

- Continue consolidating `surface-system.css` authority, starting with the remaining mobile/desktop navigation variants and shared object rows.
- Reduce Today/Capture override count by moving declarations into their actual owning selectors, not by lowering specificity blindly.
- Continue removing literal colors and token fallbacks only when the replacement preserves contrast and theme behavior.
- Verify mobile and desktop, light and dark themes, keyboard focus, reduced motion, sheets/portals, and safe areas after each visual slice.
- Update this document with measured reductions as each slice lands.

## Universal object/header convergence pass

- Added shared object-row tokens for vertical/horizontal rhythm, title scale, and metadata scale.
- Aligned Today task rows, mobile Jobs rows, desktop Job cards, Meeting rows, and Trip rows to neutral surfaces, shared title/meta hierarchy, consistent hover/focus feedback, and matching spacing.
- Removed full-row brand-colour treatment from active Meeting/Trip rows; meaningful state remains available through their existing content/indicators.
- Normalised mobile surface title and context-line typography so Today remains the primary day cockpit without becoming a separate visual system.
- This is a convergence layer over legacy CSS, not the final cleanup. Next pass must delete contradictory duplicate selectors and move shared row/header ownership out of surface-specific overrides.
- Initial Vercel builds failed because the first compatibility bridge added 31 `!important` declarations, taking `app/surface-system.css` to 823 against the 792 ceiling. Removed that bridge; current branch count is 788. The shared normal-priority declarations remain, but some legacy important rules may still win, so visual convergence is not yet proven.
- Validation required: run CSS cascade audit, full regression suite, typecheck, production build; visually compare Today task rows with Jobs/Meetings/Travel in light/dark themes and mobile/desktop, including expanded/running/completed states.

## Surface-header source cleanup — 2026-10

- Removed five decorative `.surface-header::before` / `::after` rules and both `.surface-header-controls::after` gradient rails at source, rather than hiding them behind another selector.
- Removed six orange/blue gradient background declarations from actual `.surface-header` rules, including desktop and dark-theme variants. The canonical semantic `--paper` surface remains in force.
- Preserved responsive header padding, layout, sticky positioning, controls, safe-area behavior, and content hierarchy; this removes decorative colour treatment rather than changing header structure.
- Reduced `app/surface-system.css` from 788 to 782 `!important` occurrences while preserving balanced braces. No budget was raised.
- Next: source-migrate the remaining row-specific ornamental styling and conflicting row typography; validate real pages in mobile/desktop and light/dark before merging.

## Universal row accent cleanup — 2026-10

- Removed shared top rails and hover-gradient rails from job, meeting, travel, and desktop job rows at their source selectors.
- Removed the meeting blue edge stripe, travel blue/orange edge stripe, and alternating blue/orange job-card edge stripes, including desktop-specific reintroductions.
- Removed the travel row's bottom colour band and obsolete mobile positioning override. Kept the desktop travel navigation cue and travel start/end markers, which communicate route structure rather than decorate the row edge.
- Removed the legacy raised-card/shadow/lift treatment and orange hover border that conflicted with the shared flat object-row contract.
- Removed pressure-only orange inset rails, orange/radial row gradients, and oversized pressure title overrides. Priority remains expressed through semantic state/context rather than repainting or resizing the object.
- Removed duplicate title and digital-clock typography overrides so object titles and metadata can follow the shared token contract.
- CSS validation on the branch: 743 `!important` occurrences (down from 782; 39 fewer than the start of this pass), balanced braces. Full CI and both Vercel previews are required before merge; visual checks should compare task/job/meeting/travel rows across mobile/desktop and light/dark themes.


## Today surface convergence — 2026-10

- Removed the mobile-only raised, rounded task-list container so Today uses the same continuous neutral row field on mobile and desktop.
- Removed desktop-only rounded task cards and row gaps; task rows now retain the shared hairline divider and hover treatment across viewport sizes.
- Removed the overload-only tinted header repaint. Overload remains communicated through capacity/status information instead of recolouring the whole header surface.
- Replaced the desktop detail pane's vertical paper gradient with the canonical raised-paper surface token.
- This pass changes surface treatment only; task ordering, capacity calculations, selection, completion, and detail-pane interactions are untouched.
- Source validation: CSS braces balanced; Today `!important` count 104 (unchanged from 104); no new override declarations added.
- Visual verification is still required on the Vercel preview for mobile/desktop and light/dark themes, including empty lists, selected rows, overload state, and detail pane.


## Quiet navigation surfaces — 2026-10

- Removed the orange/blue gradient rail from the floating navigation and the decorative desktop `DOKKIT` stamp, keeping navigation and tab interactions intact.
- Replaced orange-tinted nav borders and accent-coloured inset shadows with neutral line and shadow tokens.
- Removed gradient-filled selected tabs and orange/blue gradient underlines so selection uses the shared neutral raised-paper state and ink marker.
- Changed Meetings and Travel section-header bars from orange/blue decorative strips to a neutral hairline marker.
- Kept the solid primary add control as the only strong brand-colour action in the navigation.
- Validation: balanced CSS braces; `app/surface-system.css` `!important` occurrences 743 → 721.
- Required before merge: regression/typecheck/build checks, both Vercel previews, and visual inspection across mobile/desktop and light/dark.
