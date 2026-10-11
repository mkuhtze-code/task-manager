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
- Defined `--focus-ring` as an alias to the existing theme-aware `--shadow-focus` token. This resolves a missing token already consumed by the Today surface and standardizes focus treatment without introducing a new color value.
- Wired the audit into the existing production build chain, so the web and Capacitor-test builds execute it.

## Still to complete

- Continue consolidating `surface-system.css` authority, starting with the remaining mobile/desktop navigation variants and shared object rows.
- Reduce Today/Capture override count by moving declarations into their actual owning selectors, not by lowering specificity blindly.
- Continue removing literal colors and token fallbacks only when the replacement preserves contrast and theme behavior.
- Verify mobile and desktop, light and dark themes, keyboard focus, reduced motion, sheets/portals, and safe areas after each visual slice.
- Update this document with measured reductions as each slice lands.
