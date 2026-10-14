# Dokkit Mobile Redesign — Current-State Source Audit

**Status:** Source-level audit; device-level validation still required  
**Purpose:** Complete the evidence pass before prototyping the mobile redesign  
**Scope:** Read-only analysis of existing behavior; no product changes authorised

## Executive finding

The production mobile route is the responsive web application served at `https://www.dokkit.space/app`. The production response returns the Next.js app shell and a web manifest. The Vercel account also contains a project named `task-manager-capacitor-test`. The repository contains a separate native Kotlin/Compose client and a GitHub release asset named `app-debug.apk` (16,180,879 bytes, published with release `v0.1.0` on 2026-08-21).

These facts do **not** conclusively establish which binary is currently installed on the user's phone or whether the old debug APK is still distributed. For redesign work, treat the mobile web UI at `/app` as the confirmed production experience; do not treat the native project as equivalent or as the shipped source of truth until its distribution channel is confirmed.

The source audit is useful for defining test cases, but it cannot establish actual visual quality, touch behavior, screen-reader usability, keyboard overlap, or persistence reliability on a physical device.

## 1. Release-path evidence

### Confirmed

- `www.dokkit.space` is attached to the `dokkit-site` Vercel project; its root app route is `/app`.
- Fetching `https://www.dokkit.space/app` returns HTTP 200 and a Next.js app shell with a web manifest at `/app/manifest.json`.
- The main application and a separate Vercel project named `task-manager-capacitor-test` both deploy from the `task-manager` repository.
- Current repository source contains `android/`, a standalone Kotlin/Jetpack Compose app with package `com.dokkit.app`; its README describes it as a native app, not a WebView.
- The GitHub release `v0.1.0` includes `app-debug.apk`. The repository workflow builds `assembleDebug` and attaches the debug APK to a tagged release.

### Not confirmed

- Whether the installed app currently on the user's phone is the Capacitor shell, the standalone native APK, or a browser/PWA install.
- Whether the GitHub debug APK is the artifact currently used or whether there is another distribution channel.
- Whether native app updates are delivered independently from the web app.

### Safe working assumption

Use the mobile web application at `/app` for the first working-slice redesign because it is the production application route and contains the existing product capabilities. Keep native parity as a separately verified delivery question; do not port the redesign into `android/` in parallel during the first slice.

## 2. Existing mobile shell and navigation

### Confirmed in source

- `components/SurfaceNav.tsx` defines four persistent mobile destinations: Today, Jobs, Meetings, and Travel, plus the shared Add action.
- Jobs, Meetings, and Travel are marked Pro destinations in the current web navigation; their behavior for free entitlements routes to billing.
- Today opens `CaptureSheet` from the shared “Dock it” action.
- `components/SurfaceDateCarousel.tsx` renders a 14-day strip (three days before the current date and ten after). It is a nearby-date control, not a distant-date navigation system.
- `TaskDetailSheet` is the task editing/detail surface; `RealityCheckSheet` is a separate sheet for Done, Partial, Carry, and Skip outcomes.

### Risks to validate on device

- Whether four persistent destinations plus the capture action remain legible and comfortably tappable at narrow widths and enlarged text.
- Whether opening the keyboard or a sheet obscures task content, bottom navigation, or the capture action.
- Whether the 14-day strip allows a user to reach dates outside the strip by any other discoverable path.
- Whether route changes preserve date, scroll, filters, and expanded-item state. Source inspection has not demonstrated exact restoration across navigation.
- Whether all sheets have consistent back, close, focus, and state-restoration behavior.

## 3. Capture and mutation trace

### Existing path

`components/today/TodayPage.tsx` owns the Today capture state and opens `components/CaptureSheet.tsx`. Capture passes through deterministic interpretation in `lib/engine/captureDock.ts` and the CPU/interaction engine. Engine-structured outcomes call `addTask` with structured overrides; task detail saves through the existing Today task actions.

### Confirmed safe behavior in source

- Capture validates the input and date/time estimate before inserting a task.
- Normal online task creation uses a locally generated task UUID and attempts a Supabase insert.
- For transient network errors during task creation, the code retains the same UUID and places the task in local storage/cache, which is intended to avoid duplicate creation if the request reached the server but its response was lost.
- A non-transient insert error returns before the capture fields are cleared.
- A failed engine-bound task update returns before the capture fields are cleared.
- The Today task mutation path has local-first patch/delete helpers and a durable sync queue for existing-task mutations.

### Risks requiring reproduction, not assumptions

