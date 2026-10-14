# Dokkit Mobile Redesign Authority

**Status:** Proposed product and implementation contract  
**Scope:** Mobile-first experience redesign; documentation only  
**Base audited:** `ce9cd02554ee6d6c279feb8a864b98cbab96fcd0`  
**Implementation rule:** No product UI, business logic, schema, or feature changes are authorised by this document alone.

## 1. Product decision

Dokkit is one connected personal thinking and work environment, not a collection of mini-apps and not a chatbot. The redesign repackages the existing capability set into a calmer, more legible experience. It does not add product features.

Mobile is the primary design target and source of truth. Desktop work is a later, separate design effort. Shared domain logic and components may be reused where that improves consistency, but desktop layout conventions must not dictate mobile interaction.

The only possible scope exception is completing the already-existing calendar integration end to end. That is completion of an existing capability, not permission to build a new calendar product.

### Non-negotiable constraints

- Preserve the deterministic, proprietary capture and interpretation engine. Do not introduce LLMs, external AI APIs, or chatbot framing.
- Preserve existing planning, capacity, learning, estimates, task evidence, and Reality Check semantics unless a traced defect proves a change necessary.
- Do not silently cascade schedule or relationship changes. Explain consequences and let the user decide.
- No guilt mechanics, streaks, confetti, karma, forced rituals, or feature expansion.
- No large decorative orange or orange/blue bands, obstructive fixed banners, or unnecessary panels.
- Accessibility is part of the design contract from the first prototype, not a later remediation pass.
- Do not claim parity or acceptance based on source inspection alone; verify on real mobile devices.

## 2. Evidence and audit status

This document records a source-level audit. It is not a claim that the current app passes the proposed acceptance criteria.

### Confirmed in source

- The web app's primary surface navigation is Today, Jobs, Meetings, and Travel, with a shared Add/capture entry point.
- The date carousel is a short rolling range, not a full date-navigation system.
- Calendar UI is hidden behind `CALENDAR_CONNECT_ENABLED = false` in `app/preferences/page.tsx`, while calendar API, store, sync, selection, and Today-capacity integration code exist.
- Capture passes through `CaptureSheet.tsx`, `lib/engine/captureDock.ts`, and the CPU/interaction engine. Capture is a core system capability and must not be replaced during visual redesign.
- Today combines tasks with commitments, external calendar events, travel duration, capacity derivation, and Reality Check learning. Treat these as connected existing behavior, not isolated widgets to rewrite casually.
- The web experience has a documented legacy CSS cascade risk. `docs/CSS_CASCADE_AUDIT.md` describes its count ceilings as guardrails, not an acceptable final state.
- The repository also contains a separate native Kotlin/Jetpack Compose Android client. Its README explicitly describes it as a native app, not a WebView wrapper; it currently documents Today → Jobs → Travel navigation, with Jobs a placeholder and Travel largely read-only.

### Unresolved release-path question

Repository documentation establishes that a native Android project exists, but does not establish which Android artifact users currently receive. Historical product context also describes a Capacitor shell. Before deciding which client is the primary shipped surface, verify the current Play Store/release artifact, package/build pipeline, and production install path. Do not infer the answer from repository presence.

### Required evidence before visual implementation

1. Record current production behavior for each core journey below on the shipped mobile client.
2. Verify the actual Android delivery path and the scope of web/native parity.
3. Capture screenshots/video of real devices at normal and enlarged text settings, in light and dark themes, with keyboard open and system insets visible.
4. Run an accessibility baseline: screen reader, focus order and restoration, touch target sizes, text scaling/reflow, reduced motion, contrast, non-colour state cues, and actionable errors.
5. Trace calendar connect → authorise → choose calendars → sync → capacity reflection → reconnect/recovery, not just the presence of API routes.
6. Trace capture/edit/save failure and offline recovery, including whether a draft survives interruption and whether success is shown only after persistence is confirmed.

## 3. Experience architecture

### One environment, several perspectives

Today, Jobs, Meetings, and Travel are connected perspectives on the same work and personal context. They are not separate products with independent interaction rules.

