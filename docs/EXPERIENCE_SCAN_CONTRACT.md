# Dokkit Experience U2 — Scan contract

## Authority and scope

This contract implements the Scan step in **Open → Orient → Scan → Act → Depth → Return**. It builds on [the U1 Orient contract](./EXPERIENCE_ORIENT_CONTRACT.md) and [the canonical object grammar](./EXPERIENCE_CANONICAL_OBJECT_GRAMMAR.md). The shared mobile presentation source is `app/experience-objects.css`; object sheets may own only composition and domain-specific content.

Scope is the collapsed mobile-web list rows for Today, Jobs, Meetings, and Travel overview. Existing detail sheets and expanded regions retain ownership of depth.

## Normative collapsed anatomy

| Object | Identity | Glance | Optional context | State landmark | Attached actions / destination |
|---|---|---|---|---|---|
| Today task | Task text | Remaining estimate, elapsed time while running, or subtask count; scheduled time remains visible when set | One job/location line when present | `data-object-state`, active timer cue, existing accessible fit/over-cap description | Complete, expand, timer start/stop, and detail affordance stay on the task |
| Job | Job name | Open-task/today count and next-work text when present | Client/location, limited to one collapsed line | `data-object-state`; readable open count or complete marker | Existing link to `/jobs/{id}` |
| Meeting | Conversation identity | Time/action count/temporal cue supplied by existing row | Source and job/location context where present; context stays secondary | `data-object-state` plus existing time/live/today text | Existing link to `/meetings/{id}` |
| Trip | Trip name | Date range and stop count supplied by existing row | Relative phase/day context, one collapsed line | `data-object-state` plus existing phase/pressure text | Existing link to `/travel/{id}`; delete remains a sibling control outside the link |

### Shared rules

- Identity uses the primary object name, not a lens-specific duplicate.
- Glance is concise and domain-native; it must not become instructional copy.
- Context is optional, faint, and limited to one line in the collapsed frame. Empty context is omitted.
- State must remain understandable from text/landmarks as well as any restrained colour cue. The `data-object-state` attribute is a semantic hook, not persisted domain state.
- Keep row actions on their owning object. Preserve minimum touch targets and visible keyboard focus.
- Collapsed rows are scan surfaces. Rich notes, evidence, and secondary facts remain in the existing expanded/detail surface. A job's next-work line is a concise work glance, not an additional metadata wall.
- Shared title, glance, context, focus, and responsive type rhythm belong in `app/experience-objects.css`. Surface sheets may set placement and genuinely domain-specific composition only.
- No changes to entity IDs, route targets, mutation handlers, entitlements, search, filters, sort/order, counts, timer/completion behaviour, fit/capacity calculations, trip date windows, Find place, offline queue, or return-state keys.

## Audit notes

- **Today:** TaskCard already exposes identity, summary, glance, state, completion, expand, timer, and detail hooks. Fit remains available to assistive technology/title/detail rather than being expanded into row prose.
- **Jobs:** the row exposes the job name, open/complete state, existing count/today glance, optional client/location, and next-work glance. Context/evidence are visually constrained to one line in the mobile frame.
- **Meetings:** existing row remains the authority for identity, time/action glance, source, and relationship context; shared hierarchy is applied without changing row data or navigation.
- **Travel overview:** existing trip row retains date/stop and phase information. Delete stays outside the navigation link. Trip-day stop rows and trip detail are not redesigned here.
- **Legacy cascade:** canonical frame typography and context remain owned by the shared object sheet; legacy CSS is not bulk-deleted and no new `!important` overrides are introduced.

## Explicit non-goals

U2 does not implement U3 multi-act capture review, U4 return-state programme, or U5 full-device visual acceptance. No swipe actions, bulk selection, new sort modes, new list features, desktop-only redesign, engine work, trip detail IA, vault, or Maps work is included.

## Acceptance status and residuals

Source-level contract and regression assertions are included. Automated checks must pass in CI before merge. A passing build is not a substitute for phone-level visual/accessibility acceptance across narrow widths, text scaling, dark mode, reduced motion, keyboard focus, and assistive technology; that remains U5 debt.
