# Dokkit Experience U1 — Orient contract

## First-paint structure

Each lens opens in the same order: **Identity → Instrument → one primary action → content**. Identity names the lens; the instrument is a compact state/count signal derived from existing domain selectors; the primary is the established action. Filters, search, gear/tools, and depth remain secondary. Empty states retain the same orient region and use one short explanatory subline at most.

## Lens contracts

- **Today** — existing Today header/day-capacity instrument remains authoritative: remaining work/capacity and overload are computed by the existing Today helpers. The existing S6 travel regime line remains conditional on active trip context and links to the trip. Primary is the existing Capture/Dock it path; Reality Check remains depth/secondary. No capacity or travel calculations changed.
- **Jobs** — existing `activeTodayCount`, `openCount`, `attentionCount`, and completion counts drive the shared identity pulse. Primary is **New job**, gated by the existing `canJobs` entitlement condition. On mobile the action sits in the first-paint header; desktop continues to use its registered header action.
- **Meetings** — existing meeting-surface live/today/upcoming/flexible selectors drive the pulse. Primary is **Record**, gated by the existing `canMeetings` entitlement condition. Mobile and desktop use the same verb; the desktop registered action remains entitlement-gated.
- **Travel** — no product redesign. The overview's existing pulse/Plan trip action and the trip detail's day-first `TripDayPanel` remain the reference.

## First-paint audit (source-level)

- **Today:** identity/date and capacity timeline/instrument are already in `TodayHeaderBridge`; the conditional S6 travel regime link follows it. The task list starts after this context. No new controls or aggregates added.
- **Jobs mobile:** identity/pulse and gear were present; the first-paint primary was missing, while the empty state had a second create button. Added the entitlement-gated **New job** header action and removed the duplicate empty-state action. Existing filters/date carousel remain below the header. Desktop already had **New job**.
- **Meetings mobile:** identity/pulse and gear were present; the primary was only available deeper in the empty state/list flow. Added the entitlement-gated **Record** header action, removed the duplicate empty-state action, and shortened empty copy. Desktop registered action label now matches **Record**; its entitlement condition is unchanged.
- **Travel:** not changed by U1.

## Non-goals

No U2 row grammar, U3 multi-act capture review, U4 return-state audit, or U5 device-wide visual acceptance. No navigation reorder, new lens, new engine, data aggregation, capacity math, learning, capture semantics, travel windows, offline queue, or confirmation-flow changes. No broad CSS cleanup.

## Validation notes

This pass is source-level and narrow. CI/typecheck/build and visual first-viewport acceptance must be confirmed from the PR checks and production mobile-web review before merge. Manual mobile/desktop visual acceptance has not been performed by this change.
