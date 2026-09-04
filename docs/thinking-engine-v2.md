# Thinking Engine V2/V2.1 — Evidence-Based Observation Pipeline

## Overview

The Thinking Engine turns task history into evidence-based observations. It is conservative: it never manufactures evidence, never silently promotes correlation into causation, and returns no result when data is insufficient.

**Pipeline:**

```
Raw task history
  → Normalised facts
    → Candidate patterns
      → Evidence analysis
        → Confidence dimensions
          → Structured observations
            → Semantic deduplication
              → Ranking
                → Patterns page
```

## Reasoning Discipline

Five distinct levels, never silently promoted:

| Level | Description | Example |
|-------|-------------|---------|
| **Raw fact** | Unprocessed data point | `task.actual_mins = 45` |
| **Derived measurement** | Calculated from raw facts | `ratio = actual / estimated = 1.5` |
| **Association** | Statistical co-occurrence | "70% of errands happen at Store X" |
| **Observation** | Structured, evidence-backed statement | "Errands tend to take 45 minutes on average (n=12)" |
| **Hypothesis** | Tentative explanation requiring further data | "Weekend tasks may take longer (2 samples, inconclusive)" |

**Wording rules:**
- Never: "X causes Y", "X makes you…", "because of X…"
- Always: "associated with", "observed alongside", "tends to", "appears more often when", "historically observed"

## Normalised Facts

All detectors operate on `CompletedTaskFacts[]` — a single input contract.

```
CompletedTaskFacts {
  text: string
  actual_mins: number | null
  estimate_mins: number | null
  created_at: string | null          // ISO-8601
  completed_at: string | null        // ISO-8601
  location_text: string | null
  lat: number | null
  lng: number | null
  job_id: string | null
  source: 'planned' | 'came_up' | null
  subtask_count: number
  subtask_done: number
  info: string | null
  timer_used: boolean
}
```

Normalisation:
- Null `actual_mins` on completed task → excluded from duration analysis
- Null `created_at` → excluded from temporal analysis
- Null coordinates → excluded from spatial analysis
- Each detector declares what it needs and returns null/empty when insufficient

## Candidate Patterns

Detectors produce candidate observations from normalised facts:

| Detector | Input | Output | Minimum evidence |
|----------|-------|--------|-----------------|
| `estimateAccuracy` | Single task completion | `EstimateAccuracyObservation` | Has estimate + actual |
| `durationMemory` | Cluster durations | `DurationMemoryObservation` | ≥2 durations |
| `taskLifecycle` | Cluster completed tasks | `LifecycleObservation` | ≥2 completed tasks |
| `decomposition` | Cluster tasks | `DecompositionObservation` | ≥1 task |
| `staleness` | All tasks + now | `StalenessObservation` | ≥1 pending task |
| `planningBehaviour` | Cluster tasks | `PlanningObservation` | ≥1 task |
| `clusterBehaviour` | Cluster tasks | `ClusterBehaviourObservation` | ≥1 task |
| `carryover` | Task history | `CarryoverObservation` | ≥2 date transitions |
| `timeOfDay` | Cluster tasks | `TimeOfDayObservation` | ≥3 tasks with timestamps |
| `temporalBehaviour` (V2) | Completed tasks + tz | `TemporalObservation[]` | ≥3 eligible tasks per claim |

## Evidence Model

Every observation carries an `Evidence` object:

```typescript
Evidence {
  sampleSize: number              // Number of data points
  effectMagnitude: number | null  // Size of observed effect (0-1 scale)
  consistency: number | null      // How consistent across samples (0-1)
  variance: number | null         // Stability of measurements
  recency: number | null          // Days since most recent supporting data
  contradictionCount: number      // Number of contradicting data points
  missingDataCount: number        // Tasks excluded due to missing fields
  specificity: number | null      // How specific to context (0-1)
  measurements: unknown[]         // Supporting raw measurements
  insufficient: boolean           // True when data cannot support conclusion
}
```

**Zero-denominator rule:** If a denominator is zero, data is insufficient, or a measurement cannot legitimately be calculated:
- Return `insufficient: true`
- Return no measurement
- Reject the candidate
- **Never invent a plausible-looking value**

## Confidence Dimensions

Confidence is derived from evidence dimensions, not a single arbitrary number:

