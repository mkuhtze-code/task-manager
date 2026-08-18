# DOKKIT THINKING ENGINE — SCOPE 2.5 ANALYSIS REPORT

## PART 1 — REALISTIC FIXTURE

**Persona:** Dan, 38, roofer/general builder, Midlands UK. Works solo with occasional apprentice (Jake). 

**Period:** January 6 — August 6, 2026 (7 months)

**Total tasks:** 150 completed

**Jobs (7):**
| Job | Period | Visits | Avg Duration |
|-----|--------|--------|-------------|
| Henderson Reroof | Jan 8 — Feb 6 | 15 | ~4h site visits |
| Smith Extension | Feb 3 — Apr 1 | 12 | ~4h site visits |
| Jones Flat Roof | Mar 16 — Apr 2 | 6 | ~2.5h site visits |
| Patel Office Refurb | Apr 14 — Jul 4 | 18 | ~9h site visits |
| Williams Garden Room | May 6 — Jun 13 | 8 | ~4h site visits |
| Brown Chimney Repair | Jun 16 — Jul 1 | 5 | ~3h site visits |
| Taylor Garage | Jul 8 — Aug 6 | 9 | ~4h site visits |

**Recurring activity types:**
- Material runs (9): quick trips to supplier/merchant, 25-80 min
- Client calls (9): brief phone calls, 5-20 min
- Admin (16): accounts, receipts, insurance, tax, tool ordering
- Personal (33): school run, football pickup, garden, DIY, vet
- Errands (5): quick reactive pickups, 15-40 min

**Behavioural design:**
- 82% planned, 18% reactive
- 82% have estimates, 78% timer-used
- 79% have locations, 60% attached to jobs
- 0% have surface_date (scheduling not heavily used)
- 19% have info/notes
- Site visits: always planned, always located, always job-tied, usually decomposed
- Personal tasks: always planned, no timer, no location, no decomposition
- Client calls: 100% reactive, no estimates, no timer
- Admin: always planned, always at home, some with notes

---

## PART 2 — OBSERVED ACTIVITY PROFILES

### Cluster Results

30 clusters with ≥2 tasks. 3 reached RELIABLE confidence (≥7 tasks).

### RELIABLE CLUSTERS

**1. SCHOOL RUN (14 tasks)**
- Duration: 25 min, zero variance (always 25 min)
- Planning: 100% planned, 100% estimated, 0% timer
- Lifecycle: 100% same-day, 0.0 days average age
- Decomposition: 0% — never broken down
- Location: none recorded
- Jobs: none
- Insight: A fixed daily commitment. No variation. No planning overhead. Never decomposed.

**2. UPDATE ACCOUNTS SPREADSHEET (7 tasks)**
- Duration: 69 min avg, range 55–90 min
- Planning: 100% planned, 100% estimated, 100% timer, 57% has notes
- Lifecycle: 100% same-day
- Decomposition: 0%
- Location: always Home workshop
- Jobs: none
- Insight: Monthly admin ritual. Slightly longer when quarter-end. Notes when there's something to remember (e.g. "sorted by job").

**3. FILE RECEIPTS (7 tasks)**
- Duration: 27 min avg, range 25–30 min
- Planning: 100% planned, 100% estimated, 100% timer
- Lifecycle: 100% same-day
- Decomposition: 0%
- Location: always Home workshop
- Jobs: none
- Insight: Quick monthly admin task. Very consistent duration. No variation.

### INDICATIVE CLUSTERS (4-6 tasks)

**4. SITE VISIT HENDERSON (5 tasks)**
- Duration: 408 min avg (6.8h), range 90–510 min
- Planning: 100% planned, 100% estimated, 100% timer, 60% has notes
- Lifecycle: 100% same-day
- Decomposition: 60%, avg 3.0 subtasks
- Location: Henderson (100%)
- Jobs: Henderson (100%)
- Insight: Substantial on-site work. Usually decomposed. Strongly job-and-location bound.

**5. GARDEN MOWING (5 tasks)**
- Duration: 57 min avg, range 55–60 min
- Planning: 100% planned, 100% estimated, 0% timer
- Lifecycle: 100% same-day
- Decomposition: 0%
- Location: Home workshop (100%)
- Jobs: none
- Insight: Personal recurring task. No timer (personal, not tracked for billing). Consistent duration.

**6. COLLECT KIDS FOOTBALL (4 tasks)**
- Duration: 58 min avg, range 55–60 min
- Planning: 100% planned, 100% estimated, 0% timer
- Lifecycle: 100% same-day
- Decomposition: 0%
- Location: none
- Jobs: none
- Insight: Weekly personal commitment. Consistent. No timer (not work).

