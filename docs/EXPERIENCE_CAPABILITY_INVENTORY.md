# Dokkit Capability-to-Experience Inventory

**Status:** Source-level inventory for reconstruction planning; not device acceptance  
**Baseline:** `main` at `3b79da3c0fd23c2749b9ffc01b162accfe6d0b5b`  
**Authority:** `MOBILE_REDESIGN_AUTHORITY.md`, `MOBILE_REDESIGN_CURRENT_STATE_AUDIT.md`, `MOBILE_REDESIGN_CONTINUATION_HANDOFF.md`, `WHOLE_DAY_MODEL.md`, and `LAYOUT_SYSTEM.md`  
**Purpose:** Unpack the current product into capabilities, authoritative engines/data, current entry points, intended user-facing home, and acceptance risks before rebuilding the presentation.

This inventory does not authorise feature additions, domain rewrites, or a UI redesign by itself. It is the Gate 0 bridge between the existing codebase and the replacement experience.

## 1. Product spine

The product is one system for time in context. The current primary web navigation is Today, Jobs, Meetings, and Travel, plus shared capture. The replacement should preserve these as four connected lenses unless discovery identifies a demonstrable product reason to change the primary navigation.

| Capability group | Existing authority / evidence | New experience home | Preservation boundary / acceptance question |
|---|---|---|---|
| Global capture | `components/CaptureSheet.tsx`, `lib/engine/captureDock.ts`, `lib/cpu/index.ts`, `lib/engine/interaction.ts`, deterministic speech modules | One contained composer available from relevant lenses, with originating context retained | Preserve parser, corrections, intent/context extraction, safe-action semantics, and draft. Multi-item review/execution is currently not wired end to end. |
| Tasks and subtasks | Today task actions, task detail sheet, existing task records/mutations | Canonical work object visible in Today and reachable from Jobs/Meetings/Travel context | Preserve identity, estimate, date/reminder, status, evidence, validation, persistence, and relationship semantics. Trace each mutation path separately. |
| Day/time model | Today page; `deriveActiveCommitments`, `deriveTodayCapacity`; shared date carousel | Today integrator plus connected day/week calendar lens | Preserve capacity maths, fixed-vs-flexible distinction, timezone/date behavior, and direct distant-date navigation. |
| Flexible work fit | Existing task-fit/planning intelligence and Today ordering/suggestions | Quiet next-work/fit cues within Today and contextual object detail | Preserve engine authority and user override. Do not turn inference into an alert-heavy dashboard. |
| Fixed commitments | Manual meetings and external calendar events in Today/capacity | Chronological time representation shared across lenses | Ensure event intervals are counted once; preserve overlap and untimed-event rules. |
| Reality Check | `RealityCheckSheet`; Done / Partial / Carry / Skip outcomes and actual-duration learning | Contextual close/adjust action on work in Today and relevant object views | Preserve evidence semantics and learning. No guilt, score, or streak mechanics. |
| Jobs | Jobs list/detail routes and existing job/task relationships | Durable work context; same canonical job linked from all relevant lenses | Preserve status, related tasks, evidence/history, access/entitlement behavior, and originating context on return. |
| Meetings | `app/meetings/page.tsx`, meeting detail route, `components/MeetingSheets.tsx`, media and export flows | People/conversation context linked to time, work, actions and evidence | Preserve notes, people, observations, decisions, actions, media, exports and job relationships; maintain accessible modal/export lifecycles. |
| Travel, trips and stops | Travel surface, trip/stop sheets, route/duration logic | Place/movement lens linked to Today, Jobs, and Meetings | Preserve trip/stop/date/location semantics, travel duration and capacity effect, route ordering, and focus/accessibility behavior. |
| External calendar | Microsoft OAuth/callback, calendar listing/selection/sync routes, `lib/calendar/store.ts`, `lib/calendar/sync.ts` | Settings/connection home plus connected events in the time lens | Integration UI has been hidden behind a feature flag in source history. Live OAuth, selection, first sync, capacity reflection and recovery remain acceptance requirements. |
| Relationships and context | Task/job/meeting/travel relationships; entity resolution and unified-input modules | Context layer on canonical objects, with explicit cross-lens transitions | Preserve IDs and data relationships. No duplicate surface-specific objects; return to exact date/filter/search/scroll/open/expanded state. |
| Reminders and dates | Existing deterministic capture interpretation and task scheduling | Visible when actionable on object and time lens | Preserve per-item dates and corrections in multi-item capture; test timezones and dates around boundaries. |
| Evidence, files and media | Existing job evidence, meeting media, task-related context | Focused object detail and contextual tools | Preserve file/media ownership, authorization and export behavior; do not crowd the first-paint view. |
| Patterns / learning | Existing duration calibration and learning behavior; Patterns surface where enabled | Secondary explanatory view, on demand | Explain useful learned behavior without turning it into analytics-first or exposing internal implementation machinery. |
| Account, settings, billing, entitlements | Existing auth, Preferences/Settings routes, Pro gates, billing | Secondary utility destinations in predictable global access | Preserve authorization, subscription, account and access behavior. Reorganise presentation only. |
| Persistence and offline recovery | Supabase mutations, local-first task updates, durable queue, local cache | Shared truthful pending/saved/failed/retry interaction states | Existing mutation paths are mixed. Test each path; never clear drafts or imply remote save before confirmed success. |
| Navigation state | `components/SurfaceNav.tsx`, surface state restoration hooks/tests, relationship navigation tests | One stable navigation spine with contextual object routing | Existing tests cover some route/state snapshots, not the complete user journey. Verify exact state restoration end to end. |
| Accessibility and overlays | `hooks/useDialogA11y.ts`, sheets, popovers, `PillReveal`, meeting photo/export overlays | Shared overlay and keyboard/focus grammar | Preserve modal/non-modal distinctions. Physical-device, screen-reader, text-scale, keyboard, reduced-motion and WCAG acceptance remain open. |
| Themes and presentation | CSS variables, theme tokens, `app/surface-system.css`, `docs/CSS_CASCADE_AUDIT.md` | A replacement design system with explicit ownership | Legacy CSS has substantial `!important` debt. Do not layer more overrides or delete broad selector sets without traced ownership and visual verification. |
| Native Android | Separate Kotlin/Jetpack Compose project; distribution path not conclusively established | Later parity implementation after web acceptance | Do not use it as the first design authority or build in parallel. Confirm release artifact/distribution before native work. |

