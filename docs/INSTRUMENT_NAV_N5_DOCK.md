# N5 — SystemDock visual acceptance

## Automated contract
- SystemDock renders exactly four root destinations, in order: Today → Jobs → Meetings → Travel.
- The active lens is exposed through `data-active-lens`, `data-active`, `aria-current="page"`, and `aria-selected`.
- SurfaceNav retains the existing hrefs, Pro billing feature mapping, quiet visit tracking, and contextual primary callback.
- The contextual primary is a separate action outside the four-tab tablist; GearMenu is not rendered by SystemDock.
- Dock chrome uses Instrument tokens and stays fixed to the mobile viewport. Existing `--instrument-shell-dock-clearance` remains authoritative.
- Lens emphasis transitions opacity only, within `--ins-motion-standard`; reduced-motion removes that transition. Dock activation does not add page translation.

## Manual device checklist — not yet executed by CI
- [ ] 390px viewport: all four labels remain readable and every target is at least 44px.
- [ ] 320px narrow viewport: no horizontal overflow; the contextual primary does not crowd Meetings.
- [ ] Safe-area inset: dock clears Android/iOS bottom gesture area; workspace content remains reachable above it.
- [ ] Dark mode: paper, ink, steel indicator, border, and focus ring remain distinguishable.
- [ ] Keyboard: each tab and contextual primary has a visible focus ring with no clipping.
- [ ] Reduced motion: changing lens does not animate icon opacity.
- [ ] Root routes: Today `/`, Jobs `/jobs`, Meetings `/meetings`, Travel `/travel`.
- [ ] Free account: Jobs → `/account/billing?feature=jobs`, Meetings → `/account/billing?feature=meetings`, Travel → `/account/billing?feature=travel`.
- [ ] Peer details: one visible dock only; active parent lens remains marked.
- [ ] Utility pages: existing visibility policy is unchanged; no new hide/dim behavior.
- [ ] Desktop: sidebar IA is unchanged; mobile SystemDock is hidden.

**N5 boundary:** visual and motion ownership only. No N6 return-state work.