**7. SITE VISIT JONES FLAT ROOF (4 tasks)**
- Duration: 140 min avg (2.3h), range 50–270 min
- Planning: 100% planned, 100% estimated, 100% timer, 25% has notes
- Lifecycle: 100% same-day
- Decomposition: 25%, avg 0.8 subtasks
- Location: Jones (75%), Home (25%)
- Jobs: Jones (100%)
- Insight: Small job. Mix of on-site and office work (quote). Shorter than other site visit clusters.

**8. SITE VISIT PATEL OFFICE (4 tasks)**
- Duration: 473 min avg (7.9h), range 180–570 min
- Planning: 100% planned, 100% estimated, 100% timer, 50% has notes
- Lifecycle: 100% same-day
- Decomposition: 75%, avg 4.0 subtasks
- Location: Patel office (100%)
- Jobs: Patel (100%)
- Insight: Largest job. Longest days. Most decomposed. Heaviest subtask counts.

**9. SITE VISIT TAYLOR GARAGE (4 tasks)**
- Duration: 390 min avg (6.5h), range 90–510 min
- Planning: 100% planned, 100% estimated, 100% timer, 25% has notes
- Lifecycle: 100% same-day
- Decomposition: 50%, avg 2.3 subtasks
- Location: Taylor (100%)
- Jobs: Taylor (100%)
- Insight: Medium job. Consistent pattern with other site visits.

### INSUFFICIENT CLUSTERS (2-3 tasks) — selected

**10. COLLECT MATERIALS HENDERSON (3 tasks)**
- Duration: 92 min avg, range 80–110 min
- Planning: 100% planned, 100% estimated, 100% timer
- Location: Roofing supplier (67%), Local merchants (33%)
- Jobs: mixed (Henderson + Smith)
- Insight: Material runs for specific jobs. Duration depends on load.

**11. CLIENT CALLS (clustered across several groups)**
- Duration: 5–20 min
- Planning: 100% reactive
- Lifecycle: 100% same-day
- Decomposition: 0%
- Jobs: various
- Insight: Always reactive. Never estimated. Quick. Job-associated but not location-bound.

**12. QUOTE REROOF HENDERSON (2 tasks)**
- Duration: 95 min avg, range 10–180 min
- Planning: 100% planned, 100% estimated, 100% timer
- Location: Home workshop
- Jobs: Henderson
- Insight: Office work for specific job. Duration varies with complexity.

---

## PART 3 — MOST VALUABLE BEHAVIOURAL INSIGHTS

### 10 Composite Understanding Examples

**1. "Site visits are planned, decomposed, and strongly bound to specific jobs and locations."**
- All site visit clusters: 100% planned, 100% estimated, 100% timer, 100% located, 100% job-tied
- Decomposition rate: 25-75% depending on job complexity
- This is the strongest composite signal in the dataset

**2. "Personal tasks are planned but never timer-tracked, never decomposed, and never attached to jobs."**
- School run, football, garden mowing: 100% planned, 0% timer, 0% decomposed, 0% job-tied
- The timer is a work-vs-personal signal, not just a tracking tool

**3. "Client calls are always reactive, never estimated, and never decomposed."**
- 100% came_up, 0% estimated, 0% decomposed
- They interrupt, they're brief, they don't need planning
- This is a distinct interaction pattern the engine can recognise

**4. "Admin tasks are monthly rituals with consistent duration and location."**
- Accounts: 69 min avg, always Home, always planned
- Receipts: 27 min avg, always Home, always planned
- The consistency itself is information — this person has admin habits

**5. "Material runs are job-associated but location-variable."**
- Sometimes supplier, sometimes merchant
- Duration depends on what's needed (25-110 min)
- Job association is the signal, not the specific location

**6. "Decomposition rate correlates with job complexity, not task type."**
- Henderson: 60% decomposed (complex reroof)
- Patel: 75% decomposed (largest job)
- Taylor: 50% decomposed (medium job)
- Jones: 25% decomposed (simple repair)
- Small jobs get fewer subtasks

**7. "The timer distinguishes work from personal."**
- Work tasks: 78% timer-used
- Personal tasks: 0% timer-used
- This is an implicit classification the user doesn't explicitly make

**8. "Estimates are almost always provided (82%) and roughly accurate (1.1x)."**
- This person knows how long things take
- The engine's estimate blending would have minimal effect here
- But it validates the person's own estimation ability

