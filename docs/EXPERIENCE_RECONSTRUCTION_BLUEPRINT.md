# Dokkit Experience Reconstruction Blueprint

**Status:** Architecture proposal for review; documentation only  
**Baseline audited:** `main` at `3b79da3c0fd23c2749b9ffc01b162accfe6d0b5b` (2026-10-14)  
**Authority:** `MOBILE_REDESIGN_AUTHORITY.md`, `MOBILE_REDESIGN_CURRENT_STATE_AUDIT.md`, `MOBILE_REDESIGN_CONTINUATION_HANDOFF.md`, `WHOLE_DAY_MODEL.md`, and `LAYOUT_SYSTEM.md`  
**Scope:** Rebuild the application experience and its information architecture around existing capabilities. No feature expansion, engine rewrite, schema change, or UI implementation is authorised by this document alone.

## 1. Decision

Dokkit needs a **replacement experience architecture**, not another additive styling pass.

The existing application has accumulated overlapping presentation layers, surface-specific interaction patterns, and multiple generations of CSS. Improving individual pieces without first deciding how the whole experience fits together risks adding another layer to that accumulation.

The redesign must unpack the current experience into:
1. the underlying domain objects and deterministic engines that must remain authoritative;
2. the user journeys and decisions the interface must support;
3. the shared interaction and presentation system;
4. the four connected surface projections;
5. contextual tools and advanced capabilities;
6. persistence, error, accessibility, and recovery states.

The new experience should then be assembled from that model. Existing screens are evidence about current capabilities, not templates that the replacement must preserve.

## 2. Non-negotiable product constraints

- Dokkit remains one personal thinking and work environment, not a chatbot or a collection of mini-apps.
- Preserve deterministic capture/interpretation, planning, time/capacity, task-fit, Reality Check, duration calibration, context, relationships, and learning engines. No LLMs, external AI APIs, or chatbot framing.
- No new product features or domain expansion. Repackage, clarify, and repair existing capabilities only.
- Preserve existing data, permissions, entitlements, persistence, and business rules unless a traced defect requires a separately justified correction.
- No silent consequential cascades. Explain material effects and leave the decision with the user.
- Calm, precise, trustworthy, and low-friction. Avoid decorative panels, large orange or orange/blue bands, dense badge grids, obstructive fixed UI, and unnecessary explanatory prose.
- No streaks, confetti, karma, scores, forced rituals, or guilt-based mechanics.
- Accessibility target: WCAG 2.2 AA. Colour is never the sole carrier of state.
- Delivery order is fixed: responsive mobile web at `/app` first; native Android after web acceptance; desktop adaptation last.
- Do not claim visual, device, screen-reader, OAuth, or end-to-end acceptance from source inspection or green CI alone.

## 3. Core mental model

**One whole. Four lenses.**

Dokkit represents one person's time, work, commitments, movement, and the consequences between them. Today, Jobs, Meetings, and Travel are different views of that same reality.

The primary interaction concept is **time in context**. Existing objects remain authoritative, but the experience must make their temporal and relational meaning visible without forcing users to reconstruct it mentally.

| Lens | User's primary question | Emphasis |
|---|---|---|
| Today | What does my time look like, and what fits? | Whole-day overview, fixed commitments, available capacity, next work, carry/reality |
| Jobs | Where is my work going? | Durable work context, related tasks, meetings, evidence, site/time context |
| Meetings | What conversations occupy my time, and what follows from them? | People, context, decisions, actions, related jobs and travel |
| Travel | How does movement change the shape of my time? | Places, stops, routes, durations, and related jobs/meetings |

These lenses must remain distinct in emphasis without becoming four independent applications.

## 4. Target experience architecture

The application should be organised into five conceptual layers. These are experience boundaries, not a mandate to rewrite domain code.

### Layer 1 — App frame

Owns the global identity, stable primary navigation, theme, responsive safe areas, and one consistent entry to capture. The frame should be quiet and compact; it must not compete with the current object or cover content.

