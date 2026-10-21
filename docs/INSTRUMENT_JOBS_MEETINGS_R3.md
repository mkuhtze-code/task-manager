# Dokkit Experience R3 — Jobs + Meetings composition

## First-paint structure
Both mobile work lenses follow Identity → Instrument pulse → one primary → existing stream. Jobs remains the durable work ledger; Meetings remains the conversation tape. Components are presentational and receive selectors and callbacks from their overview pages.

## First-paint audit (R3.1)
- Jobs identity: Jobs / Work / Field.
- Jobs pulse: active-today count, else existing open count, else Clear; secondary line preserves spotlight job, attention count, or completed count.
- Jobs primary: New job, rendered only when canJobs is true. Existing Pro redirect remains authoritative.
- Jobs noise demoted: gear is separated from the orient region; filters and date carousel remain secondary below it. Empty state has no second create action.
- Meetings identity: Meetings / People / Time.
- Meetings pulse: live count, else today count, else upcoming + flexible count, else Clear; existing pulseMeta and pulseAttention remain supplied by the surface model.
- Meetings primary: Record, rendered only when canMeetings is true. Existing Pro redirect remains authoritative.
- Meetings noise demoted: gear is separated from the orient region; date carousel, featured glance and filters remain below it. Empty state has no second Record action.

## Pulse field ↔ selector map
| UI field | Existing source |
|---|---|
| Jobs active | activeTodayCount in app/jobs/page.tsx |
| Jobs open | openCount from sorted and isJobDone |
| Jobs attention | attentionCount from the existing open-task loop |
| Jobs complete | doneCount = sorted.length - openCount |
| Jobs focus | spotlightJobName from the existing active-today loop |
| Meetings live | surface.live.length from buildMeetingsSurfaceModel |
| Meetings today | surface.today.length |
| Meetings ahead | surface.upcoming.length + surface.flexible.length |
| Meetings meta / attention | surface.pulseMeta / surface.pulseAttention |

No new aggregation, fetch, domain mutation, or engine behavior was introduced.

## Primary and entitlement policy
- Mobile primary verbs are New job and Record.
- Primary components receive canCreate={canJobs} and canRecord={canMeetings}; they render no action when the corresponding entitlement is false.
- Existing useProRedirect calls, targets, and entitlement hooks are unchanged.
- Desktop primary registration remains New job and Record, with existing entitlement guards.

## Stream and accessibility
Existing job ObjectRow adapters, meeting row adapters, routes, IDs, client/location/next-work context, meeting time/action/source context, and delete/action ownership are unchanged. New CSS is loaded separately and all selectors are scoped to [data-instrument-shell]. It uses --ins-* tokens and visible focus treatment; primary and gear controls meet the 44px minimum target.

## Residuals
- Job and meeting detail pages have not migrated to DepthSheet.
- Travel composition remains R4 and is not part of this change.
- SystemDock visuals remain as-is.
- Device-level mobile viewport, dark-mode and assistive-technology review requires manual acceptance; CI remains the source of truth for tests, typecheck and build.

**Do not start R4 in this change. STOPPED after R3.**
