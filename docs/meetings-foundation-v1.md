# Meetings Foundation V1

A Meeting is a block of time where people came together around a Job. This
foundation makes Meetings a first-class place in Dokkit — one identity shared
by every surface, not another silo.

## Where Meetings fits

Dokkit's surfaces (Today, Jobs, Travel) are already views over one practical
reality. The pre-existing `meetings` table IS that reality for meetings:
Today's capacity math counts `start_time` + `duration_mins`, and Outlook sync
writes `source='outlook'` rows into it. So V1 **extends the same `meetings`
row additively** instead of creating a parallel meeting entity:

- `job_id`, `location_text`, `lat`, `lng` — the exact optional
  Job/location relationship Tasks use. A Meeting can be *about* a Job and
  *at* a place.
- `notes` — raw capture, the source evidence.
- `summary` — the derived-minutes seam. Null in V1; a future derivation
  step populates it. Never auto-generated here.

Everything is nullable and additive. Today's `(id, text, duration_mins,
start_time)` read and Outlook sync are untouched. Deleting a job detaches
the meeting (set null), exactly like Tasks.

## The relational structure (evidence first, minutes derived)

New related tables, each owned by the standard `own X` RLS policy and
cascading up through `meetings → auth.users` (account deletion stays
automatic):

| Table | Represents | Notes |
| --- | --- | --- |
| `meeting_participants` | Meeting → involves → Person | Freeform names; Dokkit has no Person entity yet. A future `person_id` link drops in without reshaping the table. |
| `meeting_observations` | Meeting → captured → Observation | **One contextual observation.** A photo + voice note + line of text captured together are a single row. |
| `meeting_media` | Observation → contained → Media (photo/audio/document) | **Device-local references only in V1.** `local_uri` points at the file/blob on the device; nothing is uploaded to Supabase. |
| `meeting_decisions` | Meeting → decided → Decision | e.g. "the flashing gets replaced, not repaired". |
| `meeting_actions` | Meeting → produced → Action | `task_id` is the seam for ONE underlying action: a promoted action links to the existing task (and, through the meeting's `job_id`, to the Job and Today) instead of being copied. Null until promoted. |

The split matters: `meeting_observations` + `meeting_media` + `meetings.notes`
are the evidence; `meetings.summary` is the derived interpretation. Sharing/
export later packages the evidence without blocking on it.

## Reuse, not duplication

- **One parser.** "Meeting with Tim at Belgium Rd tomorrow at 2pm" runs
  through the exact same `parseThought` + `resolveJobAndLocation` that
  Unified Thought Input uses. `parseMeetingInput` in `lib/meetingUtils.ts`
  calls them and returns the capture preview — the meeting sheet has no
  parser of its own.
  - Work found under this: the road-phrase extractor previously swallowed
    up to 40 characters *in front of* a mid-sentence road. "Meeting with
    Tim at Belgium Rd…" meant "location: Meeting with Tim at Belgium Rd"
    and an empty intent. The extractor now takes only the one-or-two-token
    name directly before the suffix and drops a leading preposition, so
    the meeting pattern resolves correctly. Dictated by the meeting case,
    strictly narrower, fully covered by tests.
- **One action.** Meeting actions are recorded against the meeting; when an
  action is promoted, `task_id` makes it the same underlying action across
  Today/Jobs/Travel — never a duplicate.
- **One meeting identity.** The row Today counts is the same row the
  Meetings page edits.

## What V1 does NOT do

No LLM, no transcription, no minutes generation, no calendar/Outlook
integration, no sharing/export, no media upload pipeline, no trip linking,
no Person entity, no automatic minutes (summary stays nullable), and no
promote-action-to-task flow (the `task_id` column exists; the flow is a
future phase). The Meetings nav entry is not wired into Personal Gravity's
`Surface` union — it navigates without feeding surface analysis.

## Files

- `supabase/schema.sql` — additive meetings columns, five related tables,
  RLS policies, indexes (migration section, rerunnable).
- `lib/meetingTypes.ts` — TS models.
- `lib/meetingUtils.ts` — helpers + `parseMeetingInput`.
- `lib/meetingUtils.test.ts` — unit tests.
- `lib/unifiedInput/parse.ts` (+ tests) — narrow road-phrase extraction fix.
- `components/MeetingSheets.tsx` — `NewMeetingSheet`, `MeetingMediaCapture`.
- `app/meetings/page.tsx` — list (upcoming / past) + record.
- `app/meetings/[meetingId]/page.tsx` — detail (people, observations,
  decisions, actions, notes) + local media.
- `components/SurfaceNav.tsx` — Meetings entry (outside Gravity).
- `app/globals.css` — additive meetings styles.