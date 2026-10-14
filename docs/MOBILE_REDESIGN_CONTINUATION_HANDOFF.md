# Dokkit Web-First Redesign — Continuation Handoff

**Purpose:** Durable continuation record for a new ChatGPT conversation. Read this document together with `docs/MOBILE_REDESIGN_AUTHORITY.md` and `docs/MOBILE_REDESIGN_CURRENT_STATE_AUDIT.md` before proposing or changing redesign work.

**Current baseline:** `main` at `8addb07314c4424dce427536ecd21ca84b5d1b22` (2026-10-14). Repository: `mkuhtze-code/task-manager`.

## 1. Product and delivery order

Dokkit is a personal thinking/work tool that learns how the user works. It is not an AI chatbot. Preserve the deterministic capture, interpretation, planning, capacity, Reality Check, duration calibration, context, relationships, and learning engines. Do not introduce LLMs, ChatGPT/Claude/Whisper Flow dependencies, or external AI APIs.

**Delivery order is mandatory:**
1. Responsive mobile web app at `https://www.dokkit.space/app` — finish and accept this first.
2. Native Android — rebuild/redesign it to match the accepted web experience later.
3. Desktop — last, with the same product identity and capability model; not a separate or superior product.

The user currently uses the web app and has not adopted the native Android app. The user cannot reliably preview branch builds because the Task Manager repository is routed through the Dokkit site repository and previews can return 404. Use Vercel/GitHub checks and source/test evidence; commit in small reviewed slices, but never claim visual/device acceptance without actually observing it.

## 2. Hard scope constraints

- No new product features. Repackage, clarify, and repair existing capability only.
- One continuous environment: Today, Jobs, Meetings, Travel, calendar/time, tasks, and related context are connected perspectives, not disconnected mini-apps.
- Today is the primary instrument and a flexible workspace.
- Mobile-first, touch-first, accessible from the start. WCAG 2.2 AA is the target.
- Calm, precise, quiet, trustworthy, competent. Less is more; do not show information merely because it exists.
- Restrained brand colour. Do not reintroduce large orange or orange/blue bands, Windows-like blocks, decorative panels, or fixed UI that obstructs content. Colour must not be the sole carrier of meaning.
- No guilt/gamification: no streaks, confetti, karma, tiers, or forced rituals.
- Do not replace deterministic intelligence with LLMs, casually rewrite the capture/planning/learning engines for visual reasons, delete CSS overrides in bulk, silently cascade changes, or assume Android and web are equivalent.
- Keep errors quiet but explicit and actionable. Preserve user input and let users decide consequential changes.
- Respect ADHD/dyslexia-related cognitive load: minimal unnecessary prose, strong hierarchy, clear labels where meaning is not obvious.
- Keep existing business logic/data/security boundaries intact. Audit before changing a shared behavior.

## 3. Agreed interaction and visual model

- Compact day overview at the top of Today; capacity shown compactly, with optional timeline.
- Fixed commitments appear in time order; flexible work is intelligently suggested and remains user-overridable.
- Quiet indication of available vs committed time; details and options appear on meaningful mismatch.
- Consistent contained floating capture composer across surfaces. Supports one item or a multi-item/day-dump capture. Failed capture preserves the draft and offers retry/edit/discard.
- Successful capture presentation adapts to one item vs many.
- Items expand in place for simple work; complex work can open focused detail.
- Return navigation restores exact prior date, scroll position, filters, and expansion state.
- Compact persistent primary navigation and contextual transitions.
- Relationships appear when relevant; full relationship network is available on demand. Suggest related changes; never silently apply consequential cascades.
- Connected calendar is a time lens, not a separate destination. Day/week are primary; month supports navigation. Nearby dates can be swiped, distant dates require direct date jump.
- Adaptive density must remain predictable; users can override it.
- Hybrid visual grammar: clean rows plus purposeful containers, consistent glyphs, labels on demand, quiet persistent urgency/importance cues, restrained functional motion.
- First-time and returning users must both understand the screen at a glance.