- **Today** answers: what day am I looking at, what is fixed, how much usable time remains, and what work fits next?
- **Jobs** answers: what is happening with this body of work, and which tasks, meetings, travel, notes, and evidence belong to it?
- **Meetings** answers: what was discussed, what decisions/actions resulted, and what work context is connected?
- **Travel** answers: where and when am I going, what stops and work are associated, and how does travel affect the day?
- **Calendar/time** is a connected time lens and source of fixed commitments, not automatically a fifth primary destination.
- **Patterns/learning** explains useful learned behavior on demand; it must not become a dashboard that competes with doing the work.
- **Settings, account, billing, support, and exports** remain predictably accessible secondary destinations.

This is a semantic architecture, not a mandate to put everything on one screen.

### Global mobile shell

- Compact persistent primary navigation with clear labels and stable meaning.
- A consistent, contained floating capture composer available across relevant perspectives.
- System-safe-area and keyboard-aware layout; no fixed chrome may cover content or primary actions.
- Contextual navigation that shows where an object belongs and supports a reliable return path.
- Secondary utility destinations are accessible without becoming a second competing primary navigation system.

The exact placement of navigation and capture must be validated in the mobile prototype against reachability, keyboard behavior, and small-screen content—not decided from desktop composition.

### Shared object grammar

Every core object should communicate, when relevant:

1. **Identity** — what it is, using text or a recognisable, consistent glyph.
2. **State** — open, done, carried, upcoming, active, failed, or other meaningful domain state.
3. **Time** — date/time or duration when meaningful.
4. **Context/relationships** — job, meeting, trip, location, or linked work when useful.
5. **Next action** — the obvious safe action, without displaying every possible action at once.

Colour may reinforce meaning but must never be the only carrier of meaning. Labels should be visible where they prevent ambiguity; secondary labels and explanations can be available on demand.

Use a consistent interaction grammar, not one giant universal component. Task, job, meeting, and trip detail can differ where their domain behavior differs, while sharing predictable editing, state, relationship, action, and return conventions.

### Opening Today

Today begins with a compact day overview and a balanced work area—not a large header, a wall of cards, or an empty-looking dashboard.

The first glance should reveal:
- selected date;
- fixed commitments in chronological order;
- available/committed capacity in a compact, understandable form;
- the most relevant flexible work;
- conflicts or important constraints only when they affect a decision.

An optional timeline can show more detail. Nearby dates should be easy to swipe through; a calendar control should support distant jumps. Day/week are the primary working views; month is principally for navigation.

Fixed commitments remain time-ordered. Flexible work may be intelligently suggested, but users can override ordering. When the day is overloaded, Dokkit may suggest options; the user decides. A mismatch indicator is quiet until details or a decision are needed.

### Density and progressive disclosure

Density is adaptive but predictable. It may respond to screen size, current context, and user preference under stable rules. Users can override it.

- Group related items and expand when needed.
- Collapsed rows stay concise and scannable.
- Quick edits happen inline when safe and simple.
- Complex work opens a focused detail experience.
- Relationships appear when relevant; the complete relationship network is available on demand.
- Opening a related object must not lose the originating date, scroll position, filters, or expansion state.

### Capture and recovery

Capture is a primary product interaction, not a separate workflow that forces users to change mental modes.

- One consistent entry point across perspectives, with the active context supplied where appropriate.
- Support a single item and a multi-item brain dump, including corrections, reminders, dates, and context.
- Keep the current deterministic interpretation and safe action semantics.
- Successful single-item capture may return to the originating context; multi-item capture must allow review of the resulting items before the user considers the dump complete.
- On failure, preserve the full draft and offer explicit retry, edit, or discard.
- Never clear a draft merely because a request was sent. Clear only after the success condition is confirmed.
- Do not imply an item was saved if persistence failed or remains pending.
- Keyboard opening, app switching, interruptions, and returning to the composer must not destroy text.

The exact review/commit mechanics must be established by tracing the current engine contract and testing real capture examples before any UI is changed.

### Time, calendar, and capacity

The existing planning model remains authoritative. The redesign makes its results understandable rather than replacing the calculations.

- Fixed commitments, selected external calendar events, travel time, and flexible tasks should be understandable in one connected time model.
- External calendar selection and sync health need a discoverable home.
- The user must be able to tell whether a calendar is connected, which calendars are selected, whether sync is healthy, and what to do when it is not.
- Calendar events must affect capacity only according to existing planning rules; test the end-to-end behavior.
- Moving work should explain material consequences. Related changes are proposed, never silently applied.
- Preserve Reality Check outcomes (Done / Partial / Carry), actual duration, and learning evidence without guilt-oriented feedback.

