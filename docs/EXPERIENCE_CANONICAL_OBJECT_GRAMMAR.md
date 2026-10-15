# Experience reconstruction — canonical object grammar

**Status:** Task, Jobs overview, and Meetings overview objects implemented; Travel and live acceptance pending  
**Scope:** Responsive web at `/app`. Native Android and desktop adaptation remain deferred until mobile-web acceptance.

## Purpose

Every task, job, meeting, trip, and relevant commitment should retain one identity as the user moves between Today, Jobs, Meetings, and Travel. This document establishes the first concrete presentation contract using the existing task object. It does not create a new domain model.

## Object contract

A canonical object exposes the following stable landmarks:

1. **Identity** — the object's primary name, never replaced by a surface-specific duplicate.
2. **Summary** — the collapsed, glanceable representation.
3. **Context** — only the relationships and metadata that help explain the object in the current lens.
4. **Glance** — one concise temporal/progress read when the object has one.
5. **Detail** — progressive disclosure for supporting facts, notes, subtasks, and richer context.
6. **Actions** — existing primary and secondary operations, kept attached to the owning object.
7. **State** — a semantic state that is not communicated by colour alone.

For the task implementation these are exposed through `data-experience-object="task"`, `data-object-state`, `data-expanded`, and `data-experience-part` landmarks in `components/TaskCard.tsx`. The attributes are presentation hooks, not persisted state or engine inputs.

## Current slice

- Introduces a mobile-only task-object composition: quieter row separation, consistent summary hit-area geometry, a predictable indented detail region, and accessible action sizing.
- Uses the existing TaskCard and TaskDetailSheet behaviour; the canonical object continues to use the existing task ID and mutation callbacks.
- Leaves task ordering, fit classification, estimates, timer semantics, subtasks, job/location relationships, persistence, and completion logic unchanged.
- Loads object styles after the replacement mobile frame so ownership is explicit; does not add `!important` overrides or alter desktop styling.
- Adds a targeted regression test and includes it in build and CI chains.

## Jobs overview slice

- The Jobs overview now marks the existing job link as the canonical job object, with stable identity, open/complete state, client/location context, next-work glance, evidence summary, and empty state landmarks.
- The existing job ID and `/jobs/{id}` destination remain unchanged. The job's open/complete status continues to derive from its existing task collection; no new persisted job status is introduced.
- Mobile styling aligns job objects with the task-row grammar without changing desktop composition, job sorting, filtering, evidence aggregation, entitlements, or data fetching.
- A focused regression suite verifies identity/state/context, next-work glance, canonical route, and complete/empty states. It is included in build and CI.


## Meetings overview slice

- The existing meeting link is now rendered through a focused canonical meeting object, with stable meeting ID, semantic temporal state, conversation identity, time/action glance, source, and job/location context landmarks.
- The existing `meetings` row remains authoritative. The `/meetings/{id}` route, Outlook source marker, linked job route, open-action count, date/filter/search behavior, and existing meeting detail flows are preserved.
- Mobile-only styling aligns the meeting row with the task and job object grammar without changing desktop composition, scheduling, meeting actions, decisions, observations, participants, or persistence.
- Focused regression tests cover identity, state, time/action glance, source, relationship context, and canonical route. The suite runs in the build and CI chains.

## Boundaries

This is not yet a shared component rewrite across all entity types. Do not mechanically apply task-specific markup or state semantics to jobs, meetings, or trips. Their next migrations should implement the same contract using their existing authoritative records and actions.

Do not silently cascade changes to related objects. Cross-lens navigation must preserve canonical IDs and originating context, and returning must restore the prior date/filter/search/scroll/open state where supported.

## Acceptance

### Source/CI

- Task object exposes stable identity/state/summary/detail landmarks.
- Expand and complete actions still call the existing callbacks.
- Build, typecheck, regression suites, CSS cascade audit, and both Vercel projects pass.

### Still requiring browser/device observation

- Compare the new task row and detail at 320–360 px and common mobile widths.
- Check dark theme, enlarged text, on-screen keyboard, keyboard-only use, touch targets, and reduced motion.
- Confirm active, overdue/over-estimate, due, uncertain-fit, empty-note, and multi-subtask states remain understandable.
- Validate a real task-to-job relationship and return-state restoration through the live app.

Green CI is necessary but does not constitute visual or WCAG 2.2 AA acceptance.
