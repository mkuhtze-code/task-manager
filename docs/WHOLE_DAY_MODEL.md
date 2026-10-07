# Dokkit Whole-Day Model

Status: design authority — pre-implementation
Version: 1.0

## 1. Core proposition

Dokkit is one system for understanding and using a person's time.

Today, Jobs, Meetings, and Travel are not four independent product areas. They are four projections of the same whole: the person's day, available time, commitments, work, movement, and consequences.

**One whole. Four lenses.**

The UI must make the shared whole perceptible without flattening the lenses into identical screens.

## 2. The primary object

The primary system object is **time in context**.

A useful unit is not merely a task, job, meeting, or trip. It is an activity/commitment that occupies, constrains, or changes time and may have context:

- when
- duration
- availability
- fixed/flexible status
- work/task context
- job context
- meeting/people context
- place/travel context
- current state
- relationship to other objects

Existing domain objects remain authoritative. This model is an interaction and information architecture layer; it does not require a data-model rewrite.

## 3. Four projections

### Today — the whole day
Primary question: **What does my time look like today, and what fits?**
Today is the integrator. It is the primary surface that combines work, fixed commitments, meetings, travel, and available capacity.

### Jobs — work over time
Primary question: **Where is my work going?**
Jobs provides durable work context for work that spans days. A job does not own a separate reality from Today. Its tasks, meetings, evidence, site days, and relevant movement remain connected to the same underlying time and work.

### Meetings — people and conversations in time
Primary question: **What conversations occupy my time, and what do they leave behind?**
Meetings is not merely a meeting archive. A meeting is a time commitment with people, context, decisions, actions, and possible job/travel relationships.

### Travel — movement through time and place
Primary question: **How does movement change the shape of my time?**
Travel is not a separate trip-planning product. Travel represents movement that occupies or constrains time and connects places, jobs, meetings, and the day.

## 4. Relationship rule

Cross-surface links are not navigation decoration. They are evidence that the system represents one reality.

Examples:
- Today → Job
- Today → Meeting
- Today → Travel/stop
- Job → Today
- Job → Meeting
- Job → Travel
- Meeting → Job
- Meeting → Today
- Meeting → Travel where relevant
- Travel → Job
- Travel → Meeting where relevant
- Travel → Today

The destination must preserve object identity and context. Do not create surface-specific duplicate representations when the existing underlying object can be opened.

## 5. Shared temporal language

The four projections should use a common vocabulary for temporal reality:
- Today
- Ahead
- Past
- Now
- Next
- Fits
- Does not fit
- Open
- Done
- Carry
- Waiting
- Time
- Duration
- Context
- Details
- Tools

Surface-specific nouns remain:
- Job
- Meeting
- Trip
- Stop
- Task

Do not invent a different vocabulary for equivalent states merely to make a surface feel unique.

## 6. Shared interaction grammar

Every surface should answer the same questions in the same structural locations:
1. Where am I?
2. What is the current state?
3. What is the primary object/list?
4. What can I do now?
5. Where is additional context?
6. Where are secondary tools?
7. How do I return to the wider whole?

### Primary action
One primary action per surface/context.
The verb is domain-appropriate:
- Today: Add
- Jobs: New job
- Meetings: Record
- Travel: Plan trip
- Nested contexts: action appropriate to the object, such as Add task or Add stop

The placement, emphasis, affordance, and interaction pattern must remain consistent.

### Tools
Secondary actions belong behind one predictable tools/overflow affordance.
Tools must not become a second navigation system.

### Context
Context is compact, readable, and relational. It should answer why the current object matters to the user's time rather than become a dashboard of independent metrics.

## 7. Navigation model

SurfaceNav remains the top-level navigation spine.
It represents four lenses into one system, not four destinations with independent navigation philosophies.

Rules:
- SurfaceNav order is stable unless there is a demonstrated product reason to change it.
- The active state identifies the current lens.
- Moving between surfaces must preserve the user's mental position in the whole.
- Nested screens use Back → object → Tools.
- Cross-surface object links open the canonical object rather than a duplicate surface-specific detail.
- Returning from a nested object should return to the originating context where practical.
- No surface should introduce an alternative top-level navigation paradigm.

## 8. Depth model

Use the same information depth across the product:

### Level 1 — Lens
Today / Jobs / Meetings / Travel

### Level 2 — Object
Task / Job / Meeting / Trip / Stop

### Level 3 — Context
Time / place / people / work / evidence / actions / connections

### Level 4 — Tools
Edit, export, delete, configuration, secondary operations

A surface may emphasise different Level 3 information, but it must not invent a different hierarchy.

## 9. Visual identity

Cohesion comes from shared grammar, not identical styling.