- Offline new-task creation uses the local upsert path; verify exactly when and how it is queued and flushed after reconnection.
- Engine-bound refinement updates use a direct Supabase update. Verify the offline failure experience and that the draft remains editable/retryable.
- Confirm whether a transient create is shown as “saved locally” versus “saved remotely,” and whether retry/reconnect can ever create a duplicate.
- Confirm the multi-item dump lifecycle: whether each item is committed independently, how the remaining draft behaves after a partial failure, and whether users can review the interpretation before considering the dump complete.
- Current error handling includes browser alerts in some save-failure paths. Test whether these preserve context, are accessible, and give a useful next action on mobile.
- Confirm speech insertion, corrections, date changes, and app background/resume do not overwrite newer unsaved text.
- Trace subtasks, task completion, schedule changes, and related-context navigation separately; do not infer all mutation paths from the task-create path.

## 4. Calendar connection and time model

### Confirmed in source

- `app/preferences/page.tsx` sets `CALENDAR_CONNECT_ENABLED = false`, hiding the Microsoft Calendar connection UI.
- Backend routes exist for Microsoft OAuth connect and callback, listing/selecting calendars, and calendar sync.
- The connect route checks authentication, calendar entitlement, and rate limits, and generates an OAuth state cookie.
- The callback validates OAuth state, exchanges the code, stores a connection, and attempts to seed discovered calendars.
- Calendar selection is user-scoped in the API. The calendars response does not expose OAuth tokens.
- `lib/calendar/sync.ts` handles token refresh and external calendar event synchronization.
- Today uses external calendar events in the capacity projection.

### Consequence

The calendar backend is present, but the end-to-end user journey is not available from the current Preferences UI while the feature gate is false. Calendar cannot be marked complete based on route existence. Keep the connection journey outside the first visual slice; validate it as a separate completion gate after the core mobile interaction model is proven.

## 5. Time, capacity, and Reality Check preservation

- Today derives active commitments and capacity using `deriveActiveCommitments` and `deriveTodayCapacity`, with travel route calculations handled separately.
- Reality Check records Done / Partial / Carry / Skip outcomes and can feed actual-duration/learning behavior.
- Preserve these domain calculations and evidence semantics during the visual prototype. Test them as regressions rather than rewriting them to fit a new layout.
- The source audit does not establish whether current capacity messaging is understandable within five seconds; that requires user observation.

## 6. Accessibility and visual baseline

### What source inspection establishes

- Some sheets use the shared `useDialogA11y` hook.
- The design system includes light and dark theme tokens.
- The CSS cascade audit documents significant legacy `!important` debt and explicitly warns that the count ceilings are not end-state targets.

### What is not verified

No reliable physical-device screenshot/video baseline or comprehensive WCAG 2.2 AA test report was produced by this source audit. The following remain open:
- TalkBack/VoiceOver names, reading order, state changes, and sheet focus restoration.
- Android system font scaling and browser text zoom.
- Contrast, visible focus, non-colour status cues, and touch-target sizing.
- Reduced motion.
- Safe areas, system bars, keyboard resizing, landscape, and narrow viewport behavior.
- Real-device clipping, overlap, scroll trapping, and sheet dismissal behavior.

These must be tested against the installed client. Do not declare accessibility or visual convergence passed from static source alone.

## 7. First working slice: current-state test protocol

Use a test account and non-sensitive sample data. Capture screen recording and notes for each step.

1. **Baseline:** Open Today at a narrow mobile viewport; record date, commitments, capacity, task list, navigation, and capture affordance.
2. **Capture:** Enter a multi-item brain dump with one correction, one dated reminder, one job reference, and one location. Record every interpretation and saved item.
3. **Partial failure:** Simulate a network interruption during capture. Confirm the draft, pending state, retry behavior, and absence of duplicate tasks.
4. **Edit:** Open one created task, edit its title, estimate, date, and context, then save. Repeat with a failed save.
5. **Follow relationship:** Open its job or related meeting, inspect context, and return. Compare date, scroll, filters, and expansion state with the baseline.
6. **Interruption:** Background the app with unsaved text, resume, and verify the exact draft.
7. **Accessibility:** Repeat key actions with TalkBack, enlarged system text, and reduced motion.
8. **Theme/layout:** Repeat at default and enlarged text in light/dark themes with the keyboard open and system insets visible.

Do not use production data or intentionally corrupt real user records to force failures. Use a controlled test account/environment.

## 8. Gate decision

**Source-level audit: substantially complete. Device-level Gate 0: not complete.**

The first prototype should target the production web UI at `/app`, preserving the existing deterministic engine and time/capacity logic. Before changing its UI, the remaining required evidence is the installed Android delivery path plus actual-device recordings of the protocol above. If physical-device access is unavailable to the implementation agent, collect those recordings from the owner/tester rather than pretending a source review substitutes for them.

No application code was changed as part of this audit.