## 4. Canonical mobile journeys

These journeys are acceptance requirements for the redesign, not new features.

### A. Capture a whole day

From Today, the user speaks or types several items, corrects a date/time, includes a reminder and an item for another day, reviews what was interpreted, and commits. Verify each item and its context, recoverable draft behavior, and no duplicate creation on retry.

### B. Understand the day

Within five seconds, the user can identify the selected date, fixed commitments, available capacity, and representative flexible work. The interface distinguishes fixed events from suggestions without relying on colour alone.

### C. Follow context and return

From a task, open its job or related meeting; inspect relevant context; return to the exact previous date, scroll position, filters, and expanded state.

### D. Reshape an overloaded day

Move a flexible task using touch and an accessible non-drag alternative. Understand the impact before accepting it. Fixed commitments remain intact; related changes require explicit approval.

### E. Connect calendar

Start authorisation, return from the provider, choose calendars, observe sync state, verify selected events appear in the relevant time/capacity model, and recover from expired credentials or failed sync. Do not declare this journey complete until each step is verified.

### F. Handle interruption or failure

Capture text, background or switch apps, resume, and verify the draft. Repeat with offline mode, failed save, and retry. No false success, silent loss, or accidental duplicate.

### G. Close the day and learn

Record Done / Partial / Carry and actual duration. The resulting feedback should be useful, quiet, and non-punitive.

### H. Move between perspectives

Find a job, meeting, or trip; open its canonical object; inspect linked work; return without losing the prior working context.

### I. Accessibility

Complete the same key journeys with screen reader, keyboard/external keyboard where applicable, enlarged text, reduced motion, and high-contrast/forced-colour settings where supported.

## 5. Visual direction

The visual system should feel precise, calm, competent, and quietly adaptive. It should be visually self-explanatory without becoming verbose.

- Restrained use of brand colour; neutral surfaces carry most of the interface.
- No full-width decorative orange or orange/blue colour bands.
- Strong hierarchy through typography, spacing, alignment, shape, and meaningful state cues—not piles of bordered panels.
- Hybrid flat rows and purposeful containers; containers exist to communicate grouping or interaction, not to decorate.
- Contextual top edge rather than a permanently oversized header.
- Consistent hybrid icon language: recognisable glyph plus label when needed; labels available on demand for unfamiliar controls.
- Empty states are open and calm, with a restrained graphic and a short label/action.
- Motion is subtle, state-driven, functional, and respects reduced-motion settings.
- Light and dark themes must share the same semantic hierarchy and contrast intent.
- No content clipping, header/banner overlap, keyboard obstruction, or floating controls that cover work.

## 6. Accessibility and responsive contract

Target WCAG 2.2 AA and verify on the shipped mobile environment.

- Minimum target sizes and spacing meet WCAG 2.2 AA target-size requirements or documented exceptions.
- Visible focus, sensible focus order, and focus restoration after sheets/dialogs/navigation.
- Screen-reader names and state announcements for custom controls.
- Text scaling and reflow without loss of content or action access.
- Contrast compliance for text, controls, borders, and focus indicators.
- Non-colour cues for state, urgency, completion, and calendar/commitment type.
- Drag/drop always has an accessible alternative.
- Reduced-motion preference is honored.
- Sheets and overlays respect device safe areas, system bars, keyboard, and back navigation.
- Errors state what happened and provide a clear next action.

## 7. Existing capability preservation boundaries

| Capability | Redesign boundary |
|---|---|
| Deterministic capture / speech / interpretation | Preserve engine, parser, working memory, correction semantics, and safe action rules. Change UI only after behavior is traced. |
| Tasks, subtasks, estimates, scheduling, reminders | Preserve data and mutation semantics; unify presentation and editing patterns. |
| Jobs and evidence | Preserve existing relationships, status, evidence, history, and access rules. |
| Meetings and media | Preserve notes, people, decisions, actions, recordings/media, and job relationships. |
| Travel and route context | Preserve trip/day/stop/date/location logic and capacity effects. |
| Calendar | Complete and verify existing integration; do not replace its model with a new calendar feature. |
| Reality Check and learning | Preserve outcomes and evidence semantics; improve explanation and interaction. |
| Authentication, entitlements, account, billing | Preserve authorization and billing behavior; reorganize presentation only. |
| Offline queues and persistence | Audit and close demonstrable recovery defects; do not mask failure with optimistic UI. |
| Native client | Establish actual shipped scope first; apply shared product semantics using native-appropriate controls. |

