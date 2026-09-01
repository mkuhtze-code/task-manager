# Dokkit — Design System & Product Principles

> **Dokkit is a personal thinking tool that understands time.**  
> A digital sticky note, not a productivity scoreboard.
>
> **You don't need to do more. You need to know what fits.**

---

## 1. Purpose

Dokkit is designed to help a person understand **what they can realistically do with the time they have**.

It is not primarily a task database, project-management system, calendar, CRM, habit tracker, or productivity game.

Dokkit's job is to reduce mental friction.

The user should be able to:

- capture something quickly
- see what matters now
- understand how much time is available
- start working without planning an elaborate workflow
- move through the day without constantly reorganising it
- carry unfinished work forward without guilt
- understand where they need to be and what fits around it

Dokkit should feel like a **thinking surface**, not an administrative system.

---

# 2. Core Design Philosophy

## 2.1 Simplicity over completeness

Dokkit should not expose every possible piece of information merely because the system knows it.

Show the information that helps the user decide:

> **What should I do now?**

Everything else should remain secondary.

If a feature requires the user to maintain another layer of metadata before it becomes useful, question whether it belongs in Dokkit.

---

## 2.2 Time is the primary organising principle

Dokkit is fundamentally time-aware.

Tasks have a duration.

The system should help the user understand:

- how long something is expected to take
- how much time remains
- whether something fits today
- what can realistically be completed
- what needs to move

Time should be useful without becoming stressful.

Avoid productivity language such as:

- streaks
- scores
- points
- productivity percentages
- achievement systems
- leaderboards
- "you are behind"
- "you failed"
- "you only completed X%"

Dokkit is not a performance monitor.

---

## 2.3 No productivity guilt

Incomplete work is normal.

Dokkit should never make unfinished tasks feel like personal failure.

A task that moves to tomorrow is simply:

> **work that still exists.**

The interface should communicate this naturally.

Avoid:

- red failure states for ordinary unfinished tasks
- shame-oriented notifications
- aggressive reminders
- congratulatory gamification
- unnecessary urgency

---

# 3. Mental Model

Dokkit should be understood through three primary concepts:

## Tasks

Things the user needs or wants to do.

## Travel

Where the user needs to be and how movement affects the day.

## Endeavors

Larger areas of ongoing work or life that contain multiple tasks.

These concepts should remain lightweight.

The user should not need to construct a complicated hierarchy before using the product.

---

# 4. Primary Navigation

The primary navigation should remain intentionally small.

Current core navigation:

**Today | Jobs | Travel**

The navigation represents the user's most important contexts rather than a collection of every system feature.

Do not add navigation items casually.

Before adding another primary destination, ask:

1. Is it used frequently?
2. Does it represent a fundamentally different context?
3. Can the functionality live naturally inside an existing context?
4. Does adding it make Dokkit feel more like traditional productivity software?

If the answer to the last question is yes, reconsider it.

---

# 5. Today

## Purpose

Today is the primary Dokkit experience.

It answers:

> **What fits into my day?**

The user should not need to open multiple screens to understand their immediate situation.

Today should surface:

- current time/context
- available time
- relevant tasks
- task duration
- active task
- upcoming commitments where useful
- travel constraints where relevant

The interface should naturally prioritise what can be done **now**.

---

## Task ordering

Task ordering should favour usefulness over arbitrary priority systems.

Consider:

- current time
- estimated duration
- available time
- deadlines
- commitments
- location
- travel
- user intent
- task state

Do not require users to manually maintain a complicated priority matrix.

---

# 6. Tasks

A task should be understandable at a glance.

A basic task should be capable of existing with only:

- title
- estimated duration

Additional information should be optional.

Possible attributes include:

- time
- date
- location
- notes
- subtasks
- project/endeavor
- recurrence
- travel relationship

The system should progressively reveal complexity rather than requiring it at creation.

---

## Task creation

Creating a task should be fast.

The ideal interaction is approximately:

> "Call John — 15m"

rather than a form containing ten fields.

Do not make users answer questions they can answer later.

Capture first.

Refine later.

---

# 7. Task Duration

Duration is fundamental to Dokkit.

Users should be able to estimate a task using natural values:

- 5m
- 10m
- 15m
- 30m
- 1h
- 2h

The system should make duration easy to edit.

Avoid unnecessary precision.

A user generally does not need to distinguish between:

> 27 minutes

and

> 30 minutes.

The purpose is planning, not time-sheet accounting.

---

# 8. Start / Stop

Time tracking should exist to help the user understand their day.

It should not become a timesheet system unless explicitly required.

Starting a task means:

> **I'm doing this now.**

Stopping a task means:

> **I'm no longer doing this now.**

The interface should make these actions obvious and low-friction.

Avoid requiring confirmation dialogs for ordinary start/stop actions.

---

# 9. Carryover

Unfinished tasks should naturally carry forward.

The user should not have to recreate them.

Carryover should feel like:

> "This still needs doing."

Not:

> "You failed yesterday."

Preserve useful context while avoiding visual clutter from historical unfinished work.

---

# 10. Calendar

Calendar information is contextual.

It should help Dokkit understand the shape of the day.

It should not turn Dokkit into another calendar application.

Calendar events should primarily answer:

> **How much usable time do I actually have?**

rather than:

> **How many calendar entries do I have?**

---

# 11. Travel Mode

Travel is about **time + location**.

Travel should help answer:

> **Can these things realistically fit together?**

The system may consider:

- current location
- destination
- travel time
- departure time
- arrival time
- task duration
- commitments
- proximity

Travel should be practical rather than visually complicated.

When travel changes, Dokkit should be able to reconsider the day.

---

# 12. Endeavors

Endeavors represent larger ongoing areas.

Examples:

- Renovate house
- Build Dokkit
- Launch business
- Family trip

An endeavor should not become a traditional project-management hierarchy.

Avoid requiring:

- phases
- stages
- workflows
- status matrices
- percentage completion
- complex dependencies

The user should be able to attach tasks to an endeavor without managing the endeavor itself as a separate administrative project.

---

# 13. Visual Language

Dokkit should feel:

- simple
- calm
- tactile
- familiar
- slightly nostalgic
- modern without being sterile

The interface should feel closer to:

> **a really good digital sticky note**

than:

> **enterprise productivity software**

---

## Visual restraint

Avoid excessive:

- cards
- badges
- pills
- gradients
- shadows
- decorative illustrations
- animated counters
- dashboards
- progress rings
- data visualisations

Every visual element should earn its place.

---

# 14. Information Hierarchy

A Dokkit screen should generally have a clear hierarchy:

### Primary

What do I need to know right now?

### Secondary

What is coming next?

### Tertiary

What additional information might help?

Do not give tertiary information the same visual weight as primary information.

---

# 15. Interaction Design

Dokkit should favour direct manipulation.

Good interactions include:

- tap
- swipe
- drag
- start
- stop
- quick capture
- inline editing

Avoid unnecessary multi-step flows.

If something can be done in one interaction without ambiguity, don't turn it into three.

---

# 16. Mobile First

Dokkit is fundamentally a personal, mobile-accessible tool.

The mobile interface must remain excellent independently of desktop.

On Android/iOS:

- respect system safe areas
- never position UI underneath system navigation controls
- use platform-provided safe-area/window insets
- never rely on hard-coded system-bar heights
- ensure bottom navigation remains above gesture/navigation areas

For web layouts, use appropriate viewport and safe-area mechanisms.

For example:

`viewport-fit=cover`

and:

`env(safe-area-inset-bottom)`

where appropriate.

---

# 17. Edge-to-Edge Android Behaviour

The Android application uses a Capacitor WebView and may render edge-to-edge.

The web application must therefore account for Android system insets.

The bottom navigation:

**Today | Jobs | Travel**

must never be obscured by:

- gesture navigation
- three-button navigation
- Android system bars
- device-specific navigation areas

Do not solve this using arbitrary fixed padding such as:

`24px`

or:

`48px`

Use the platform-provided safe-area inset.

---

# 18. Responsive Behaviour

Dokkit should adapt to the available screen rather than maintaining separate conceptual interfaces for every device.

Priorities:

1. preserve usability
2. preserve hierarchy
3. preserve interaction simplicity
4. use available space intelligently

Do not simply scale the desktop UI down for mobile.

---

# 19. Animation

Animation should communicate state or provide tactile feedback.

Good uses:

- task starting
- task stopping
- navigation transitions
- subtle list movement
- contextual appearance/disappearance

Avoid:

- decorative animations
- constant movement
- gamified celebrations
- animations that delay interaction

The user should never have to wait for an animation to finish before continuing.

---

# 20. Notifications

Notifications should be useful and restrained.

Do not turn Dokkit into a notification engine.

A notification should exist because the user genuinely benefits from being interrupted.

Avoid:

> "You haven't completed your tasks!"

Prefer contextual information:

> "You have 20 minutes before your next commitment."

---

# 21. AI

Dokkit is **not positioned as an AI-powered productivity product**.

AI may eventually assist with specific functions where it provides genuine utility, but AI should not become the product identity.

Do not add AI simply because it is fashionable.

The user should never need to understand an AI system in order to use Dokkit.

