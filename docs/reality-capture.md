# Reality Capture + End-of-Day Reshape

> Design spec for the frictionless daily close-out loop.
> Linked issue: https://github.com/mkuhtze-code/task-manager/issues/36

## Purpose

Make Dokkit’s adaptive value *visible and habitual*.

After offline-first foundations, this is the highest-leverage feature: a 30–60 second ritual that:

1. Captures what actually happened
2. Reshapes the remaining plan
3. Carries unfinished work forward without guilt
4. Surfaces one calm, useful pattern insight

It answers the product promise in the most direct way possible:

> **You don’t need to do more. You need to know what fits.**

## Alignment with Design System

- Time is the primary organising principle
- No productivity guilt
- Carryover feels like “this still needs doing”
- Low friction, progressive disclosure
- Sticky-note calm aesthetic
- Deterministic (no generative AI)
- Offline-first

## User Flow

### Triggers
- Secondary action near the FAB or header: “Reality check”
- Soft prompt late in the day or when remaining capacity is low
- Per-task: “Update what happened”

### Steps
1. Open Reality Check surface
2. See today’s surfaced tasks in a simple vertical list
3. For each task choose (large targets):
   - Done
   - Partially done (remaining estimate carries)
   - Not done → carry forward (default)
   - Skip / remove from today
4. Optional short note
5. Tap **Reshape the plan**
6. Immediate feedback:
   - Before / after of remaining today + tomorrow
   - One insight card only when confidence is sufficient
   - “Looks good” or continue adjusting

### Language
- “Carried forward”
- “Updated”
- “Still needs doing”
- Never: overdue, failed, behind, only completed X%

## Data

### Existing foundations (already present)
- `tasks.status` (`pending` | `active` | `done`)
- `tasks.estimate_mins`, `logged_mins`, `actual_mins`
- `tasks.started_at`, `completed_at`, `surface_date`
- `time_logs`
- `task_types`

### Minimal additions

```kotlin
data class RealityUpdate(
    val taskId: String,
    val status: String,          // done | partial | carried | skipped
    val actualMins: Int? = null,
    val remainingMins: Int? = null,
    val note: String? = null,
    val timestamp: String
)

data class DayClose(
    val date: String,            // YYYY-MM-DD
    val updates: List<RealityUpdate>,
    val overallNote: String? = null,
    val reshapedAt: String
)
```

Prefer deriving most state from task + time_log updates. A dedicated `day_closes` table is optional and should only be added if it simplifies offline reconciliation or insight generation.

## Reshape Algorithm (deterministic)

1. Apply status and duration updates to tasks.
2. Write `TimeLog` rows for any provided actual durations.
3. Update observed averages on matching `TaskType`s once a confidence threshold is reached (e.g. ≥ 3 observations).
4. Recalculate remaining capacity for today using current work window + meetings.
5. Re-order / re-estimate remaining tasks with the latest observed durations.
6. Carry unfinished work to the next valid surface date (respect work_days and calendar commitments).
7. Emit at most one insight if the pattern is strong enough.

## UI Skeleton (Android / Compose)

- New composable: `RealityCheckSheet` or full-screen surface launched from Today.
- Large check / radio-style targets for the four outcomes.
- Optional duration chip row (Less / About right / Longer) or simple number entry.
- Primary button: “Reshape the plan”.
- Feedback surface that animates the plan change (subtle list movement, not celebration).

Keep visual weight low. No progress rings for “completion rate”. No scores.

## Offline

- All writes go to local store first.
- Queue `RealityUpdate`s / task patches.
- Sync when connectivity returns; resolve conflicts with last-write-wins or simple operational merge for personal data.
- Show calm offline indicator.

## Acceptance Criteria

- [ ] Reality Check reachable in ≤ 2 taps from Today
- [ ] Done / Partial / Carry / Skip are large and default to carry
- [ ] Reshape visibly updates remaining day + next day
- [ ] Unfinished work carries forward with non-guilt language
- [ ] Observed durations feed TimeLog and learning
- [ ] Fully offline capable
- [ ] At most one calm insight, only when confidence is high
- [ ] Fully consistent with *Dokkit — Design System & Product Principles*

## Out of Scope (for this iteration)

- Team / shared jobs
- Generative AI suggestions
- Gamification or scores
- Complex multi-day planning UI
- Full historical analytics dashboard

## Next Implementation Steps

1. Extend domain models + repository methods for RealityUpdate / DayClose (or equivalent task patches).
2. Build `RealityCheckSheet` against real data (replace TodayScreen prototype samples).
3. Wire reshape logic into the capacity / ordering engine.
4. Add offline queue + sync path.
5. Surface one insight card.
6. Instrument the success metrics listed in the issue.