## 2. User journey map

| Journey | Start | Existing capabilities touched | Required result | Known status |
|---|---|---|---|---|
| Capture one item | Any relevant lens → Capture | Deterministic interpretation, task creation, date/context, persistence | Correct canonical item, truthful save state, safe recovery | Existing path present; test regressions while wiring batch support |
| Capture a day dump | Today → Capture | Speech and typed interpretation, multi-act proposals, dates/reminders/context, task mutations | Ordered reviewable proposals, per-item outcomes, retry without loss/duplication | **Confirmed end-to-end gap** |
| Understand the day | Today | Calendar/manual commitments, travel duration, capacity, fit, tasks | Selected date, fixed commitments, available time and relevant flexible work understood quickly | Calculations exist; comprehension not user-validated |
| Follow a relationship | Task → Job/Meeting/Travel → return | Canonical object routing, linked context, saved surface state | No duplicate object; exact originating state restored | Focused route/state tests exist; full journey not proven |
| Reshape an overloaded day | Today → adjust flexible work | Scheduling, capacity, fixed/flexible semantics, related objects | Consequences clear before acceptance; no silent cascades | Requires adversarial end-to-end interaction validation |
| Connect calendar | Settings → Microsoft authorisation → choose calendars → sync | OAuth, selected calendars, event sync, capacity | Clear connection/sync status and recovery; selected events affect capacity according to existing rules | Live OAuth/first-sync acceptance outstanding |
| Handle interruption | Capture/edit → background/offline/failure → resume | Draft state, persistence, local queue, retry | Draft preserved, status truthful, no duplicate on retry | Several fixes exist; full path remains open |
| Close work and learn | Task → Reality Check | Done/Partial/Carry/Skip, actual duration, learning | Record outcome without guilt and preserve evidence | Existing behavior must be regression-tested |
| Manage meeting context | Meetings → meeting detail | People, notes, decisions, actions, media, export, job links | Focused details and accessible export/media workflows | Existing capability; consistency and accessibility need acceptance |
| Manage travel context | Travel → trip/stop detail | Stops, route/time, linked job/meeting, capacity | Movement is understandable as part of the same day | Existing capability; shared grammar and journey need acceptance |
| Configure account/product | Settings/Preferences | Auth, billing, entitlements, calendar connection, export/support | All existing utilities remain discoverable without competing with primary work | Inventory each destination before moving controls |

## 3. Current structure that should not be mistaken for target architecture

- `SurfaceNav` is a useful current navigation spine, not a reason to preserve all current page composition.
- `CaptureSheet` and task/meeting/travel sheets are current entry points, not necessarily the final component boundaries.
- Today currently integrates many real engines and projections. It must remain the integrator, but its present visual stacking is not sacred.
- The 14-day date strip is a nearby-date control, not the whole calendar model.
- Existing Jobs/Meetings/Travel screens and their Pro gating are current behavior to preserve unless an explicit product decision changes it; they are not proof that the current information architecture is ideal.
- The current stylesheet cascade is implementation history, not design architecture.
- The native project is a later parity target, not the reference for the web rebuild.

## 4. Gaps to resolve before visual implementation

### P0 — core journey blockers
1. Wire deterministic multi-item proposals through review, batch execution, and typed/speech parity.
2. Define per-item success/failure state and safe retry/idempotency behavior.
3. Add a genuine page-level integration test for Today → multi-item capture → edit → relationship navigation → exact return state → controlled save failure → recovery.
4. Confirm current main, open PRs, and both Vercel check statuses before touching capture source.

### P1 — architecture / user experience evidence
1. Capture current production screenshots/recording at narrow mobile widths, normal and enlarged text, light/dark, keyboard open, and system safe areas.
2. Complete the component/screen inventory for Jobs, Meetings, Travel, Settings, account, billing, export, and Patterns, recording actions and states—not just filenames.
3. Observe the day comprehension and navigation journeys; keep aesthetic opinion separate from reproducible usability defects.
4. Map every current capability to a single owning destination plus contextual routes. No capability may be lost because it is secondary.
5. Verify actual installed Android artifact/distribution only to inform later parity; do not delay web-first work on unconfirmed native assumptions.

### P2 — release acceptance
1. Live Microsoft OAuth/first sync, calendar selection and capacity reflection.
2. Persistence/offline recovery for each mutation family, not only task creation.
3. WCAG 2.2 AA checks on the actual shipped web/mobile environment.
4. Responsive, theme, zoom, focus, keyboard, reduced-motion and screen-reader validation.
5. Remove legacy CSS ownership conflicts incrementally after the new primitives and surface composition are proven.

## 5. Inventory rule

Every capability must have:
- one authoritative engine/data owner;
- one clear primary home;
- contextual entry points where useful;
- one canonical object identity;
- a defined success, pending, error, retry and return-state behavior where applicable;
- regression tests for preserved behavior;
- a discoverable path that does not require exposing all complexity at once.

**The rebuild should simplify the user's experience without simplifying away the underlying capability.**
