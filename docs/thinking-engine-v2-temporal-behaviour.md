# Thinking Engine V2.3 — Task Temporal Behaviour

## Overview

V2.3 teaches the Thinking Engine **how tasks move through time**, learned from
ordinary task use — no duration estimates and no Start/Stop required. It is a
single V2 detector (plus a shared temporal normalisation pass) that slots into
the existing `runObservationPipeline`. It never restarts or replaces the V2
architecture and does not redesign the Patterns page.

It helps Dokkit answer:

> “What tends to happen with tasks like this, and what appears to fit right now?”

…without pretending to know information the evidence does not contain.

---

## Core principle: lifecycle is NOT work duration

This is the single most important constraint of V2.3.

Example:

* Task created: 09:00
* Scheduled/surfaced: 10:00
* Completed: 17:00
* Start/Stop never used

What Dokkit genuinely knows:

* the task existed for 8 hours (creation → completion);
* it was intended/surfaced around 10:00;
* it was completed at 17:00;
* it experienced 7 hours of scheduling displacement.

What Dokkit does **NOT** know:

* that the task took 8 hours to perform.

**The engine never infers work duration from task lifetime.** If Start/Stop is
used, active duration remains a separate, observed measurement (creation of
`started_at`/`completed_at` is only meaningful when `started_at` is present).
Unknown information stays unknown.

### Terminology

| Term | Definition | NOT the same as |
|------|------------|-----------------|
| `createdAt` | When the task was added/captured | — |
| `firstSurfacedAt` | When the task was surfaced/scheduled (`surface_date`), where available | — |
| `intendedAt` | The commitment date: `surface_date` if present, else creation for planned tasks (carryover semantics) | — |
| `dueAt` | Hard due date. **Not present in the current schema** — documented as unavailable, never fabricated | — |
| `completedAt` | When the task transitioned to done | — |
| `activeDuration` | Only from Start/Stop: `completed_at − started_at` when `started_at` exists | taskLatency / scheduleDisplacement |
| `taskLatency` | creation/surface → completion elapsed time (hours/days) | taskDuration |
| `scheduleDisplacement` | intended date/time → actual completion elapsed (hours/days) | taskDuration |
| carryover | A committed task completed after its intended date | duration |
| repeated carryover | The same task text carried over on multiple occasions | duration |
| persistence | Number of local dates a task remained active (creation → completion) | duration |

Only Start/Stop evidence can support observed active duration. If active
duration is unavailable, it is left unavailable (null), never estimated.

---

## Evidence categories

The existing five reasoning levels (in `evidence.ts`) apply. Temporal
observations are mostly **derived measurements** (latency, displacement,
rates) and **observations** (descriptive summary statements). Some are
**associations** (e.g. “tasks created in the morning tend to be completed in
the afternoon”), which are **never** promoted to causation.

* Raw fact — `task.created_at`, `task.surface_date`
* Derived measurement — `taskLatencyHours = completed − created`
* Association — “tasks added in the morning are often completed later in the day”
* Observation — “tasks of this kind are commonly completed later in the day”
* Hypothesis — insufficient data, e.g. “weekend tasks may complete later (2 samples)”

No causal phrasing. No “this makes you…”, “you procrastinate…”, “this causes…”.

---

## Pipelines: same model, single detector

```
Raw task history (CompletedTaskFacts[])
  → Temporal normalisation (normalizeTemporalFacts): local date/hour/weekday,
    completion period, intended date/time, lifecycle intervals ONCE
  → Candidate temporal observations (time-of-day completion, overnight,
    created→completed period shift, schedule displacement, persistence)
  → Evidence analysis (V2 evidence model)
  → Structured observations
  → Semantic deduplication (existing)
  → Deterministic ranking (existing)
  → Patterns page
```

No parallel temporal-analysis path. The detector is invoked by
`runObservationPipeline` alongside the existing detectors, so its outputs take
part in the same dedup + ranking and reach the Patterns page through the
existing `v2Observations` list.

---

## Temporal normalisation (shared, single pass)