**9. "Locations cluster around job sites, suppliers, and home."**
- Job locations: Henderson, Smith, Jones, Patel, Williams, Brown, Taylor
- Suppliers: Roofing supplier, Local merchants
- Home: admin, personal
- No random locations — everything has a purpose

**10. "Duration variance is low within clusters, high between clusters."**
- School run: always 25 min
- Garden mowing: 55-60 min
- Site visits: 90-570 min depending on job
- The variance IS the information — it tells you what kind of work this is

---

## PART 4 — MISLEADING / WEAK INSIGHTS

### 1. Staleness observation is misleading for completed tasks
- `observeStaleness` on a completed-only dataset shows "100% completed when old" — meaningless
- The staleness signal only has value when mixed with pending/active tasks
- **Verdict: MISLEADING when applied to completed-only data**

### 2. Same-day completion rate is artificially 100% for site visits
- All site visits show 100% same-day because the task is created and completed in one work session
- This doesn't mean the JOB was completed same-day — it means each VISIT was
- **Verdict: REDUNDANT — confirms the obvious without adding understanding**

### 3. Carryover rate is 0% everywhere
- Because all tasks in the fixture are completed
- In real usage, carryover would be the most interesting lifecycle signal
- **Verdict: INSUFFICIENT — needs mixed pending/completed data**

### 4. Average age (staleness) is misleading
- "Avg age: 207.5 days" for school run is meaningless — it measures time since creation to now, not when it was completed
- For completed tasks, age at completion is more meaningful
- **Verdict: MISLEADING — wrong metric for completed tasks**

### 5. Cluster label is the first task's text, not a semantic label
- "SITE VISIT HENDERSON REROOF ASSESSMENT" is the label, not "Henderson Reroof"
- The label is noisy — it includes the specific day's description
- **Verdict: REDUNDANT — the label is unhelpful but the data is accurate**

### 6. Trend detection is unreliable at small sample sizes
- 2-task clusters showing "stable" or "worsening" from 2 data points
- Not enough data for meaningful trend analysis
- **Verdict: INSUFFICIENT — trend needs ≥5 completions over time**

### 7. Info rate doesn't distinguish meaningful from trivial notes
- "sorted by job" and "Full strip needed. ridge pointing gone" are both counted equally
- **Verdict: REDUNDANT — binary signal loses nuance**

---

## PART 5 — RELATIONSHIPS THE CURRENT ENGINE CANNOT REPRESENT

### WHAT × JOB
The engine sees tasks and jobs as separate data. It cannot express:
- "Site visits belong to the Henderson job"
- "Material runs support specific jobs"
- "Quotes precede jobs"
Current: job_id is a foreign key, not a relationship the engine reasons about

### WHAT × LOCATION
The engine sees location_text as a flat string, not a meaningful place:
- "Henderson" is a customer name, a location, and a job
- "Roofing supplier" is a place Dan visits regularly
- The engine cannot say "this type of work happens at this place"

### WHAT × TIME
No temporal reasoning:
- "Site visits happen during business hours"
- "Admin happens on Friday afternoons"
- "School run happens at 8am on weekdays"
- "Material runs happen early morning before site work"

### WHAT × JOB × LOCATION
The engine cannot express:
- "Site visits to Henderson happen at 52.4521, -1.7434"
- "Material runs for Henderson go to the roofing supplier"
- "Admin always happens at home"

### JOB × LOCATION
Cannot express:
- "Henderson job is at Henderson location"
- "Patel job is at Patel office location"
- The job-location link exists in the data but the engine doesn't reason about it

### LOCATION × TIME
Cannot express:
- "Supplier runs happen early morning"
- "Admin happens at home in the afternoon"
- "Site visits happen during work hours"

### WHAT × DECOMPOSITION
Partially captured (decomposeRate per cluster) but cannot express:
- "This type of work is usually broken down"
- "The decomposition pattern is consistent"

### WHAT × PLANNING STYLE
Partially captured (cameUpRate) but cannot express:
- "Client calls are always reactive"
- "Site visits are always planned"
- The engine can compute this but doesn't store the relationship

### WHAT × STALENESS
Cannot express:
- "This type of task tends to go stale"
- "Tasks at this location tend to stall"
The staleness signal exists but isn't connected to other signals

### SEQUENCING
Cannot express:
- "Site visit → quote → approval → materials → install"
- "Material run often follows a site visit"
- "Invoice follows job completion"
No temporal ordering between task types exists