## 4. Source-of-truth documents

- `docs/MOBILE_REDESIGN_AUTHORITY.md`: product decisions, journeys, gates, acceptance criteria, non-authorised work.
- `docs/MOBILE_REDESIGN_CURRENT_STATE_AUDIT.md`: evidence-based current-state/release-path audit; source-level only, not device validation.
- `docs/MOBILE_CALENDAR_JOURNEY_AUDIT.md`: calendar flow and remaining live OAuth acceptance.
- `docs/MOBILE_MODAL_ACCESSIBILITY_AUDIT.md`: modal/popover focus findings, source-level fixes, and remaining manual acceptance.
- `docs/CSS_CASCADE_AUDIT.md`: existing stylesheet complexity/guardrails.
- Older `docs/UX_IMPLEMENTATION_ROADMAP.md` is historical and must not override the redesign authority.

## 5. Completed redesign slices on main

Confirm the live PR/commit state before acting, but as of this handoff the following are merged:

- [PR #262](https://github.com/mkuhtze-code/task-manager/pull/262) — mobile redesign authority/specification.
- [PR #263](https://github.com/mkuhtze-code/task-manager/pull/263) — current-state mobile audit.
- [PR #264](https://github.com/mkuhtze-code/task-manager/pull/264) — web-first redesign delivery order.
- [PR #265](https://github.com/mkuhtze-code/task-manager/pull/265) — compact Today capacity and optional timeline prototype.
- [PR #266](https://github.com/mkuhtze-code/task-manager/pull/266) — direct date navigation in shared date carousel.
- [PR #267](https://github.com/mkuhtze-code/task-manager/pull/267) — preserve/retry capture after persistence failure.
- [PR #268](https://github.com/mkuhtze-code/task-manager/pull/268) — restore surface view state after navigation.
- [PR #269](https://github.com/mkuhtze-code/task-manager/pull/269) — contained floating mobile capture composer.
- [PR #270](https://github.com/mkuhtze-code/task-manager/pull/270) — contained floating mobile task-detail surface.
- [PR #271](https://github.com/mkuhtze-code/task-manager/pull/271) — immediate Microsoft calendar sync and sync-failure recovery.
- [PR #272](https://github.com/mkuhtze-code/task-manager/pull/272) — keyboard focus containment/restoration for modal sheets.
- [PR #274](https://github.com/mkuhtze-code/task-manager/pull/274) — fix shared focus management for conditionally mounted modal sheets; apply it to additional Travel and Meeting modals.
- [PR #276](https://github.com/mkuhtze-code/task-manager/pull/276) — accessible naming, initial focus, and Escape focus return for non-modal `PillReveal` popovers, without focus trapping.
- [PR #280](https://github.com/mkuhtze-code/task-manager/pull/280) — regression test for jumping to a distant date and returning to today.
- [PR #285](https://github.com/mkuhtze-code/task-manager/pull/285) — integration tests for Today capacity with timed calendar commitments and overlapping intervals.
- [PR #289](https://github.com/mkuhtze-code/task-manager/pull/289) — explicit dialog semantics and focus management for trip-stop editing/capture.
- [PR #292](https://github.com/mkuhtze-code/task-manager/pull/292) — preserve invalid task-detail drafts and block completion when validation fails.
- [PR #294](https://github.com/mkuhtze-code/task-manager/pull/294) — topmost-modal keyboard ownership, nested focus restoration, local popover Escape, and scoped photo navigation.
- [PR #298](https://github.com/mkuhtze-code/task-manager/pull/298) — capacity regression for untimed manual meetings without double-counting Outlook rows.
- [PR #299](https://github.com/mkuhtze-code/task-manager/pull/299) — distinct focus lifecycle for meeting export phases; generation is a non-dismissible, focus-managed modal with a status announcement.
- [PR #302](https://github.com/mkuhtze-code/task-manager/pull/302) — regression coverage for task-to-Job/Meeting link destinations and return-state snapshots including the open/expanded task.

Latest known main commit: `8addb07314c4424dce427536ecd21ca84b5d1b22`. The merged date, capacity, task-validation, modal-layering, and export-phase changes passed both Vercel checks for `task-manager` and `task-manager-capacitor-test`, with review checks passing. The Android-named Vercel project is not proof that the native Android app is being redesigned or accepted.

### Important validation boundaries

- PR #271 makes the existing Microsoft Calendar panel available to entitled users, forces an immediate first/selection sync, and adds authenticated, entitlement-gated, rate-limited manual retry. It remains read-only.
- **Live Microsoft OAuth/first-sync acceptance is still outstanding.** Preview deployments lack the Microsoft OAuth/cron environment configuration. A real test account must connect, confirm selected calendars, verify events affect Today capacity promptly, deselect/reselect a calendar, exercise recovery where possible, and disconnect. Do not claim this is end-to-end accepted until observed.
- PR #272 tests modal focus wrapping, Escape, focus restoration, and non-modal task detail behavior. This is not equivalent to full WCAG acceptance, screen-reader testing, or physical-device validation.
- Source audit confirms the mobile web app is served at `/app`; repository contains a separate Kotlin/Compose client and an old debug APK, but that does not prove which Android binary is currently distributed. Do not work on Android yet.

## 6. Important architecture and risk notes

- Capture path: `components/CaptureSheet.tsx` → `lib/engine/captureDock.ts` → deterministic CPU/interaction engine. Keep it deterministic and preserve drafts through errors.
- **Confirmed multi-item wiring gap:** the deterministic speech interpretation layer already emits `CREATE_MULTIPLE_TASKS` with per-act proposals, and `useCaptureSpeech` displays “N actions detected — review before Dock.” But `CaptureSheet` renders only the status message (no proposal list/confirmation) and its Dock path still runs one `processCpuInteraction` decision, producing one create/update action. Typed input also follows the one-action CPU path. Multi-act understanding exists; review, batch execution, and typed/speech parity are not wired through to task creation. The agreed dictaphone/day-dump requirement is therefore not yet satisfied end to end.
- Today combines tasks, meetings, external calendar events, route/travel duration, active commitments, capacity, Reality Check (Done/Partial/Carry), actual duration, and learning. Do not weaken the shared model for appearance.
- Calendar source areas include `app/api/auth/microsoft/connect/route.ts`, `app/api/auth/microsoft/callback/route.ts`, `app/api/calendar/calendars/route.ts`, `app/api/calendar/sync-now/route.ts`, `lib/calendar/store.ts`, `lib/calendar/sync.ts`, and `supabase/schema.sql`. Re-check names against main before edits.
- `components/SurfaceNav.tsx` defines Today/Jobs/Meetings/Travel; shared Add action. Some surfaces are Pro-gated.
- `components/SurfaceDateCarousel.tsx` has a 14-day nearby strip plus direct date input and Back to today.
- `hooks/useDialogA11y.ts` handles initial focus, Escape, modal focus containment, focus restoration, and topmost-modal keyboard ownership. `PillReveal` remains non-modal and closes locally on Escape; meeting photo arrow keys are scoped to its focused lightbox. Task detail's desktop pane must remain non-modal (uses `trapFocus: presentation === 'sheet'`).
- Interaction vocabulary is distributed among `TaskDetailSheet.tsx`, `RealityCheckSheet.tsx`, create/edit sheets for jobs/meetings/travel, and settings. Audit consistency instead of blindly unifying every implementation.
- CSS has legacy cascade complexity. `docs/CSS_CASCADE_AUDIT.md` recorded hundreds of `!important` rules in some legacy files. Treat counts as a warning/guardrail, not permission for a broad cleanup; inspect computed behavior and owning stylesheet before each scoped change.
- Offline/persistence behavior is mixed: web has local-first task mutation and a durable queue, with incomplete routing/conflict handling documented; native offline mutation gaps exist. Show pending/success/failure truthfully and preserve drafts.

## 7. Remaining sequence — continue in this order

### Immediate next task: close the existing multi-item capture gap

**This is a core capability wiring gap, not a request for unrelated new features.** The deterministic speech interpreter already detects multiple acts, but the capture UI/execution path does not show or execute the resulting proposals as a batch; typed input also follows a one-action path. The agreed product model requires one utterance to produce multiple independent tasks when the user gives a day dump, including distinct dates/reminders and corrections. The full working slice cannot yet be accepted.

1. Extend the existing deterministic capture/action contract so one utterance can produce an ordered batch of task mutations. Preserve universal language handling; do not add trade-specific grammar, an LLM, or an external AI dependency.
2. Add acceptance cases for: two or more independent tasks in one utterance; different dates/reminders per item; a correction such as “actually, move the first one to tomorrow”; job/place context on the appropriate item; and a single-item regression.
3. Define safe batch failure behavior before wiring it into Today: retain the whole original dump, track which items were confirmed, and retry only failed/unconfirmed items so successful tasks are neither lost nor duplicated. Keep user-visible failure feedback explicit.
4. PR #302 is merged and checks task-to-Job/Meeting link destinations and snapshots that include date/filter/search/scroll/open-task/expanded-task state. Those are useful component/hook contracts, not proof of the full journey.
5. After the batch contract exists, add one page-level integration test using real Today/Capture wiring (not a synthetic harness) for Today → multi-item capture → edit one item → follow Job/Meeting → return to exact state → controlled save failure → recovery without loss/duplication.
6. Branch previews can return 404 because the Task Manager app is routed through the Dokkit site project. Use green builds and focused source tests, but do not call that visual/device acceptance. The actual `/app` journey still needs a human visual/touch pass when a working deployment path is available.
7. Live Microsoft OAuth/first-sync acceptance remains outstanding and needs a real test account. Keep WCAG 2.2 AA and physical-device acceptance explicitly open until tested.
### Then continue the surfaces
- Bring Jobs, Meetings, and Travel into the shared object grammar and navigation/return-state model without making them feel like separate apps.
- Complete the calendar journey's live acceptance.
- Perform a full WCAG 2.2 AA pass: keyboard, focus, labels/names, contrast, touch targets, reflow/zoom, screen reader, reduced motion, and mobile virtual keyboard.
- Run adversarial regression tests for capture, dates/time zones, capacity, commitments, relationships, persistence/offline errors, and exact state restoration.
- Only after web acceptance: design native Android to match; only after that: desktop.

## 8. Definition of done

Do not call the redesign complete merely because CI is green. Required:
- At a glance, representative users can identify date, fixed commitments, capacity, and next work within five seconds (qualitative target; not a statistically powered claim).
- Multi-item capture preserves intent and draft on all failures; corrections and retry do not duplicate/loss items.
- Time and capacity remain consistent across task/calendar/meeting changes.
- Return navigation restores the exact state.
- Accessibility and responsive behavior are verified, not assumed.
- Existing intelligence and product capabilities are preserved; no new feature scope.
- Both Vercel projects/checks pass, and release-critical live flows are accepted.
- Any unverified visual/device/manual acceptance is explicitly called out.

## 9. First instruction for the next chat

Read this handoff and the three source-of-truth docs. Confirm the current `main` SHA and live PR/check status; do not assume this snapshot is still current. Resume with the **real mobile-web working-slice acceptance gap**, adding a genuine page-level integration test only where it proves actual app wiring, then continue the visual/accessibility acceptance. Keep the order web → native Android → desktop. Do not ask the user to restate the design decisions above.
