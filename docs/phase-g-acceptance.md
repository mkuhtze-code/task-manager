# Phase G — instrument acceptance & defect closure

## Scope and method

Acceptance audit against Phases A–F. Source-level checklist executed against the current `main` implementation and the A–F contract documents. The audit compared shared selectors to rendered component markup and reviewed interaction handlers/contracts without changing data, capture, task timing, Reality Check outcomes, routing, or entitlement logic.

**Verification boundary:** this repository audit does not have a live browser/device session. Therefore visual checks at 390px and desktop, both themes, keyboard traversal, and reduced-motion behavior are recorded as **not visually verified**, not falsely marked passed. The build and CI checks on this PR are the executable gate; the remaining browser checks are listed explicitly below.

## Acceptance checklist

Legend: **PASS (source)** = source/contract alignment checked; **FIXED** = concrete source defect corrected; **BLOCKED** = requires actual browser/device execution.

| Surface / requirement | Result | Evidence / note |
|---|---|---|
| Today — identity, capacity, ordered task list hierarchy | PASS (source) | Phase E hierarchy and capacity calculations untouched |
| Today — Start / Stop / Complete / expand / drag | BLOCKED | Existing handlers untouched; requires interactive browser check |
| Today — active mark static, no infinite pulse | PASS (source) | `.task-card-active-dot { animation: none }` in Phase D |
| Today — reduced-motion transitions off | PASS (source) | Phase D reduced-motion selector covers progress, pressure, pulse and capacity transitions |
| Today — Reality Check reachable and secondary by default | PASS (contract/source) | No Reality Check markup, hierarchy, or outcomes changed |
| Today — empty day and starter-task states usable | BLOCKED | Requires live state inspection |
| Jobs — compact header pulse and disclosed depth | PASS (contract/source) | Phase B mappings and Phase F CSS retained; runtime state not browser-tested |
| Jobs — mobile title/open glance/context line | PASS (contract/source) | Phase C contract and page/card implementation untouched |
| Jobs — desktop title/completion mark/evidence summary | PASS (contract/source) | Phase C contract and desktop card implementation untouched |
| Jobs — filters/search/create | BLOCKED | Logic untouched; interactive operation requires browser check |
| Jobs — detail route full evidence/next work | BLOCKED | Detail route not exercised in a browser |
| Meetings — title/time glance/open count; no state slab | PASS (contract/source) | Phase C contract and row implementation untouched |
| Meetings — pressure classes and non-colour cue | PASS (contract/source) | Phase A tokens and Phase C row grammar retained |
| Meetings — featured strip gating/object language | BLOCKED | CSS wrapper hooks exist; visual gating requires live state |
| Meetings — filter/search/date selected state | FIXED | Date-carousel selected selector did not match actual `aria-selected="true"` / `.surface-date-chip.is-active` markup; selector now covers both |
| Travel — title/date/stops glance and quiet delete | PASS (contract/source) | Phase C contract and handlers untouched |
| Travel — pressure classes and compact phase | PASS (contract/source) | Phase A/C contracts retained; visual state not browser-tested |
| Travel — featured strip consistency | BLOCKED | CSS hooks exist; visual comparison requires live state |
| Navigation — active tab weight + hairline | PASS (source) | Phase F active-tab selector retained |
| Navigation — locked Pro tabs visible/muted and billing route | PASS (source) | Existing SurfaceNav item definitions/routing unchanged |
| Navigation — keyboard focus on tabs, filters, search, back, primary actions | PASS (source) | Phase F focus selectors present; actual focus visibility is BLOCKED pending browser |
| Navigation — mobile back-to-Today orientation on Pro surfaces | PASS (source) | Existing surface back links/routing untouched; browser route test remains BLOCKED |
| Light/dark at ~390px and desktop | BLOCKED | Requires browser viewport and theme switching |
| Keyboard traversal and reduced-motion runtime behavior | BLOCKED | CSS coverage inspected; runtime behavior requires browser |
| Safe-area/clipping/overflow at mobile width | BLOCKED | Requires real viewport inspection |

## Defect closure

### G-01 — date-carousel selected state selector mismatch

- **Severity:** Medium (wayfinding/readability; date selection itself still worked).
- **Contract violated:** `docs/phase-f-wayfinding.md`, “Date carousel” — selected state must receive the shared selected-state treatment wherever the carousel exposes its selected state.
- **Root cause:** Phase F targeted `aria-current="date"`, `aria-pressed="true"`, `.selected`, and `.active`. The actual `components/SurfaceDateCarousel.tsx` renders tabs with `aria-selected={active}` and classes `surface-date-chip is-active`; neither actual selected-state hook matched.
- **Fix:** `app/phase-f-wayfinding.css` now includes `.surface-date-carousel [aria-selected='true']` and `.surface-date-carousel .surface-date-chip.is-active`, retaining the compatibility selectors for other variants. No selection behavior, component markup, or new design language added.

## Files changed

- `app/phase-f-wayfinding.css` — restore the Phase F selected-date visual contract using the actual rendered carousel hooks.
- `docs/phase-g-acceptance.md` — this checklist, defect record, verification boundary, and residuals.

## Residual known issues

1. **Medium — visual acceptance remains unverified:** light/dark, mobile (~390px), desktop, featured-strip appearance, contrast, truncation, and clipping need a real browser session. No evidence justifies a broader redesign.
2. **Low — interaction regression coverage remains unverified here:** Today drag/start/stop/complete, Jobs create/filter/search/detail, keyboard focus traversal, and reduced-motion runtime behavior need interactive browser checks. No related handlers were changed.
3. No other concrete A–F contract violation was established from the source inspection. Do not treat unverified visual states as confirmed passes.

## Final recommendation

**No further redesign recommended without user evidence.** Phase G is limited to acceptance recording and one concrete selector repair. Keep A–F as the source of truth; do not begin Phase H. Merge only after the PR build/tests are green. If manual browser acceptance finds a specific high-severity violation, make one narrowly scoped follow-up tied to its reproducible state and the relevant A–F contract.
