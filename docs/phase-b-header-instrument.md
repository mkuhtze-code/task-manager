# Phase B — surface header instrument decisions

Scope: header presentation and call-site strings only. Phase A token contract is preserved. Full narrative remains available in existing depth/context disclosures; this phase does not change data models or flows.

## Pulse/header string mappings

| Component / surface | Before | After | Decision |
|---|---|---|---|
| `DesktopJobsHeader` pulse | `{n} active today` | `{n} active` | Short primary status; “today” is implicit in this surface instrument |
| `DesktopJobsHeader` pulse | `{n} open` | `{n} open` | Keep concise count |
| `DesktopJobsHeader` pulse | `No open work` | `Clear` | Clear state is also conveyed by `.is-clear` + square mark |
| `app/jobs/page.tsx` mobile identity | `{n} active today` / `{n} open jobs` / `No open work` | `{n} active` / `{n} open` / `Clear` | Same compact vocabulary as desktop |
| `app/meetings/page.tsx` mobile identity | Model-generated pulse sentence/phrase | `{n} live`, else `{n} today`, else `{n} ahead`, else `Clear` | Counts reflect existing live/today/upcoming/flexible collections |
| `app/meetings/page.tsx` desktop call site | Model-generated pulse sentence/phrase | Same compact live/today/ahead/Clear hierarchy | Underlying pulse meta and depth data remain available |
| `app/travel/page.tsx` mobile identity | Model-generated phase/regime phrase | `{n} active`, else `{n} upcoming`, else `Clear` | State/count first; no model or data changes |
| `app/travel/page.tsx` desktop call site | Model-generated phase/regime phrase | Same compact active/upcoming/Clear hierarchy | Existing depth/context content is retained |
| `components/SurfaceHeaderIdentity.tsx` accessible name | `{title} status` | `{title}: attention/clear/status, {signal}, {meta if present}` | Explicit state and signal are announced non-visually |
| Shared `.surface-pulse` | Border and text, state may rely on colour | Leading state mark + weighted mono signal + tokenized state border | Attention = filled circular mark; clear = outlined square; neutral = outlined circle |
| Meetings section ledes | Visible explanatory sublines | Hidden in default view via CSS | Section titles and rows remain; source strings/data remain, empty-state copy unaffected |
| Travel section ledes | Visible explanatory sublines | Hidden in default view via CSS | Section titles and rows remain; source strings/data remain, empty-state copy unaffected |

## Shared instrument contract

- Identity kicker and title remain unchanged.
- `.surface-pulse` remains the compact instrument container; `.is-attention` and `.is-clear` retain their state semantics.
- Attention uses `--pressure-now`; clear uses `--fit-ok`; both add a distinct mark shape/weight, so hue is not the sole cue.
- The accessible name includes explicit attention/clear/status plus the visible signal and any available meta.
- `.surface-pulse-title` uses tabular numerals and stronger weight.
- Existing meta, long narrative, consequence/depth content and controls are retained. Meta remains subject to the existing shared rule that hides `.surface-pulse-meta` in the default chrome; no data is deleted.

## Deferred to Phase C

- Any Jobs / Meetings / Travel collapsed row anatomy, metadata hierarchy, row pressure/fit presentation, or row-level copy changes.
- No SurfaceNav changes, no TaskCard changes, no new motion, and no Today cockpit restructuring. Today-specific capacity instrument already exists and is not rewritten in this phase.

## Verification notes

- Files changed are limited to the shared identity component, shared surface CSS, Jobs/Meetings/Travel header call sites, and this document.
- Manual light/dark Jobs header sanity and screenshots were not captured by this repository edit; verify before merge.
- Build/test status must be checked on the PR's latest commit.
