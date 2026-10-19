# Dokkit Experience R0 — Instrument shell

## Goal and boundary

R0 establishes the shared shell foundation for Today, Jobs, Meetings and Travel. It is presentation and navigation only. Existing route components remain responsible for their own content, data access, mutations, and product behavior.

**Not included:** ObjectRow/DepthSheet (R1), lens body redesigns, engine or domain changes, capture redesign, travel behavior changes, native Android, or wholesale legacy CSS removal. Body content intentionally remains legacy until later phases.

## Instrument token inventory

Source of truth: `app/instrument-tokens.css`. Tokens use the `--ins-*` namespace so legacy page styles are not globally restyled.

- **Colour:** `--ins-paper`, `--ins-paper-elevated`, `--ins-ink`, `--ins-ink-soft`, `--ins-ink-faint`, `--ins-line`, `--ins-line-strong`, `--ins-steel`, `--ins-danger`, `--ins-focus-ring`; functional light and dark values.
- **Type:** `--ins-type-identity`, `--ins-type-body`, `--ins-type-glance-mono`, `--ins-type-context`, `--ins-font-sans`, `--ins-font-mono`.
- **Space and insets:** `--ins-space-1` through `--ins-space-8` (4px rhythm), `--ins-dock-height`, and `--ins-safe-top/right/bottom/left`.
- **Shape/elevation:** `--ins-radius-sm/md/lg`, `--ins-shadow-dock`.
- **Motion:** `--ins-motion-fast`, `--ins-motion-standard`, `--ins-motion-ease`; reduced-motion overrides set durations to zero.
- **Layers:** `--ins-z-dock`, `--ins-z-header`, `--ins-z-sheet`, `--ins-z-toast`.

## Shell regions and ownership

`components/instrument/AppShell.tsx` owns a `data-instrument-shell` root, optional header slot, body region, and dock slot. `lens` is a stable union: `today | jobs | meetings | travel`. In the mobile authenticated frame, the current lens is derived from the existing production pathname. Existing page trees remain children; no domain hooks or selectors are moved into the shell.

`components/instrument/SystemDock.tsx` is the replacement ownership seam. During this strangler stage it delegates to `components/SurfaceNav.tsx` to preserve the established route behavior, four-item order, visit tracking, and Pro billing redirect for Jobs/Meetings/Travel. The existing contextual Add action remains supplied by the prior primary-action registry through AppChrome; it is not a fifth destination.

## Route map

| Lens | Production route | Shell lens |
|---|---|---|
| Today | `/` | `today` |
| Jobs | `/jobs` | `jobs` |
| Meetings | `/meetings` | `meetings` |
| Travel | `/travel` | `travel` |

The root route renders the existing sign-in/loading state without the dock until an authenticated session is present. Other lens routes retain their existing auth and Pro redirects. Desktop continues using its established sidebar/product navigation; R0 does not replace the desktop information architecture.

## CSS load order and cascade ownership

1. `app/globals.css` and existing legacy tokens/styles load first.
2. Existing semantic and experience styles load in their current order.
3. `app/instrument-tokens.css` loads after the existing stylesheet imports.
4. `app/instrument-shell.css` loads after the tokens and legacy styles.

Shell selectors are scoped under `[data-instrument-shell]`. The shell does not globally reset child page styles. Legacy `experience-navigation.css` remains authoritative for the established SurfaceNav presentation until the later dock visual migration. Avoid `!important`; resolve future collisions through ownership and import order.

## Validation and residual risk

The existing SurfaceNav remains intact by design, rather than being deleted before the new shell is proven. Existing source-level navigation assertions should continue to apply. CSS/browser visual verification, dark-mode screenshots, small-screen overflow, keyboard overlap, and desktop shell consolidation remain follow-up validation items. CI is the source of truth for typecheck/build results.

## Next phase

R1 may introduce the canonical ObjectRow and DepthSheet after R0 is reviewed and accepted. **No R1 implementation is part of this change.**