Shared:
- header geometry
- type hierarchy
- spacing rhythm
- paper/ink treatment
- hairline dividers
- primary action treatment
- sheet construction
- overflow/tools treatment
- status language
- object rows
- empty-state construction
- responsive behaviour

Distinctive:
- Today: temporal/capacity emphasis
- Jobs: durable work emphasis
- Meetings: conversation/people emphasis
- Travel: movement/place emphasis

Do not use colour, badges, decorative chrome, or separate toolbar conventions as the primary means of differentiation.

## 10. The day as the integration test

The definitive test is a realistic day, not an isolated screen.

Example:
08:00–09:00 — travel to a job
09:00–12:00 — job work
13:00–14:00 — client meeting
14:00–16:00 — job work

The user should be able to move through:
Today → Job → Meeting → Travel → Today

and retain the understanding that these are different views of the same day.

If a transition makes the user mentally reconstruct the relationship, the system is not cohesive enough.

## 11. Current implementation findings

The repository already contains meaningful shared infrastructure:
- SurfaceNav is shared across Today, Jobs, Meetings, and Travel.
- Today already consumes jobs and meetings and has travel/capacity awareness.
- Jobs exposes relationships to meetings and travel/site-day context.
- Meetings carries job context and has shared identity intended to remain consistent across surfaces.
- Travel carries job and meeting relationships and explicitly affects Today.
- app/surface-system.css provides shared desktop surface primitives.
- docs/LAYOUT_SYSTEM.md establishes a common structural hierarchy.

However, several implementation patterns still communicate four products:
1. SurfaceNav order can be profile-driven while the conceptual system requires a stable four-lens spine unless there is a strong reason otherwise.
2. Desktop headers have converged structurally but still contain surface-specific concepts and controls such as Trip context, Meeting context, and distinct featured blocks.
3. Surface copy currently defines each surface primarily as an independent purpose rather than explicitly framing each as a projection of time.
4. Mobile headers are not yet governed by one explicit relational grammar.
5. Cross-surface relationships exist in implementation, but they are not consistently presented as one temporal system.
6. Some surface-specific filter/control patterns are structurally similar but semantically independent.
7. The current system has shared styling primitives, but not yet a sufficiently explicit shared object/context model in the interface layer.

These are design-system/information-architecture issues. They should not be solved by deleting capabilities.

## 12. Non-goals

This model does not authorize changes to:
- database schema
- engine authority
- capacity or fit calculations
- speech interpretation
- capture mutation semantics
- AI architecture
- native Android shell
- marketing/branding
- existing core surface capabilities

Any architectural change to those areas requires a separate decision.

## 13. Implementation sequence

### Phase A — Information architecture
1. Audit each surface's Level 1–4 hierarchy.
2. Map every cross-surface object relationship.
3. Identify duplicate representations and orphaned transitions.
4. Define canonical destination for every cross-surface object.
5. Define back/origin behaviour.

### Phase B — Shared interaction grammar
6. Create shared surface header contract.
7. Create shared object/context contract.
8. Create shared temporal-state vocabulary.
9. Create shared primary-action contract.
10. Create shared Tools contract.
11. Create shared empty/loading/error patterns.

### Phase C — Surface expression
12. Rework Today as the whole-day integrator.
13. Rework Jobs as the work projection.
14. Rework Meetings as the people/conversation projection.
15. Rework Travel as the movement/place projection.
16. Preserve meaningful surface-specific affordances.

### Phase D — Desktop/mobile convergence
17. Make mobile the canonical interaction grammar.
18. Make desktop a spatial expansion of the same grammar.
19. Remove only genuinely redundant surface-specific chrome.

### Phase E — Validation
20. Test real journeys across all four projections.
21. Test object identity and return paths.
22. Test accessibility and keyboard/focus paths.
23. Test empty states and first-use flows.
24. Build/typecheck.
25. Review the final product as one system, not four screens.

## 14. Acceptance criteria

The pass is complete only when:
- A user can describe the relationship between all four surfaces as four views of the same day/time.
- Every surface has a distinct purpose without feeling like a separate product.
- The same underlying object retains identity across surfaces.
- Cross-surface navigation feels like following context, not switching applications.
- Temporal state vocabulary is consistent.
- Header, primary action, Tools, object, and depth grammar are consistent.
- Today genuinely integrates the other three projections.
- Jobs, Meetings, and Travel visibly relate their objects back to time.
- No capability is removed merely for visual consistency.
- Mobile and desktop communicate the same hierarchy.
- A realistic multi-surface day can be followed end-to-end without mental reconstruction.

## Governing principle

**Dokkit does not have four systems for a person's life. It has one system for their time, viewed four ways.**