---

## PART 6 — LOCATION RELATIONSHIP FINDINGS

### What the engine CAN see:
- `location_text` on each task (flat string)
- `lat`/`lng` coordinates on each task
- Which clusters have which locations

### What the engine CANNOT see:
- That "Henderson" (location_text) and "job-henderson" (job_id) refer to the same place
- That "Roofing supplier" and "Local merchants" are different supplier locations
- That coordinates can be compared to determine if two records refer to the same place
- That the home workshop is the default location for admin/office work

### Location co-occurrence patterns in the fixture:
| Location Text | Job IDs | Task Types |
|--------------|---------|------------|
| Henderson | job-henderson | site visits, quote, materials |
| Smith | job-smith | site visits, quote |
| Jones | job-jones | site visits, quote |
| Patel office | job-patel | site visits, quote, materials |
| Williams | job-williams | site visits, quote |
| Brown | job-brown | site visits, quote |
| Taylor | job-taylor | site visits, quote |
| Roofing supplier | various | material runs |
| Local merchants | various | material runs |
| Home workshop | none | admin, quotes, personal |

**Key finding:** There is a strong but implicit relationship between `location_text` and `job_id`. The engine could discover that certain locations are "job sites" vs "suppliers" vs "home" by looking at what task types occur there.

**Coordinate-based deduplication:** The fixture has exact coordinates for each location. In real data, the same place might appear as "Henderson", "Henderson house", "123 Main St Solihull", or with slightly different coordinates. The engine needs fuzzy location matching.

---

## PART 7 — SEQUENCE FINDINGS

### What the fixture data reveals about sequences:

**Job lifecycle pattern (from fixture design):**
```
site visit (assessment)
    ↓
quote
    ↓
(client approval — not tracked)
    ↓
order scaffolding
    ↓
site visit (start work) × N days
    ↓
material runs (interspersed)
    ↓
site visit (finish)
    ↓
scaffold collection
    ↓
invoice
```

**Daily pattern (from task timestamps):**
```
07:00-08:00  material runs (early morning)
08:00-17:00  site visits (work hours)
10:00-11:00  client calls (during work)
14:00-17:00  admin/quotes (afternoon)
16:00-17:30  accounts/receipts (end of day)
19:00-20:30  personal DIY (evening)
```

**What the current engine CANNOT detect:**
1. That material runs precede site visits (same-day ordering)
2. That quotes precede site visits (different-day ordering)
3. That admin clusters at end-of-day
4. That personal tasks happen outside work hours
5. That one site visit logically follows another in a job sequence

**What the engine COULD detect with temporal analysis:**
1. Time-of-day patterns (hour-of-day distribution)
2. Day-of-week patterns
3. Task-type adjacency (what follows what within a day)
4. Job-phase detection (early/late in a job based on task types)

---

## PART 8 — FUTURE CALENDAR CONTEXT IMPLICATIONS

### What a calendar event would look like as a fact:
```
{
  type: 'calendar_event',
  title: 'Meeting — Henderson',
  start: '2026-01-15T10:00:00Z',
  end: '2026-01-15T11:00:00Z',
  location: 'Henderson'
}
```

### What the engine should be able to reason:
1. "Is 'Henderson' a known location?" → Yes, matches job-henderson's location
2. "Is there a job there?" → Yes, job-henderson
3. "Have tasks happened there before?" → Yes, 15 site visits
4. "What activities commonly occur there?" → Site visits, quotes, material runs
5. "Does this meeting affect available time?" → Yes, blocks 10:00-11:00
6. "Is this meeting related to ongoing work?" → Probably, given the job association

### What the engine should NOT do:
- Automatically attach the meeting to the job
- Treat the location match as certain
- Change any existing data
- Infer the meeting's purpose

### Post-event:
- The meeting leaves active context
- Its historical occurrence remains as evidence
- It could influence future scheduling ("Henderson meetings happen on Tuesdays")

### Architecture implication:
Calendar events should be treated as **external facts** that enter the context temporarily. The engine should:
1. Match the event's location against known locations
2. Match the event's timing against known patterns
3. Produce a confidence-scored relationship candidate
4. Leave the event data immutable

---

## PART 9 — PROPOSED WORLD MODEL

### Layer 1: FACTS (already exist in the database)

```
Task {
  id, text, status, source, estimate_mins, actual_mins, logged_mins,
  created_at, completed_at, started_at, surface_date,
  location_text, lat, lng, job_id, info
}

Job {
  id, name, location_text, lat, lng, client
}

Subtask {
  id, task_id, text, done, estimate_mins
}
```

