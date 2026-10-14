# Phase C — shared object grammar

Scope: collapsed list-object presentation for Jobs (mobile and desktop), Meetings, and Travel. The Today TaskCard is the reference contract; it is not rewritten here.

## Canonical collapsed anatomy

- **Primary:** object title.
- **One glance:** short, tabular/mono count or time/date window aligned beside the title where the surface permits.
- **State:** existing Phase A pressure classes remain on Meetings and Travel; border position/weight plus existing semantic token keeps pressure from relying on hue alone. Jobs use a completion mark or an explicit open-task count.
- **Context:** client, job, place, day count, and Outlook provenance are faint secondary context.
- **Long facts:** next task is a single truncated mono line; evidence/activity is a single compact mono summary. Full detail remains available through existing detail routes.
- **Accessibility:** row links announce the object title and state/count; Outlook provenance and relative time remain available through a label/title when visually demoted.

## Per-surface decisions

### Jobs — mobile

- Kept the job title and the existing completion mark.
- Changed the right-side count from total tasks to **open tasks**, with a textual “open” label and accessible count.
- Combined client, today count, and location into one compact, non-wrapping secondary context line.
- Kept next task as one truncated mono line without the previous top-border slab. The task remains available in the job detail.

### Jobs — desktop cards

- Kept job title, client identity, completion mark, and existing detail link.
- Replaced the separate open/done/today status essay with one open-task count in the card head (completed jobs retain the check mark).
- Combined evidence and activity counts into one truncated mono summary, e.g. `3 files · 2 photos · 1 meeting · 2 site days`. No evidence/activity data or query was removed.
- Kept next task as one truncated mono line. Full evidence and job details remain accessible through `/jobs/[id]`.

### Meetings

- Kept meeting title and existing pressure class.
- Moved the meeting window to the right-side mono glance; appended open-action count to that same glance when nonzero.
- Removed the competing bordered “N open actions” / “Captured” state slab. The state remains in the accessible row name; relative timing remains in the glance's title.
- Kept job/place context and a faint Outlook source label.

### Travel

- Kept trip title and existing pressure class.
- Moved date range and optional stop count into one right-side mono glance.
- Removed the bordered phase/state slab. Phase and relative timing remain available via the row's accessible name/title.
- Kept duration as secondary context. Delete remains a separate, quiet edge control with its existing handler and accessible name.

## Shared CSS alignment

- Reused Phase A semantic pressure tokens/classes and existing shared object title/meta variables.
- Normalized title/glance alignment and made secondary context and mono summaries truncate rather than grow into essays.
- Removed the visual state slabs from the collapsed markup instead of layering new overrides over them.
- No new `!important` declarations were added in Phase C.

## Explicit non-goals

- No Phase D motion/immersion work.
- No SurfaceNav, primary navigation, or header/pulse changes.
- No TaskCard rewrite or Today cockpit changes.
- No data loading, sorting, filtering, entitlements, routing targets, API calls, create/delete behavior, or Reality Check/capture changes.
- No Android/native row work.

## Manual sanity still required

Verify Jobs mobile, Meetings mobile, Travel mobile, and desktop Jobs grid in both light and dark themes. Automated repository edits cannot substitute for a visual check of actual content density and truncation.