- Primary navigation remains Today / Jobs / Meetings / Travel unless evidence supports an explicit product decision to change it.
- Navigation identifies the current lens and preserves context when moving away and back.
- Shared Add/Capture remains available without becoming a second navigation system.
- Settings and secondary tools remain discoverable but subordinate.

### Layer 2 — Lens workspace

Each lens has one coherent workspace with the same structural grammar:
1. page identity and back/origin context when nested;
2. one context line or compact navigator when useful;
3. at most one quiet status line;
4. the primary object/list or day instrument;
5. one primary action;
6. secondary tools behind a predictable Tools/overflow affordance.

A lens changes what information is emphasised, not the product's basic interaction physics.

### Layer 3 — Canonical objects

Tasks, jobs, meetings, trips/stops, and relevant commitments keep their identity across lenses. A relationship should open the canonical object, not a surface-specific duplicate. Simple objects expand in place; complex objects open a focused detail view. The user should not need to learn a different edit/detail model on each surface.

Shared object grammar covers title, metadata, temporal state, urgency/importance, disclosure, primary action, and secondary tools. Surface-specific content can vary; geometry and interaction rules should not drift without reason.

### Layer 4 — Context and relationships

Context appears where it explains why an object matters to the user's time: date, duration, place, job, people, related actions, evidence, or connected commitments.

- Show the most useful relationship inline when it materially aids the current decision.
- Keep the full relationship network available on demand.
- Make cross-surface transitions explicit and reversible.
- Preserve object identity and originating context.
- Never silently apply a change to related tasks, schedules, or commitments.

### Layer 5 — Tools and advanced detail

Editing, export, delete, configuration, evidence, and other secondary operations live in predictable contextual tools or focused detail. They remain reachable within two taps from their owning surface where practical, but do not all compete for first-paint attention.

Capture follows progressive disclosure: essential input first, advanced fields after More options. Sheets use one title, one close control, focused content, and a clear primary action.

## 5. The four lenses as one system

### Today — the integrator

Today is the primary instrument and flexible workspace, not a stack of status cards or a dated task list.

The first view should let a person quickly understand:
- which day they are viewing;
- fixed commitments in temporal order;
- how much time is committed and available;
- what work is next or plausibly fits;
- whether an important mismatch needs attention.

Capacity remains compact. A timeline is optional rather than mandatory visual weight. Details and choices become more prominent when there is a meaningful mismatch. Existing capacity calculations, travel estimates, task ordering, Reality Check outcomes, and learning remain unchanged.

### Jobs — work over time

Jobs provides durable context for work spanning multiple days. It must expose the canonical job, its work, evidence, related meetings, and relevant movement without inventing a separate time system. From a job, users can understand what belongs to it and return to the day or originating context.

### Meetings — people and consequences

Meetings represents time commitments and the people/conversation context around them. Decisions, notes, actions, evidence, and job/travel relationships must remain accessible within the shared object and depth grammar. Meeting detail is not a separate archive product.

### Travel — movement through time and place

Travel represents movement that occupies or constrains time. Trips and stops connect to jobs, meetings, and Today. Location, duration, and sequence must explain their effect on the day while preserving existing routing/travel logic.

## 6. Calendar and time

The calendar is a **time lens**, not a fifth disconnected product area.

- Day and week are the primary temporal contexts; month supports orientation and navigation.
- Nearby dates support quick movement; distant dates require a direct date jump.
- Returning to Today is always obvious.
- Calendar commitments must reconcile with Today capacity exactly once.
- The existing Microsoft integration remains read-only and must be accepted end to end separately. A backend route or visible control alone is not proof of completion.
- Do not expand into a new calendar product or alter time/capacity mathematics as a design shortcut.

The existing 14-day strip and direct date navigation are navigation primitives, not the final definition of the calendar experience.

## 7. Capture as the universal entry point

