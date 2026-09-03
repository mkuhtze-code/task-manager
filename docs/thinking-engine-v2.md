# Dokkit Thinking Engine V2 — Technical Design Document

## 1. Overview & Vision

Dokkit is a personal thinking surface designed to answer one central question: **"What can I realistically do with the time I have?"**

Thinking Engine V2 extends Dokkit's quiet intelligence to answer: **"What has Dokkit actually learned about how I work?"**

This system observes real completed task history and existing thinking outputs to derive evidence-based observations. It strictly adheres to Dokkit's core product principles:
- **No productivity scoring, gamification, streaks, badges, or percentage report cards.**
- **No manufactured insights or generic AI fluff.**
- **Conservative and evidence-backed:** Silence is preferable to a false insight.
- **Traceable reasoning:** Every observation explains *why* Dokkit thinks this with concrete supporting facts.

---

## 2. Pipeline Architecture

The observation pipeline is a pure, deterministic multi-stage transformation:

```text
Raw Task History & Predictions
      ↓
Normalised Facts (CompletedTaskFacts[])
      ↓
Candidate Pattern Detection (5 Pattern Detectors)
      ↓
Evidence Analysis (Sample size, Recency, Consistency & Variance Check)
      ↓
Confidence Calculation (Evidence Strength)
      ↓
Structured Observations (EngineObservation[])
      ↓
Deduplication & Ranking (Rank by Confidence, Strength, Specificity)
      ↓
User-Facing UI Surface (Patterns Page)
```

---

## 3. Data Structures & Interfaces

### 3.1 Observation Model (`EngineObservation`)

```ts
export type ObservationType =
  | 'estimate_calibration'
  | 'repeated_carryover'
  | 'time_of_day'
  | 'task_context'
  | 'cluster_pattern';

export type EvidenceItem = {
  label: string;             // e.g. "4 completed tasks in this cluster"
  metricName: string;        // e.g. "actual_vs_estimate_ratio"
  metricValue: number | string; // e.g. 1.65 or "1.65x"
  sampleCount: number;
};

export type EngineObservation = {
  id: string;                 // Deterministic ID based on type + cluster/subject
  type: ObservationType;
  title: string;              // Short statement e.g. "Site visits tend to take longer than estimated"
  statement: string;          // Clear, neutral observation
  explanation: string;        // "Why Dokkit thinks this": evidence summary
  evidence: {
    sampleCount: number;
    consistencyRatio: number; // Fraction (0.0 - 1.0) meeting candidate condition
    supportingData: EvidenceItem[];
    lastObservedAt: string;   // ISO timestamp of latest task evidence
  };
  confidence: Confidence;     // 'low' | 'medium' | 'high'
  clusterLabel?: string;
  createdAt: string;          // ISO timestamp
  status: 'active' | 'stale';
};
```

---

## 4. Candidate Pattern Classes

### 4.1 Estimate Calibration
- **Purpose:** Detect task populations (clusters or global) where actual duration consistently exceeds or falls below estimated duration.
- **Rules:**
  - Requires `actual_mins` and `estimate_mins > 0`.
  - Minimum sample size: $N \ge 3$.
  - Ratio threshold: Underestimate if ratio $\ge 1.25$; Overestimate if ratio $\le 0.75$.
  - Consistency threshold: $\ge 65\%$ of tasks in population must fall into the same directional bias.
  - Variance check: If variance across ratios is high ($\text{CV} > 0.5$) or underestimation and overestimation occur in equal proportions, candidate is rejected.
- **Example Statement:** *"Tasks involving Site Visits tend to take longer than estimated."*

### 4.2 Repeated Carryover
- **Purpose:** Identify tasks/clusters that repeatedly span multiple days or surface dates before completion.
- **Rules:**
  - Carryover definition: `completed_at` is on a later calendar day than `created_at` or `surface_date`, or `daysToCompletion >= 2`.
  - Minimum sample size: $N \ge 3$.
  - Consistency threshold: $\ge 60\%$ carryover rate in cluster.
  - One-off vs repeated: Single delayed tasks are strictly ignored.
- **Example Statement:** *"Tasks related to Monthly Invoicing frequently carry over across multiple days."*

