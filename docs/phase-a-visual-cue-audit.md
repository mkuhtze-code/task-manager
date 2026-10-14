# Phase A — visual cue audit

Scope: inventory of the current shared surface system and Today TaskCard collapsed face. This is a presentation contract, not a product-flow change. String inventory below covers strings rendered by the audited components; user-authored task/job/meeting/trip names and dynamic timestamps are data, not fixed UI copy.

## String decisions

| Surface / component | Current visible string or string family | Decision | Contract |
|---|---|---|---|
| Surface header: `.surface-kicker` | Surface identity kicker (dynamic) | keep as primary | Identity/context, not state |
| Surface header: `.surface-title` | Surface title (Today / Jobs / Meetings / Travel) | keep as primary | Preserve navigation and identity |
| Surface header: `.surface-lede` | Explanatory section lede (dynamic) | keep as secondary | Not a collapsed-row state signal; no global removal in Phase A |
| Surface pulse: `.surface-pulse-title` | Pulse state title (dynamic) | demote to secondary/expand-only | State should be reinforced by a mark/weight in later header work; structure unchanged here |
| Surface pulse: `.surface-pulse-meta` | Pulse detail/count text (dynamic) | keep as secondary | Supporting context only |
| Surface context: `.surface-context-bit` | Context statement and emphasized values | keep as secondary | Relationship/context, not state |
| Today: `TaskCard` / `.task-text` | Task title | keep as primary | Primary task identity |
| Today: `TaskCard` / `.task-card-intended-time` | Scheduled clock time | keep as primary | Compact visual glance |
| Today: `TaskCard` / `.task-card-context` | Job and place labels | keep as secondary | Useful context; no fit-status prose |
| Today: `TaskCard` / `.task-card-glance` | Remaining time, elapsed time, subtask count | keep as primary | Numeric glance; title identifies the measure |
| Today: `TaskCard` / `.task-card-active-dot` | No visible text; running indicator | replace with visual cue | Active mark uses `--state-active`; accessible row label says “Timer running” |
| Today: `TaskCard` expanded facts | “Job”, “Place”, “Scheduled”, “Due”, “Today”, “In the day”, “Usually”, “logged”, “estimate”, “left”, “over estimate”, “steps”, “Start”, “Stop”, “Done”, “Details” | keep as primary | Expanded facts/actions remain intact; Reality Check and action behavior unchanged |
| Today: fit labels in `TaskCard` | “Protected”, “Fits well”, “Fits”, “Likely later”, “Can move”, “Uncertain”, “Not enough evidence”, “Blocked” | demote to secondary/expand-only | Not rendered as collapsed primary copy; expanded “In the day” fact remains and collapsed row exposes label through title/accessible label |
| Today: `TaskCard` complete control | “Complete {task}” | keep as primary | Accessible action name; behavior unchanged |
| Jobs: `.job-row-name`, `.desk-job-card-name` | Job title (dynamic) | keep as primary | Full row anatomy deferred to Phase C |
| Jobs: `.job-row-meta`, `.desk-job-card-state`, `.job-row-next` | Job status / next-step text (dynamic) | keep as secondary | Existing presentation preserved |
| Meetings: `.meeting-row-name`, featured title | Meeting title (dynamic) | keep as primary | Full row anatomy deferred to Phase C |
| Meetings: `.meeting-row-time`, `.meeting-row-context`, `.meeting-row-state` | Time, context, state text (dynamic) | keep as secondary | Pressure tokens may be applied by existing pressure classes |
| Travel: `.trip-row-name`, featured title | Trip title (dynamic) | keep as primary | Full row anatomy deferred to Phase C |
| Travel: `.trip-row-time`, `.trip-row-context`, `.trip-row-state` | Time, context, state text (dynamic) | keep as secondary | Pressure tokens may be applied by existing pressure classes |
| Jobs / Meetings / Travel row actions | Delete, open/detail action labels (component-defined) | keep as primary | Existing actions and accessibility preserved |

## Canonical class/token contract

- Pressure: `.pressure-now` → `--pressure-now`; `.pressure-soon` → `--pressure-soon`; `.pressure-later` → `--pressure-later`; `.pressure-past` → `--pressure-past`.
- Today fit: `.fit-ok` → `--fit-ok`; `.fit-later` → `--fit-tight`; `.fit-uncertain` → `--fit-uncertain`; `.fit-blocked` → `--fit-blocked`; `.fit-protect` → `--fit-protect`. Overtime uses `--fit-over`.
- Live state: `.task-card-active-dot` → `--state-active`; row accessible label announces “Timer running”.
- Progress: `.task-card-progress` / `.task-progress-track` use `--progress-track`; their fill classes use `--progress-fill`; overtime fill uses `--fit-over`.
- Token values are semantic aliases to existing theme tokens. Dark mode overrides them through the existing `[data-theme="dark"]` mechanism.
- Pressure cues combine border position/weight (past is dashed) with tokenized colour; fit cues combine rail width/style and tokenized colour. Colour is not the only signal.

## Verification and explicit boundaries

- TaskCard completion, expand/collapse, Start/Stop, and expanded facts are unchanged.
- No data loading, entitlement, routing, Reality Check, navigation, or capture logic changes.
- Jobs/Meetings/Travel row structure is untouched. Existing parallel pressure classes inherit the shared pressure token layer.
- Before/after screenshots were not captured in this automated repository edit; visual confirmation remains a manual check in light and dark themes.
- Phase B header structure, Phase C row anatomy, Phase D motion, and Phase E work are not included.