## 8. Implementation sequence and gates

No UI implementation should begin until Gate 0 is satisfied.

### Gate 0 — Evidence baseline

- Confirm shipped Android artifact/path.
- Record the current mobile screenshots and the nine canonical journeys.
- Trace capture mutations, draft lifecycle, offline queue behavior, calendar OAuth and sync recovery.
- Record accessibility and responsive defects with reproduction steps.
- Separate observed defects from aesthetic preferences and unverified assumptions.

**Exit:** A reproducible current-state baseline exists. No architecture is inferred from an unverified release path.

### Gate 1 — Mobile information and interaction model

- Map all existing capabilities to the four perspectives, global capture, time lens, and secondary utility destinations.
- Define canonical object states, relationship entry/return behavior, quick-edit vs focused-detail rules, and save/error states.
- Define navigation-state restoration explicitly.
- Resolve contradictions between current web behavior and native scope without adding features.

**Exit:** Every existing capability has a clear home and a defined route into and back out of it.

### Gate 2 — Working slice prototype

Prototype a real vertical slice in the current app, not a static mockup alone:
1. open Today and understand the day;
2. capture a multi-item dump;
3. inspect/edit an item;
4. follow a job/meeting relationship;
5. return to the exact prior state;
6. experience a deliberate save failure and recover.

This first slice is to prove visual clarity and connectedness. Do not expand into a broad component rewrite before this slice validates the model.

**Exit:** First-time and returning users can understand the experience without coaching; failures are recoverable; no capability logic has been changed unintentionally.

### Gate 3 — Core mobile surfaces

Rebuild the presentation incrementally across Jobs, Meetings, and Travel using the validated object grammar. Preserve existing domain behavior. Audit the CSS cascade and computed states instead of stacking more overrides.

### Gate 4 — Calendar completion

Unhide and validate the existing integration only after its full journey is proven. Verify authorization, selection, sync status/recovery, and capacity consumption. If the current implementation fails, scope the smallest corrective change separately.

### Gate 5 — Accessibility, reliability, and release acceptance

Run journey tests, accessibility checks, real-device viewport/text/theme tests, offline/failure tests, and regression tests against the existing engine. Desktop-specific redesign is explicitly out of scope for these gates.

## 9. Acceptance criteria

Acceptance is evidence-based. The following are proposed gates, not claims of current success.

- **Five-second comprehension:** at least 4 of 5 representative users identify date, fixed commitments, capacity, and a representative next-work item without coaching. Treat this as qualitative evidence, not a statistically conclusive study.
- **Connectedness:** users can follow a task to its relevant context and return without hunting or losing place.
- **Capture integrity:** single- and multi-item capture preserve corrections and context; failed capture retains the draft; retry does not create duplicates.
- **Time integrity:** fixed commitments remain fixed; capacity reflects verified selected calendar events and travel rules; suggested changes are not silently applied.
- **State restoration:** date, scroll, filters, and expansion state restore exactly after contextual navigation.
- **Mobile integrity:** no clipping, overlap, inaccessible primary action, or keyboard/safe-area obstruction on supported target devices.
- **Accessibility:** the canonical journeys work with supported screen readers, enlarged text, visible focus, reduced motion, and non-colour cues; WCAG 2.2 AA issues are documented and closed.
- **Preservation:** deterministic engine, learning, capacity, permissions, and persistence behavior pass regression tests.
- **No scope drift:** no new features or new external AI dependencies are introduced.

## 10. Explicitly not authorised

- Building new product features or expanding the product's domain model.
- Replacing deterministic interpretation with a language model or external AI service.
- Rewriting capacity, learning, or capture logic for aesthetic convenience.
- Treating desktop as the source of truth for mobile.
- Declaring the native app, Capacitor shell, or web app to be the shipped Android client without release-path evidence.
- Broadly deleting legacy CSS overrides without computed-style and device verification.
- Starting a full-surface rewrite before the working slice passes its clarity and recovery gate.
- Claiming accessibility, visual convergence, or end-to-end calendar completion without test evidence.