### 4.3 Time-of-Day Patterns
- **Purpose:** Identify relationships between task characteristics (e.g. short tasks $\le 15$m, or specific clusters) and completion timing.
- **Rules:**
  - Time windows: Morning (05:00-12:00 UTC/Local), Afternoon (12:00-17:00), Evening (17:00-22:00), Night (22:00-05:00).
  - Minimum sample size: $N \ge 4$ tasks with valid timestamps.
  - Consistency threshold: $\ge 65\%$ completed in the same window.
  - Uniform distribution check: Rejects patterns if completions are spread evenly across time windows.
- **Example Statement:** *"Short admin tasks (15 minutes or less) are usually completed in the morning."*

### 4.4 Task-Context Patterns
- **Purpose:** Detect relationships between context metadata (location attached, job attached, subtasks) and duration or completion timing.
- **Rules:**
  - Minimum sample size: $N \ge 4$.
  - Example: Tasks with location attached are predominantly completed in the afternoon, or tasks with subtasks take significantly longer than simple tasks.
  - Requires high co-occurrence ratio ($\ge 70\%$).

### 4.5 Cluster-Based Patterns
- **Purpose:** Synthesize multi-dimensional behavioral traits for task clusters derived from `buildClusters(history)`.
- **Rules:**
  - Minimum sample size: $N \ge 3$.
  - Aggregates location, job, duration stability, and temporal context into a unified cluster observation if a strong dominant trait exists.

---

## 5. Evidence Rules & Confidence Calculation

### 5.1 Evidence Criteria
1. **Minimum Sample Size ($N$):**
   - $N < 3$: Insufficient evidence $\rightarrow$ Produce NO observation.
   - $3 \le N < 6$: Low confidence baseline.
   - $6 \le N < 10$: Medium confidence baseline.
   - $N \ge 10$: High confidence baseline.
2. **Consistency Ratio ($C$):**
   - Must meet minimum threshold ($\ge 0.60 - 0.70$ depending on class).
   - If $C < 0.60$, candidate pattern is discarded due to insufficient signal.
3. **Contradictory Signal Rejection:**
   - Evaluates variance and balance between opposing outcomes. High conflicting signals suppress observation generation.
4. **Staleness Handling:**
   - Evidence older than 90 days is marked as `stale` or excluded from active observation generation if recent evidence contradicts it.

### 5.2 Confidence Calculation Matrix

$$\text{Confidence Score} = w_{\text{sample}} \cdot \text{SampleScore} + w_{\text{consistency}} \cdot \text{ConsistencyScore} - \text{StalenessPenalty}$$

Mapped deterministically to:
- **`high`**: High sample count ($\ge 8$), high consistency ($\ge 75\%$), recent evidence ($<30$ days).
- **`medium`**: Moderate sample count ($\ge 4$), good consistency ($\ge 65\%$).
- **`low`**: Baseline threshold ($3$ samples, $60-65\%$ consistency).

---

## 6. Deduplication and Ranking

1. **Deduplication:**
   - Group observations by `id` (hash of `type` + `clusterLabel`/`subject`).
   - If multiple detectors emit overlapping observations for the same cluster, retain the one with higher confidence score and higher specificity.
2. **Ranking:**
   - Sort by:
     1. Status (`active` before `stale`)
     2. Confidence level (`high` > `medium` > `low`)
     3. Evidence sample count ($N$)
     4. Recency (`lastObservedAt`)

---

## 7. UI Integration on Patterns Page (`app/analytics/page.tsx`)

The Patterns page will render observations in a calm, non-analytical hierarchy:

1. **What Dokkit Has Learned ("What I've noticed")**
   - Displays top ranked active observations.
   - Clear neutral statement.
2. **Why Dokkit Thinks This**
   - Beneath each observation, displays a concise breakdown of supporting evidence (sample size, consistency ratio, last observed date).
3. **Confidence Indicator**
   - Uses existing `Confidence` badge (`high`, `medium`, `low`) directly from the thinking engine output.
4. **Performance & Memoisation**
   - Observation generation uses `useMemo` in React.
   - Re-evaluates only when `allFacts` or filter criteria change.

---

## 8. Testing Strategy

1. **Unit Tests (`lib/thinking/__tests__/observationPipeline.test.ts`):**
   - Valid pattern detection for all 5 pattern classes.
   - Rejection when evidence is below minimum sample count.
   - Rejection when contradictory evidence exists (e.g., 50/50 split).
   - Distinction between one-off delay and repeated carryover.
   - Stale evidence identification.
   - Deduplication and ranking order.
2. **Regression Testing:**
   - All existing 28 test suites in `lib/thinking/__tests__/` must pass unchanged.
   - `npx tsc --noEmit` and `npm run build` must succeed cleanly.