```typescript
ConfidenceDimensions {
  sampleStrength: 'low' | 'medium' | 'high'   // From sample size thresholds
  effectStrength: 'low' | 'medium' | 'high'   // From effect magnitude
  consistencyStrength: 'low' | 'medium' | 'high' // From consistency
}
```

Aggregate `confidence: Confidence` is derived as:
- `high` if all dimensions are `high`
- `medium` if at least 2 dimensions are `medium`+
- `low` otherwise

Thresholds:
- `sampleStrength`: ≥7 → high, ≥4 → medium, else low
- `effectStrength`: ≥0.5 → high, ≥0.3 → medium, else low
- `consistencyStrength`: ≥0.8 → high, ≥0.6 → medium, else low

## Structured Observation Domain Object

```typescript
StructuredObservation {
  id: string                      // Deterministic semantic ID
  type: string                    // Observation type discriminator
  title: string                   // Human-readable headline
  description: string             // Detailed observation text
  evidence: Evidence              // Full evidence breakdown
  confidence: Confidence          // Derived aggregate
  confidenceDimensions: ConfidenceDimensions
  supportingMeasurements: unknown[]
  affectedContext: {
    clusterLabel?: string
    timePeriod?: string
    location?: string
    jobId?: string
  }
  createdAt: string               // When observation was generated
  observationTimestamp: string     // When evidence was last valid
  recency: number | null          // Days since most recent data
  staleness: StalenessStatus      // CURRENT | STALE | STALE_BEFORE_CONTRADICTION
  contradictionStatus: ContradictionStatus // NONE | PARTIAL | FULL
  traceability: Traceability      // Links to source task records
  semanticType: string            // For dedup grouping
  rank: number                    // Deterministic rank
}
```

## Semantic Identity

Observation IDs are computed from stable normalised semantics:

```typescript
function computeSemanticId(obs: StructuredObservation): string {
  const parts = [
    obs.type,
    obs.affectedContext.clusterLabel ?? '',
    obs.affectedContext.timePeriod ?? '',
    obs.affectedContext.location ?? '',
    obs.affectedContext.jobId ?? '',
  ]
  return sha256(parts.join('|')).slice(0, 16)
}
```

**ID guarantees:**
- Equivalent semantics → same ID
- Detector execution order does not affect ID
- No random UUIDs, no render timestamps, no array indices

## Semantic Deduplication

Equivalent observations describing the same pattern collapse:

1. Group observations by `semanticType`
2. Within each group, group by `id`
3. If multiple observations share an ID (from different detectors), keep the one with strongest evidence
4. Distinct patterns remain distinct

## Ranking

Deterministic, explainable ranking:

```typescript
function rankObservation(obs: StructuredObservation): number {
  let score = 0
  score += evidenceStrengthScore(obs.evidence)       // 0-40 points
  score += effectMagnitudeScore(obs.evidence)        // 0-20 points
  score += consistencyScore(obs.evidence)            // 0-15 points
  score += recencyScore(obs.recency)                 // 0-10 points
  score -= contradictionPenalty(obs.contradictionStatus) // 0-15 points
  score -= stalenessPenalty(obs.staleness)           // 0-10 points
  return score
}
```

**Ranking reflects:** Why an observation is worth surfacing now, not just historical strength.

## Timezone Handling

### Principles
- All date-only comparisons use **local calendar dates**, not UTC
- `created_at`, `completed_at` are stored as ISO-8601 UTC strings
- When comparing "same day", convert to user's local date first
- Engine requires a timezone string (e.g., `"America/New_York"`)

### Implementation
- `toLocalDate(iso: string, tz: string): string` — YYYY-MM-DD in local tz
- `toLocalHour(iso: string, tz: string): number` — Hour in local tz
- `isSameLocalDay(a: string, b: string, tz: string): boolean`
- `localDayOfWeek(iso: string, tz: string): number` — 0=Sun..6=Sat

### Boundary cases
- Midnight: local date may differ from UTC date
- DST transitions: hour may be ambiguous or skipped
- Timezone offsets: -12 to +14

All detectors that compare dates accept an optional `tz` parameter. Default is UTC (backward compatible).

## Carryover Semantics

### Definitions