Capture must work as a consistent, contained composer across surfaces and support a single item or a multi-item day dump. It should preserve the user's natural sequence, corrections, dates/reminders, and appropriate job/place context.

The source audit and handoff identify a concrete existing gap: deterministic interpretation can detect multiple acts, but the current capture execution path still performs one create/update action per submission; proposal review and batch execution are not wired end to end. This is a capability-wiring acceptance blocker, not permission to add a new AI service or trade-specific grammar.

Required capture contract:
1. Interpret the full input deterministically and produce ordered, reviewable item proposals where multiple actions are detected.
2. Preserve item-specific dates, reminders, corrections, and relationships.
3. Make the proposed actions clear before consequential execution where review is required.
4. Track per-item success and failure.
5. Preserve the original dump and unconfirmed items on failure.
6. Retry only failed/unconfirmed items; never duplicate already confirmed items.
7. Keep typed and speech capture behaviour aligned.
8. Present success appropriately for one item versus many.
9. Retain existing single-item behaviour as a regression case.

This is the first end-to-end acceptance blocker to close before declaring the working slice complete.

## 8. Navigation, state, and recovery

Navigation is contextual movement through one system, not switching between independent apps.

- Preserve date, filter, search, scroll, open-object, and expansion state when leaving and returning.
- Nested views have predictable Back → object → Tools behaviour.
- Cross-surface links open canonical objects and retain the origin context.
- Loading, empty, validation, pending-sync, failure, and success states use shared patterns.
- A failed operation must not discard the user's work or falsely imply success.
- A local queued change must be distinguishable from confirmed remote persistence when that distinction matters.
- Retrying must be safe and idempotent.
- Fixed navigation, sheets, and the virtual keyboard must never obscure the active content or its primary action.

The current source has meaningful local-first and durable-queue behavior, but the audit identifies mixed persistence paths and incomplete recovery evidence. Treat them as test targets; do not infer that one successful task-create path proves every mutation path.

## 9. Visual direction

The visual rebuild should communicate through hierarchy, typography, spacing, object structure, and state—not decorative chrome.

- **Quiet surface, strong object.**
- Use whitespace, restrained ink/paper surfaces, hairline dividers, consistent type rhythm, and purposeful containers only when they clarify grouping.
- Shared headers have one identity area, one context line, and one tools/actions zone.
- Shared rows use one title and metadata grammar, consistent spacing, neutral default surfaces, and concise state cues.
- Time has spatial meaning: now, next, later, carried, and complete should be understandable without a badge grid.
- Restrained brand colour supports hierarchy and action. No large orange or orange/blue bands.
- Functional motion is restrained, state-driven, and respects reduced motion.
- Density adapts predictably; users can override it.
- First-time and returning users should both understand the screen at a glance.
- Desktop widens the same hierarchy; it does not introduce a different product or a second toolbar language.

The current CSS/import stack contains multiple overlapping presentation generations. The rebuild should converge on an explicit token/primitive/component ownership model, then remove obsolete styling at the source layer in scoped, verified slices. Do not add another override layer or delete legacy rules in bulk without computed-style and visual evidence.

## 10. Current-state findings that shape the rebuild

Confirmed in the source audit and continuation handoff:

- The production reference is the responsive web application at `https://www.dokkit.space/app`; the installed Android distribution path is not confirmed.
- The app has a shared four-surface navigation component and meaningful relationships among tasks, jobs, meetings, travel, and Today.
- Today already integrates commitments, travel, capacity, Reality Check, and learning; these capabilities must be preserved.
- The current mobile date strip is 14 days with direct date jump and return-to-Today support.
- The calendar backend exists, but live Microsoft OAuth/first-sync acceptance remains outstanding.
- Task detail validation and save-recovery work has been improved, but open PRs/checks must be checked against current main before further action.
- State restoration and relationship-route tests exist, but they do not prove the full end-to-end journey.
- Multi-item capture remains a confirmed wiring gap.
- Physical-device, screen-reader, full WCAG, and visual acceptance remain open.
- Preview routes can return 404 due to repository/site routing. Green builds and source tests are evidence for code health, not visual acceptance.

