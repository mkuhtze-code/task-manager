# Dokkit Experience R2 — Today composition

## First-paint structure
Today is composed as **Identity → Instrument → Primary → flexible task stream**. The Today instrument names the day, displays the existing remaining/free capacity signal, and presents one primary **Capture** action. The task stream follows below it. Empty Today retains the same instrument and uses the existing `todayEmptyCopy(userProfile)` text.

## Data sources
- Date identity: `TodayPage` derives `weekdayLabel` and `dateOnlyLabel` from its existing `now` snapshot.
- Remaining/free signal: `deriveTodayCapacity` from `lib/today/dayCapacity.ts` supplies `minutesLeftToday`, commitments and day state. `remainingWorkMins` remains the existing composed requirement value, including existing route/travel allocation.
- Travel composition: `resolveTodayTravelWindow`, `computeTravelPresenceImpact`, `composeTravelCapacity`, and `todayTravelRegimeLabel` remain authoritative.
- Regime: rendered only when Today has `travelTodayContext` and a non-null `travelRegimeLabel`; links to `/travel/{tripId}`.
- Capture: `setCaptureOpen(true)` opens the existing `CaptureSheet`; desktop action remains registered through `registerCaptureOpen`.

No fetches or domain calculations live in `TodayInstrument`. It formats supplied values only.

## What changed / demoted
- The orient region has one Capture primary; the persistent dock Add action is suppressed on Today to avoid a second Capture path, and the empty-list duplicate Add CTA is removed.
- Reality Check remains secondary/depth and is not presented as an equal primary.
- The flexible task list remains the existing `TodayTaskList` / `TodayTaskRows` mutation surface. Existing completion, timer, fit accessibility, drag, IDs and offline mutation paths are retained.
- New Today chrome is scoped to `--ins-*` tokens and `[data-instrument-shell]`.

## Residuals
- Fixed commitments remain summarized through existing capacity values; no separate fixed band or aggregation was introduced.
- `TaskDetailSheet` remains unchanged; no full migration to `DepthSheet`.
- Multi-act capture review remains out of scope.
- Existing dock visuals and desktop Today detail controls remain outside this composition pass.
- Automated source/contract tests do not replace device-level viewport, dark-mode, keyboard and assistive-technology acceptance.

## Next
R3: Jobs and Meetings composition. Do not begin R3 as part of this change.