- **Creation:** When the user first captured the task (`created_at`)
- **Intended date:** When the task was scheduled for (`surface_date` or `due_today`)
- **Completion:** When the task was marked done (`completed_at`)
- **Carryover:** A task that was due on date A but was not completed on date A, and was completed on a later date

### What IS carryover
- Task created with `due_today = true` for Monday, completed on Wednesday
- Task with `surface_date = "2026-01-15"` completed on 2026-01-17

### What is NOT carryover
- Task intentionally created with a future `surface_date` (passive reminder)
- Task created and completed on different days but never had a due date
- Task with missing or malformed dates

### Repeated carryover
A task that has been carried over **2+ times** (different intended dates, not completed on any of them until later).

### Detection requirements
- Must have a valid intended date (not just creation date)
- Must distinguish `surface_date` future scheduling from actual due dates
- Must use local calendar dates for comparison
- Must handle missing dates gracefully

## Staleness vs Contradiction

**Staleness:** Historically supported observation whose supporting evidence is no longer recent.

**Contradiction:** Recent evidence conflicts with the historical observation.

| Status | Meaning | Example |
|--------|---------|---------|
| `CURRENT` | Evidence is recent and supporting | "Errands take 45m (last seen 2 days ago)" |
| `STALE` | Historically supported, no recent data | "Errands take 45m (last seen 30 days ago)" |
| `CONTRADICTED` | Recent data conflicts | "Errands take 45m, but recent ones took 20m" |

A stale observation is **not** automatically contradicted.
A contradicted observation is **not** merely stale.

## Estimate Calibration

Hardened estimate-vs-observed analysis:

```typescript
EstimateCalibration {
  sampleSize: number
  medianRatio: number              // actual / estimated
  meanRatio: number
  absoluteMedianDelta: number      // |actual - estimated|
  directionBias: 'over' | 'under' | 'balanced'
  outlierCount: number             // |ratio - median| > 2 * IQR
  effectMagnitude: number          // How far from 1.0
  consistency: number              // IQR-based stability
  evidence: Evidence
}
```

Requirements:
- Exclude tasks without both estimate and actual
- Use median/quantiles, not just mean (outlier robust)
- Track direction of error (consistently over vs under)
- Minimum 3 samples for any calibration observation
- Mark insufficient when data is too sparse

## Task-Context Patterns

Audit for:
- Correct denominators (what is the base population?)
- Proper baseline (compared to what?)
- Minimum evidence thresholds
- Missing data handling
- Effect magnitude (not just rate)
- Variance/stability
- Confounding awareness

Result is **descriptive**, never causal.

## Time-of-Day Patterns

Requirements:
- Use explicit local timezone semantics
- Require ≥3 tasks with timestamps
- Compare against uniform distribution baseline
- Account for effect magnitude, variance, contradiction, recency
- Wording is observational/descriptive

## Cluster Patterns

Cluster-derived observations must validate:
- Minimum sample size (≥3 for association, ≥4 for job)
- Correct denominator
- Baseline comparison
- Association strength (ratio ≥ threshold)
- Stability across time
- Variance
- Contradiction
- Missing data

If data cannot support the pattern, **do not emit it**.

## Testing Strategy

### Evidence tests
- Sample size calculations
- Effect magnitude computation
- Consistency measurement
- Variance computation
- Recency tracking
- Contradiction detection
- Missing data handling
- Specificity computation
- Zero denominator handling
- Fabricated-evidence prevention

### Time tests
- Local timezone resolution
- Midnight boundary
- Date boundary across timezone
- DST transitions
- UTC fallback behavior

### Carryover tests
- True repeated carryover (2+ dates)
- Intentional rescheduling (future surface_date)
- One-off delayed completion
- Missing dates
- Local date semantics

### Estimate tests
- Accurate estimates (ratio ≈ 1.0)
- Systematic over-estimation
- Systematic under-estimation
- Outlier handling
- Variance computation
- Insufficient samples

### Context tests
- Correct denominators
- Baseline comparison
- Insufficient evidence
- Descriptive (non-causal) wording

### Cluster tests
- Valid cluster associations
- Insufficient cluster size
- Unstable associations
- Zero denominator
- Contradictory evidence

### Identity tests
- Deterministic IDs
- Equivalent semantics → same ID
- Detector order independence