### Layer 2: DERIVED OBSERVATIONS (computed, not persisted)

```
ActivityProfile {
  clusterLabel, count, confidence,
  avgDaysToCompletion, sameDayRate, carryoverRate,
  decomposeRate, avgSubtaskCount,
  cameUpRate, estimatedRate, locatedRate, jobRate,
  staleRate, avgMins, trend
}

UserPatterns {
  totalCompleted, avgEstimateAccuracy,
  cameUpRate, estimatedRate, scheduledRate,
  locatedRate, jobAttachedRate, subtaskUsageRate,
  infoUsageRate, timerUsageRate
}
```

### Layer 3: RELATIONSHIPS (new — derived from facts + observations)

```
Relationship {
  type: string,        // e.g. 'occurs_at', 'belongs_to', 'precedes'
  source: EntityType,  // what
  target: EntityType,  // to what
  confidence: number,  // 0-1
  evidence: Evidence[], // supporting observations
  firstSeen: string,   // ISO date
  lastSeen: string     // ISO date
}

EntityType = { kind: 'task_cluster' | 'job' | 'location' | 'time_pattern', id: string }
Evidence = { kind: string, value: number, sampleSize: number }
```

### Layer 4: CONTEXT (transient — computed per-session)

```
Context {
  activeJobs: Job[],
  knownLocations: Location[],
  currentPatterns: ActivityProfile[],
  recentRelationships: Relationship[],
  calendarEvents: CalendarEvent[]  // future
}
```

### Key design principle:
- Layer 1 (facts) is the database
- Layer 2 (observations) is computed on demand from Layer 1
- Layer 3 (relationships) is computed from Layer 1 + Layer 2, cached with confidence
- Layer 4 (context) is transient, rebuilt per session

---

## PART 10 — PROPOSED RELATIONSHIP MODEL

### Relationship Types:

**1. OCCURS_AT** — A task cluster frequently happens at a location
```
Source: clusterLabel (e.g. "site visit")
Target: location (e.g. "Henderson")
Confidence: based on co-occurrence count / total cluster size
Evidence: [location co-occurrence rate, coordinate match]
```

**2. BELONGS_TO** — A task cluster is strongly associated with a job
```
Source: clusterLabel (e.g. "site visit")
Target: job (e.g. "job-henderson")
Confidence: based on job association rate
Evidence: [job attachment rate, location match with job location]
```

**3. PRECEDES** — One task type commonly follows another
```
Source: clusterLabel (e.g. "quote")
Target: clusterLabel (e.g. "site visit")
Confidence: based on temporal adjacency frequency
Evidence: [same-day or next-day co-occurrence, within-job sequence]
```

**4. PART_OF** — A task is part of a larger job workflow
```
Source: clusterLabel (e.g. "material run")
Target: job (e.g. "job-henderson")
Confidence: based on job_id association
Evidence: [job_id match, location match with job site]
```

**5. HAPPENS_AT_TIME** — A task type has a time-of-day pattern
```
Source: clusterLabel (e.g. "admin")
Target: timePattern (e.g. "afternoon")
Confidence: based on hour-of-day distribution
Evidence: [hour-of-day histogram, consistency across instances]
```

**6. RELATES_TO_LOCATION** — A location has semantic meaning
```
Source: location (e.g. "Henderson")
Target: locationType (e.g. "job_site" | "supplier" | "home")
Confidence: based on what happens there
Evidence: [task type mix, frequency, consistency]
```

### Confidence scoring for relationships:

```
confidence = f(evidence_count, consistency, recency, strength)

evidence_count:  how many observations support this
consistency:     how uniform the evidence is (low variance = high consistency)
recency:         how recently was evidence last seen
strength:        how strong is the signal vs the general pattern
```

Confidence thresholds:
- 0.0-0.3: CANDIDATE (detected but not yet trusted)
- 0.3-0.6: PROBABLE (consistent evidence, moderate count)
- 0.6-0.8: STRONG (high count, high consistency)
- 0.8-1.0: ESTABLISHED (extensive evidence, very consistent)

---

## PART 11 — WHAT SHOULD BE DERIVED VS PERSISTED

### DERIVED (compute on demand, don't persist):

