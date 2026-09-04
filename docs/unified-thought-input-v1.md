# Unified Thought Input V1

## Overview

V1 makes documenting something in Dokkit as easy as possible: the user types
**one thought** and Dokkit works out which facets belong to it, instead of
forcing the user to first decide "is this a Task, a Job, where, when?"

Today the user is effectively forced to maintain relationships by hand — create
something in Today, then manually attach it to a Job; or create it in a Job, then
make sure it also lives in Today. That is the wrong responsibility boundary:
**the user thinks in thoughts, Dokkit thinks in relationships.**

```text
ONE THOUGHT / ACTION
        │
        ├── action/task
        ├── date
        ├── time
        ├── job/context
        ├── location
        └── original user input
                │
                ▼
        ONE UNDERLYING OBJECT
```

Today, Jobs and Travel are increasingly different **views/lenses** over the same
underlying information. This task is the first practical step in that direction.

V1 is deliberately small. It proves three things, nothing more:

1. **One-input principle** — express a thought without first classifying it.
2. **Automatic-relationship principle** — Dokkit resolves what it can, safely.
3. **One-object / multiple-view principle** — a task with a Job and a date shows
   in both Today and the Job without ever duplicating the record.

No LLM, no external AI service, no embeddings, no large NLP framework, no
general-purpose natural-language parser. Everything is deterministic and built
on the existing entities, data structures, and date handling already in the
app.

---

## The four product principles (required)

### 2.1 Capture first, resolve ambiguity second
Never block capture on classification. The user may enter

> "Belgium Rd tomorrow at 10am to measure Rainwater Head"

without first picking Task / Job / Location / Travel / Note / Subtask. Dokkit
captures the thought, then resolves whatever relationships it reliably can.

### 2.2 Ask when necessary — never silently invent
Dokkit may identify a likely interpretation but must **not** silently assert
uncertain information.

* exactly one reliable candidate → ask: *"Do you mean 14 Belgium Road?"*
* multiple plausible matches      → show the choices: *"Which Belgium Road?"*
* no reliable match               → leave the relationship unresolved.

Never invent a job, address, category, person, or semantic meaning. "Rainwater
Head" stays the user's text unless the existing model already has a confirmed
concept for it.

### 2.3 Minimise decisions required from the user
The system does the relationship maintenance. The user should not think "I need
to add this to Today *and then* add it to the Belgium Road job." They enter the
thought once.

### 2.4 One object, multiple views
If a task is associated with a Job **and** is temporally relevant today/tomorrow,
it appears in both Today and the Job — from **one** task record, never two.

```text
Task #123
  action        = "measure Rainwater Head"
  job           = Belgium Road
  location      = 14 Belgium Road
  intendedAt    = tomorrow 10:00
  originalInput = "Belgium Rd tomorrow at 10am to measure Rainwater Head"

        ↓
Today  → displays Task #123
Jobs   → displays Task #123
```

No duplicate storage. (Structurally this is already true — a Task's
`surface_date` and `job_id` are independent facets, so Today filters by date and
the Job page groups by `job_id`, both pointing at the same row. V1 preserves and
exploits this rather than reintroducing duplication.)

---

## V1 scope

The minimum useful facets for V1:

| Facet            | Storage                                                        |
| ---------------- | -------------------------------------------------------------- |
| task/action text | `tasks.text`                                                   |
| date             | `tasks.surface_date` (`YYYY-MM-DD`)                            |
| time             | `tasks.intended_time` (`HH:MM`) — **new column**               |
| job association  | `tasks.job_id` (existing FK)                                   |
| location         | `tasks.location_text` / `lat` / `lng` (existing inline fields) |
| original input   | `tasks.original_input` — **new column**                        |
| resolution state | UI-level `proposed` / `choose` / `none` before writing         |

Two new nullable columns are added to `tasks`, following the existing idempotent
migration pattern in `supabase/schema.sql`:

```sql
alter table tasks add column if not exists original_input text;
alter table tasks add column if not exists intended_time text; -- 'HH:MM'
```

---

## Architecture