### Deduplication tests
- Equivalent observations collapse
- Distinct observations remain distinct
- Strongest evidence wins

### Ranking tests
- Stronger evidence ranks higher
- Larger effect matters
- Recency matters
- Contradiction/staleness penalized differently
- Deterministic ordering

## File Structure

```
lib/thinking/
  v2/
    evidence.ts          — Evidence model + helpers
    observations.ts      — StructuredObservation type + factory
    identity.ts          — Semantic ID computation
    dedup.ts             — Semantic deduplication
    ranking.ts           — Deterministic ranking
    pipeline.ts          — Main pipeline orchestrator
    timezone.ts          — Local timezone utilities
    carryover.ts         — Carryover detection
    timeOfDay.ts         — Time-of-day capture patterns
    calibration.ts       — Estimate calibration
    proportion.ts        — Shared proportion-vs-baseline builder
    temporal.ts          — Shared temporal normalisation (latency, displacement, persistence)
    temporalBehaviour.ts — V2.3 task-temporal-behaviour detector
    taskContext.ts       — Planning/estimate/location/job/info rates
    lifecycle.ts         — Same-day lifecycle rate
    decomposition.ts     — Subtask rate
    staleness.ts         — Completed-after-stall rate
    cluster.ts           — Cluster duration/place associations
    clusterGroups.ts     — Dependency-free deterministic clustering
  types.ts               — Extended types (V1 + V2)
  index.ts               — Updated barrel exports
```

## Runtime Pipeline (V2.3)

`runObservationPipeline(tasks, { timezone, now })` executes every detector in
one pass over a single `CompletedTaskFacts[]` argument, then deduplicates and
ranks. The runtime call graph is:

```
runObservationPipeline
 ├─ observeEstimateCalibration(tasks)            → estimate:*
 ├─ observeTimeOfDay(tasks, tz)                  → time_of_day:<period>
 ├─ observeRepeatedCarryover(tasks, tz)          → carryover:*
 ├─ observeV2TaskContext(tasks)                  → task_context:*
 ├─ observeV2Lifecycle(tasks, tz)                → lifecycle:same_day
 ├─ observeV2Decomposition(tasks)                → decomposition:rate
 ├─ observeV2Staleness(tasks, tz)                → staleness:*
 ├─ observeV2Clusters(tasks)                     → cluster:*
 └─ observeV2TemporalBehaviour(tasks, tz)        → temporal:*
      (overnight, completion_period, shift_later,
       schedule_displacement:<dir>, persistence)
 ├─ deduplicateObservations(candidates)          → semantic dedup
 └─ rankAll(deduped)                             → deterministic ranking
```

The Patterns page consumes the returned `StructuredObservation[]` directly; it
does not recompute evidence or confidence itself.

### Temporal detector (V2.3)

`observeV2TemporalBehaviour` (via `temporal.ts`) learns how tasks move through
time from ordinary task use. Facts are normalised once in
`normalizeTemporalFacts(tasks, tz)` (local date/hour/weekday, completion
period, intended date, latency/displacement/persistence intervals) and reused
by every sub-observation — no per-observation rescan.

Observed behaviours (each a distinct semantic type / identity):

| semanticType | Claim |
|--------------|-------|
| `temporal:overnight` | P(completed on a later local date) — baseline 0.5 |
| `temporal:completion_period` | Dominant completion period vs uniform 1/4 baseline |
| `temporal:shift_later` | Completion later in the day than added — baseline 0.5 |
| `temporal:schedule_displacement:<before\|after>` | Typical completion vs intended day (magnitude) |
| `temporal:persistence` | Typical number of local dates a carried task spans |

**Known limitations**

- Task latency and schedule displacement describe task movement through time;
  they do **not** establish how long the task took to perform. Active duration
  is only reported when Start/Stop evidence exists.
- The current schema has no `due_at`; hard-due-date displacement is out of
  scope and never fabricated.
- Date-only `surface_date` values are kept as-is (never reinterpreted through a
  timezone); the existing `carryover.ts` still localises them via the timezone
  layer, so carryover day attribution is independent of this detector.
- Temporal observations require a minimum eligible sample and an effect gate;
  sparse or balanced history yields nothing.
- Time-of-day statements describe concentration vs a uniform baseline — they
  never claim preference or intent, and association phrasing never implies
  causation.