A single `normalizeTemporalFacts(tasks, tz)` precomputes, per eligible task,
everything the detector needs so it does not rescan the whole set per
observation (requirement #12):

* `createdLocal`, `completedLocal` — local dates
* `createdHour`, `completedHour` — local hours
* `createdDOW`, `completedDOW` — local weekday
* `createdPeriod`, `completedPeriod` — morning/afternoon/evening/night
* `surfaceLocal`, `intendedLocal` — intended date/time (when available)
* `latencyDays`, `latencyHours` — completion − creation
* `displacementDays`, `displacementHours` — completion − intended (when intended is available)
* `spanDays` (persistence) — number of local dates the task was active
* `activeDurationMin` — only when Start/Stop present, else null

All timestamps resolve through the existing V2 timezone layer (`toLocalDate`,
`toLocalHour`, `classifyLocalPeriod`, `localDateDiffDays`). No implicit machine
timezone, no raw `getHours()`, no UTC fallback for user-facing reasoning, no
date-only strings reinterpreted through a timezone.

---

## Observed behaviours (detector outputs)

Each output is a separate structured observation with its own semantic type and
identity. All go through `emitProportionObservation` / `buildEvidence`.

### 1. Overnight carry (`temporal:overnight`)
`P(completed on a later local date | eligible tasks)` — explicit denominator of
completed tasks with valid created+completed dates, minimum sample gate, and a
legitimate baseline of 0.5. Wording: “Tasks often carry into the next day.”
Does **not** claim the task “took a long time”.

### 2. Time-of-day completion (`temporal:completion_period`)
Dominant completion period vs. a uniform baseline (1/4 periods). Requires a
clear concentration above the uniform baseline with a meaningful effect —
never just “the largest bucket”. Wording: “Tasks like this are commonly
completed in the afternoon.”

### 3. Created → completed period shift (`temporal:shift_later`)
The share of tasks whose **completion** period is later in the day than their
**creation** period (e.g. created morning, completed afternoon/evening),
baseline 0.5. This is the “learn from natural use” signal: “Tasks added in the
morning are frequently completed later in the day.” Descriptive — no reason
given, and never “you procrastinate”.

### 4. Schedule displacement (`temporal:schedule_displacement`)
Where an intended (surface) time exists: `completion − intended` in hours.
Reports the typical (median) displacement and whether tasks tend to complete
before/after their intended time. **Not** duration. Tasks completed before
their intended time are negative displacement; missing intended time excludes
the task (tracked as missing data).

### 5. Persistence (`temporal:persistence`)
How many local dates tasks typically remain active before completion
(creation → completion span). Complements the existing same-day lifecycle
detector: it reports the multi-day span for tasks that do not clear the same
day.

### 6. Repeated temporal pattern
The time-of-day, overnight and shift observations are computed over the whole
eligible corpus with a minimum sample and an effect gate, so any observation
that is emitted reflects a **recurring**, repeated behaviour rather than a
single occurrence. No separate “recurrence” flag is invented.

### Handled by existing V2 detectors (not duplicated)
* **Same-day completion** — already provided by `observeV2Lifecycle`
  (`lifecycle:same_day`). Rebuilt here would collide on semantic identity, so
  V2.3 documents it as provided by lifecycle and does not re-implement it.
* **Carryover / repeated carryover** — already provided by
  `observeRepeatedCarryover`. Extended here conceptually (displacement is the
  magnitude view; carryover is the classification view).
* **Latency/staleness** — `observeV2Staleness` already observes
  “completed 3+ days after creation”. `taskLatency` is a complementary,
  continuous measurement; the two are not conflated.

---

## Evidence model integration (requirement #4)

Every temporal observation uses the existing V2 `Evidence` structure, built via
the shared `buildEvidence` / `buildProportionEvidence` helpers:

* `sampleSize` — eligible population
* `effectMagnitude` — normalised deviation from baseline (never fabricated)
* `consistency`, `variance` — derived from the underlying value distribution
* `recency` — recency of the supporting data
* `contradictionCount`, `missingDataCount` — tracked; malformed/missing
  timestamps count as missing data with no fabricated substitute
* `specificity` — how targeted the claim is
* `measurements` — per-period / per-task derived values
* `insufficient` — true (and observation suppressed) when denominator/baseline
  is unavailable; never manufactures a denominator
* `evidenceKind` — `derived_measurement` / `association` / `observation`

No second confidence system is created, and the UI performs no confidence
recalculation.

Legitimate baselines only:
* two-way rates (same-day, overnight, planned) → 0.5
* completion period → uniform 1/4 across periods

**Never** arbitrary fallbacks like `0.6` or `1` when a denominator/baseline is
missing — that is insufficient evidence.

---

## Timezone correctness (requirement #5)

All temporal grouping uses the user's IANA timezone through the existing V2
layer. Audit points:

* No `getHours()` / `getDay()` on raw `Date` — only `toLocalHour` /
  `toLocalDayOfWeek` behind the V2 timezone layer
* No reliance on `toISOString()` for day boundaries — local dates only
* Date-only values (`surface_date`) resolved as local dates and compared via
  `localDateDiffDays` (never reinterpreted through a timezone)
* Invalid timezone → detector returns no observations (does not silently fall
  back to UTC for user-facing reasoning); the pipeline still defaults an
  *absent* config to UTC as a documented, conservative fallback
* Tests cover: UTC/local date boundary, midnight hour normalisation, DST
  transition (spring-forward/fall-back), timezone boundary, invalid timezone,
  date-only values.

---

## Semantic identity & dedup (requirement #8)

Uses `observationIdentityKey` (type + cluster/time/location/job + subType).
No UUIDs, no random IDs, no render timestamps, no array position. Equivalent
temporal observations produce stable IDs; genuinely different ones stay
distinct. Determinism is covered by tests (identical input → identical IDs and
ranking).

## Ranking (requirement #9)

Uses the existing `rankAll`. Temporal observations are ranked with the same
deterministic, bounded formula (sample strength, effect, consistency,
variance/stability, specificity, recency, minus contradiction/staleness/missing
data). No second ranking algorithm. Ranking ≠ confidence: a low-confidence
temporal observation is not boosted because it is interesting.

---

## Patterns page (requirement #10)

Temporal observations flow into the existing `v2Observations` list and render
in the existing “Things I’ve noticed” panel — no new dashboard. Presentation is
concise and descriptive (“Tasks like this are usually completed later in the
day”). No scores, badges, gamification, productivity rankings, or psychological
labels. No unnecessary raw task text or IDs are exposed.

---

## Documented limitations

* **Task latency and schedule displacement describe task movement through
  time; they do not establish how long the task took to perform.** Active
  duration is only reported when Start/Stop evidence exists.
* No `dueAt` in the schema; hard-due-date displacement is out of scope.
* Temporal observations require a minimum eligible sample; sparse history
  yields nothing (correctly).
* Time-of-day observations describe concentration vs. a uniform baseline —
  they do not claim preferences or intent.
* Association phrasing (“often”, “tend to”) never implies causation.