## 11. Delivery plan

### Gate 0 — Baseline and current-state inventory

- Confirm current main SHA, open PRs, both Vercel projects, and build/test state.
- Inventory each surface's visible hierarchy, actions, states, route relationships, and owning components.
- Map existing capabilities/engines to the UI and identify duplicate representations, disconnected controls, and CSS ownership conflicts.
- Record unknowns as unknowns; do not claim device acceptance from source.
- Produce a capability-to-experience map before changing UI structure.

**Exit:** a reviewed map of what exists, what must be preserved, what is duplicated, and what user journey each capability serves.

### Gate 1 — Approve the replacement experience architecture

- Agree on the app frame, lens workspaces, canonical object model, context layer, tools/depth model, and return-state contract.
- Specify Today's first view and the connected calendar/time model.
- Define the shared visual/interaction grammar and the ownership boundaries for tokens, primitives, and surface composition.
- Map all current capabilities into the new architecture, including less-frequent settings and export paths.
- Produce low-fidelity whole-app flows and representative screen structures before high-fidelity styling.

**Exit:** no major screen is designed in isolation; all existing capabilities have an owner and a discoverable route.

### Gate 2 — Prove one real vertical slice

Use the actual responsive web application, not a static mockup alone:
1. open Today and understand the day;
2. capture a multi-item dump;
3. review/edit one item;
4. follow a job or meeting relationship;
5. return to the exact previous state;
6. force a controlled persistence failure;
7. recover without loss or duplication.

**Exit:** real page-level integration tests plus live browser/device evidence. Existing single-item capture and planning/capacity regressions pass.

### Gate 3 — Rebuild the web experience

- Implement the shared app frame and interaction primitives.
- Rebuild Today as the integrator.
- Bring Jobs, Meetings, and Travel into the same object, context, navigation, and recovery grammar.
- Integrate calendar/time as a lens.
- Remove obsolete presentation paths only after their replacement is verified.
- Keep each PR scoped to a coherent layer or journey, not a collection of unrelated CSS tweaks.

**Exit:** all canonical web journeys work, visual hierarchy is coherent, and existing capability regressions pass.

### Gate 4 — Acceptance

- Validate at representative narrow/mobile and desktop viewports, light/dark themes, enlarged text, keyboard open, and reduced motion.
- Test touch targets, focus, screen-reader naming/order, focus restoration, contrast, non-colour state, and zoom/reflow against WCAG 2.2 AA.
- Accept live Microsoft OAuth/first sync with a real test account.
- Run adversarial regressions for time zones, overlapping commitments, capture corrections, batch retries, persistence/offline paths, relationships, and return-state restoration.
- Record what was observed, what passed, and what remains unverified.

**Exit:** no release-critical known data-loss/duplication/obstruction defects; all unverified checks are explicit.

### Gate 5 — Native Android, then desktop

Only after web acceptance, bring the native Kotlin/Compose client to parity with the accepted experience. Then adapt the same product model for desktop widths. Neither is the reference implementation for the first web slice.

## 12. Definition of done

The reconstruction is complete only when:
- The four lenses read as one connected system.
- A user can identify the day, fixed commitments, capacity, and next work within a few seconds.
- The same object retains identity and context across lenses.
- Capture supports multi-item input with corrections, per-item recovery, and no loss/duplication.
- Return navigation restores the exact prior state.
- Existing engines, data, permissions, and capabilities are preserved.
- The interface is verified at real viewports and with assistive technology, not merely source-reviewed.
- Both Vercel project checks and release-critical live flows pass.
- No new feature scope or external AI dependency has crept into the rebuild.

## Governing principle

**Do not improve the accumulated interface one layer at a time. Unpack the experience, define how the whole fits together, then rebuild the presentation around the capabilities that already work.**
