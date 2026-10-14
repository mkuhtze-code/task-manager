# Phase G — Instrument acceptance & defect closure

## Scope and method

Phase G is a source-level acceptance pass against the Phase A–F contracts. It makes no data-model, capture, Reality Check outcome, navigation, entitlement, or content-hierarchy changes. Source inspection is available, but this session has no live authenticated browser/device session; visual checks requiring rendered states are marked **not run**, not inferred as passes.

Checklist statuses: **PASS (source)** = source/contracts inspected with no violation found; **FIXED (source)** = concrete mismatch corrected; **NOT RUN (visual/interaction)** = requires running the app at the specified viewport/theme/state and exercising it.

## Acceptance checklist

| Surface / contract | Status | Evidence / note |
|---|---|---|
| Today — identity, capacity, task-list hierarchy | PASS (source) | Phase E contract unchanged; no Today layout/source edits. |
| Today — Start / Stop / Complete / expand / drag | NOT RUN (interaction) | Requires live task data and pointer/touch interaction. |
| Today — static active mark and progress; no infinite pulse | PASS (source) | Phase D explicitly disables active-dot animation. |
| Today — reduced-motion progress/pressure transitions | PASS (source) | Phase D reduced-motion rule covers progress, pressure, and capacity selectors. |
| Today — Reality Check reachable and subordinate | NOT RUN (visual/interaction) | Existing disclosure retained; live prominence not asserted. |
| Today — empty day and starter-task usability | NOT RUN (visual/interaction) | Requires runtime data states. |
| Jobs — concise pulse; depth only on disclosure | PASS (contract/source) | Phase B mappings and disclosure contract unchanged. |
| Jobs — mobile title/open glance/context line | PASS (contract/source) | Phase C row contract unchanged. |
| Jobs — desktop title/state/evidence summary | PASS (contract/source) | Phase C row contract unchanged. |
| Jobs — filters/search/create | NOT RUN (interaction) | Handlers unchanged; runtime interaction not available in source-only pass. |
| Jobs — full evidence and next work in detail route | NOT RUN (runtime) | Requires live data. |
| Meetings — title/time glance/open count; no state slab | PASS (contract/source) | Phase C contract unchanged. |
| Meetings — pressure classes and non-colour cue | PASS (contract/source) | Phase A semantic pressure classes/tokens remain the contract. |
| Meetings — featured strip gating/object language | NOT RUN (visual) | Rendered gating needs runtime inspection. |
| Meetings — filters/search/date selection readability | FIXED (source) | Carousel uses aria-selected=true and .is-active; Phase F selectors did not match either. |
| Travel — title/date/stops glance and quiet delete | PASS (contract/source) | Phase C contract unchanged; delete handler untouched. |
| Travel — pressure classes; phase not a collapsed essay | PASS (contract/source) | Phase C contract unchanged. |
| Travel — featured strip consistency | NOT RUN (visual) | Rendered parity needs runtime inspection. |
| Nav — active tab weight + hairline | PASS (source) | Phase F rule retained. |
| Nav — locked Pro tabs visible/muted and billing route intact | PASS (contract/source) | Phase F does not alter routing or entitlement logic. |
| Nav — visible keyboard focus for tabs, filters, search, back, primary actions | PASS (selector/source) | Focus selectors retained, including carousel buttons; actual contrast needs visual verification. |
| Nav — mobile back-to-Today orientation on Pro surfaces | NOT RUN (runtime) | Requires authenticated Pro navigation. |
| Light/dark, ~390px mobile and desktop layouts | NOT RUN (visual) | Requires rendered browser/device inspection. |

## Defect closure

### G-01 — date-carousel selected-state hook mismatch

- **Severity:** Medium (selected date may not receive the documented active-state treatment).
- **Violated contract:** docs/phase-f-wayfinding.md, “Date carousel”; docs/phase-c-object-grammar.md, shared glance/state grammar.
- **Reproduction from source:** components/SurfaceDateCarousel.tsx marks the selected tab with aria-selected={active} and className containing is-active. Phase F targeted aria-current=date, aria-pressed=true, .selected, and .active. None matches the component's actual selected state.
- **Fix:** app/phase-f-wayfinding.css now styles .surface-date-chip[aria-selected='true'] and .surface-date-chip.is-active. Selector alignment only; date selection and interaction unchanged.
- **Verification:** source markup and selector now match. Rendered contrast/appearance remains a manual acceptance item.

## Files changed

- app/phase-f-wayfinding.css — corrected selected-date selector to match the component's aria-selected / is-active contract.
- docs/phase-g-acceptance.md — checklist, concrete mismatch/fix, residual visual/runtime checks, and scope boundaries.

## Residual known issues

- **Medium — visual acceptance outstanding:** light/dark at ~390px and desktop was not executable in this source-only pass. Inspect Today active/empty/starter states, Jobs, Meetings, Travel, selected date, featured strips, focus visibility, and Pro orientation before merge.
- **Low — interaction acceptance outstanding:** Today task controls, filters/search/create, detail evidence, and delete should be smoke-tested in a live authenticated session.
- No other concrete A–F contract violation was established from inspected source. Unverified visual states are not classified as passes.

## Scope confirmation

- No new surfaces, navigation items, scores, decorative systems, row fields, or motion system.
- No Today hierarchy, data model, capture engine, Reality Check outcomes, filtering semantics, routing, or entitlements changed.
- A–F contract documents remain the source of truth.
- **No further redesign recommended without user evidence.** Stop after this acceptance/defect-closure pass; do not create Phase H work from the residual visual checklist alone.