| Signal | How | Why derived |
|--------|-----|-------------|
| Activity profiles | Run observations over CompletedTaskFacts[] | Cheap to compute, depends on data that changes |
| User patterns | Run planning observation over all tasks | Same reasoning |
| Cluster behaviour | Run clusterBehaviour over cluster tasks | Same reasoning |
| Lifecycle stats | Run lifecycle observation | Same reasoning |
| Decomposition stats | Run decomposition observation | Same reasoning |
| Staleness stats | Run staleness observation | Same reasoning |
| Duration trends | Run detectTrend over actuals | Same reasoning |
| Location co-occurrence | Count location × cluster pairs | Cheap, recomputed |
| Time-of-day patterns | Histogram hour-of-day for each cluster | Cheap |

### PERSISTED (store because derivation is expensive or needs history):

| Signal | Why persist |
|--------|-------------|
| Prediction log entries | Must survive session restarts; outcome comparison needs history |
| Relationship confidence scores | Expensive to recompute from scratch; needs incremental update |
| First-open timestamp | Cannot be derived after the fact |
| Reopen count | Cannot be derived after the fact |
| Task interaction history | Cannot be derived after the fact |

### BORDERLINE (persist if performance matters, derive if simplicity matters):

| Signal | Trade-off |
|--------|-----------|
| Activity profiles | Could cache, but cheap enough to recompute |
| Relationship evidence lists | Could cache individual evidence, recompute aggregates |
| Cluster summaries | Could cache, but clustering is fast |

---

## PART 12 — RECOMMENDED NEXT IMPLEMENTATION SLICE

### Scope 3: Relationship Discovery Engine

**Goal:** Given existing facts and observations, discover and score relationships between task clusters, jobs, locations, and time patterns.

**Implementation:**

1. **Location resolver** — Match task locations to job locations using coordinates and text similarity. Produce confidence-scored "this task was at this job's location" relationships.

2. **Cluster-job association** — For each cluster, compute which jobs it's associated with. Store as relationships with confidence.

3. **Temporal sequence detector** — For tasks within the same job, detect common sequences (quote → visit → materials → visit → invoice). Store as PRECEDES relationships.

4. **Time-of-day classifier** — For each cluster, compute hour-of-day distribution. Store as HAPPENS_AT_TIME relationships.

5. **Location type classifier** — From task patterns at each location, classify as job_site / supplier / home / other. Store as RELATES_TO_LOCATION relationships.

**What this enables (future):**
- "You usually do material runs before site visits — want to add that to your routine?"
- "This meeting is at Henderson — you have a job there. Related?"
- "It's Friday afternoon — you usually do admin at this time."
- "You've been to the supplier 3 times this week for the Patel job — is there a bigger order you could consolidate?"

**Non-goals for Scope 3:**
- No persistence of relationship store (derive on demand)
- No UI changes
- No automatic behaviour changes
- No calendar integration
- No LLM/embeddings

### After Scope 3:

**Scope 4: Context-aware scheduling hints**
- Use relationships to suggest task ordering
- Use time patterns to suggest optimal scheduling
- Use location relationships to suggest grouping

**Scope 5: Calendar integration**
- Accept external facts (meetings, appointments)
- Match against known locations/jobs
- Influence available-time calculations

---

## SUMMARY: WHAT WOULD DOKKIT GENUINELY KNOW?

If this were six months of real data, Dokkit would genuinely understand:

**This person is a systematic, planned worker.**
82% of tasks are planned. Estimates are accurate (1.1x). Timer is used consistently for work. The engine can distinguish work from personal by timer usage alone.

**Work tasks follow a predictable pattern.**
Site visits are always planned, always located, always job-tied, usually decomposed. The engine knows what "work" looks like without being told.

**Personal tasks are a distinct category.**
School runs, football pickups, garden mowing — all planned, no timer, no location, no decomposition. The engine can recognise personal tasks by their absence of work signals.

**Client calls are interruptions, not planned work.**
Always reactive, always brief, never decomposed. The engine can identify these as "quick reactive communications" from their planning signature alone.

**Admin is a ritual.**
Monthly accounts, receipt filing — consistent duration, consistent location, consistent timing. The engine knows this person has admin habits.

**Locations have meaning.**
Job sites, suppliers, and home are distinct categories. The engine can infer location type from what happens there.

**Decomposition correlates with complexity.**
Big jobs get subtasks. Simple tasks don't. The engine can predict whether a new task will need decomposition based on its cluster's historical pattern.

**What Dokkit CANNOT yet know:**
- Sequences between task types
- Time-of-day patterns
- That certain locations are the same place
- That a calendar event relates to an existing job
- What "usually happens next" after a given task

That is what Scope 3 and beyond would provide.