---

# 22. Gamification

Dokkit is deliberately **not gamified**.

Do not introduce:

- points
- XP
- streaks
- badges
- levels
- leaderboards
- productivity scores
- achievement animations
- competitive metrics

The reward is simply:

> **knowing what fits.**

---

# 23. Empty States

Empty states should be useful and calm.

Avoid generic SaaS language such as:

> "Nothing here yet!"

Prefer contextual language that tells the user what they can do.

For example:

> "Your day is clear."

or:

> "Add something you need to remember."

Empty space is not automatically a problem.

---

# 24. Error States

Errors should explain what happened without technical jargon where possible.

Good:

> "Couldn't save that. We'll try again."

Bad:

> "Mutation failed: HTTP 500."

Technical details may be available to developers, but should not dominate the user experience.

---

# 25. Offline Behaviour

Dokkit should degrade gracefully when connectivity is unavailable.

A user should not lose the ability to interact with information simply because a connection temporarily disappears.

Where technically appropriate:

- preserve local state
- queue changes
- synchronise when connectivity returns
- avoid destructive failure

Offline behaviour should feel like a temporary interruption, not a broken application.

---

# 26. Data Entry Philosophy

Ask for the minimum information required to make something useful.

Example:

Creating a task should not require:

- project
- category
- priority
- status
- due date
- owner
- tag
- workflow
- dependency

unless the user actually needs those things.

Progressive enrichment is preferred.

---

# 27. Defaults

Defaults should do useful work.

A new task should behave sensibly without configuration.

The user should not need to understand Dokkit's internal model before using it.

Good software makes the correct action the easy action.

---

# 28. Settings

Settings should contain genuine configuration.

Do not move ordinary interaction into settings merely to keep the main interface visually clean.

If users need something frequently, it probably belongs in the primary experience.

---

# 29. Accessibility

Accessibility is part of the design, not an afterthought.

Ensure:

- sufficient contrast
- readable typography
- adequate touch targets
- keyboard accessibility where applicable
- screen-reader labels
- visible focus states
- no interaction dependent solely on colour
- no critical information conveyed only through animation

Gestures should supplement, not replace, accessible controls.

---

# 30. Performance

Dokkit should feel immediate.

Priorities:

- fast initial interaction
- low perceived latency
- minimal unnecessary loading
- efficient rendering
- sensible caching
- graceful offline behaviour

Do not introduce heavy dependencies for small visual effects.

---

# 31. Product Boundaries

Dokkit should resist becoming:

- a CRM
- an ERP
- a full project-management suite
- a traditional calendar
- a timesheet application
- a habit tracker
- a team performance dashboard
- a social network
- a gamified productivity platform

Features can be powerful without making the product complicated.

---

# 32. Feature Test

Before adding a feature, ask:

### Does it help the user understand what fits?

If no, question the feature.

### Does it reduce mental friction?

If no, question the feature.

### Can it be simpler?

Almost always assume yes.

### Does it require the user to maintain unnecessary information?

If yes, simplify it.

### Does it make Dokkit feel like conventional productivity software?

If yes, reconsider it.

---

# 33. Design Decision Hierarchy

When design decisions conflict, use this order:

1. **User comprehension**
2. **Low friction**
3. **Time awareness**
4. **Clarity**
5. **Consistency**
6. **Visual polish**
7. **Technical convenience**

Technical convenience should not dictate the user experience.

---

# 34. AI/Developer Guardrails

Any AI agent or developer working on Dokkit should follow these rules.

### Do not redesign without a reason.

Existing UI should be preserved unless the task explicitly calls for redesign.

### Do not add complexity casually.

A technically elegant abstraction is not necessarily a good product decision.

### Do not invent requirements.

If the user has not requested a workflow, don't create one.

### Do not introduce arbitrary states.

Avoid adding:

- priority levels
- statuses
- stages
- categories
- scores
- percentages

unless they solve a demonstrated problem.

### Do not hard-code device dimensions.

Use responsive layout and platform-provided safe-area information.

### Do not confuse implementation completeness with product quality.

More fields and more controls do not necessarily make Dokkit better.

---

# 35. Current Core Experience

The essential Dokkit experience should remain:

```text
CAPTURE
   ↓
UNDERSTAND TIME
   ↓
SEE WHAT FITS
   ↓
DO IT
   ↓
MOVE ON
```

The product should stay out of the user's way.

---

# 36. The Standard

The final test for any Dokkit feature is simple:

> **Does this help a person think more clearly about what fits into their time?**

If yes, it may belong.

If no, it probably doesn't.

Dokkit does not need to win by having the most features.

It wins by being the tool people actually want to open.