Everything lives under `lib/unifiedInput/` as pure, framework-free functions so
the interpretation is unit-testable and uses only existing deterministic
infrastructure (`localDateStr`, jobs data, task data).

### `lib/unifiedInput/parse.ts`

`parseThought(raw: string, today: string): ThoughtParts`

Deterministic, rule-based, token-level extraction:

| Output             | Meaning                                             |
| ------------------ | --------------------------------------------------- |
| `intent` / action  | remaining text after date/time tokens are removed   |
| `date`             | resolved `surface_date` (`YYYY-MM-DD`) or `null`    |
| `time`             | resolved clock time (`HH:MM`) or `null`             |
| `locationHint`     | a location-ish phrase to resolve against jobs       |
| `matchedTokens`    | what was consumed, for showing the user             |
| `originalInput`    | the raw string, unchanged                           |

Date rules (relative to a supplied local `today`): `today`, `tomorrow`,
`tonight` (→ today), weekday names (`monday`…, optional `next` / `this`).

Time rules: `10am`, `10 pm`, `10:30`, `10:00`, `10:30am`, `7pm`.

Extraction is **attributive**: only a token that is recognisably a date or time
word is removed. Everything else is preserved verbatim, so regular task text is
never mangled. If nothing date/time-like is found, `intent` is the whole string
and both `date` and `time` are `null` — a plain task, unchanged behaviour.

### `lib/unifiedInput/resolve.ts`

`resolveJobAndLocation(parts: ThoughtParts, jobs: Job[]): JobLocationResolution`

Searches the user's existing jobs by **name** and by **location_text** for a
plausible fuzzy match against the location-ish phrase. Returns a resolution with
a discrete state (modelled on the existing `DecisionAuthority` discipline):

| State      | Meaning                                                            | UI               |
| ---------- | ------------------------------------------------------------------- | ---------------- |
| `none`     | no reliable candidate; leave unresolved, never invent               | (no prompt)      |
| `proposed` | exactly one reliable candidate; ask for confirmation                | "Do you mean…?"  |
| `choose`   | multiple plausible candidates; let the user pick                    | "Which one…?"    |

The resolver never creates a Job, address, or category — it only matches against
Jobs the user already has. Matching is conservative: a candidate must share
enough distinctive tokens (`belgium`/`road`, or the job's own name/location) to
be considered reliable.

### Capture-flow integration

The existing Today `CaptureSheet` accepts the full thought in its single text
field. As the user types, `parseThought` runs live and:

* pre-fills the existing date / location / job fields when a facet is clear;
* sets `intended_time` for a parsed clock time;
* for job/location resolution, renders the confirmation UI:
  * `proposed` → *"Do you mean **14 Belgium Road**?"* with Confirm / Not this;
  * `choose`   → the list of matching Jobs;
  * `none`     → nothing (unresolved stays unresolved).

On Add, **one** task row is written with the resolved action as `text`,
`surface_date`, `intended_time`, confirmed `job_id` / location, and
`original_input` set to the user's raw sentence — so nothing the user typed is
ever lost, and the resolved facets are all explicit (never silently invented).

---

## Acceptance scenario

From Today, the user enters:

> "Belgium Rd tomorrow at 10am to measure Rainwater Head"

Dokkit:

1. captures the original input;
2. identifies the likely action → **"measure Rainwater Head"**;
3. identifies **tomorrow** and **10:00**;
4. searches the known Jobs/locations for a plausible Belgium Road match;
5. if exactly one reliable candidate exists, asks:
   > **"Do you mean 14 Belgium Road?"**
   (if several: "Which Belgium Road?" shows the choices; if none: unresolved).

On confirmation, a single Task is created that appears in both **Today** (dated
tomorrow) and the matched **Job**, from one record.

---

## Out of scope (deliberately)

* An LLM, embedding model, or general NLP parser — forbidden for V1.
* Creating new Jobs, locations, categories, or people from free text.
* A standalone "Thoughts" table or persistence layer for unresolved/proposed
  thoughts beyond the capture confirmation step.
* Travel-lens reasoning over task locations (mentioned as future direction only).
* Replacing the existing CaptureSheet's manual fields — V1 augments it.
