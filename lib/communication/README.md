# Dokkit Communication & Language Engine

Deterministic. No LLM. No Whisper.

## Modules

| Module | Role |
|--------|------|
| `understand` | Deterministic language understanding |
| `meeting` | Aggregate utterances → MeetingUnderstanding |
| `speaker` | Soft Customer/Us/Note attribution on observations |
| `review` | Accept / edit / reject → TaskDrafts |
| `export` | Client-facing summary (agreed vs to-confirm) |
| `learning` / `feedback` | Per-user evidence-based learning |

## Quick use

```ts
import {
  processMeetingConversation,
  observationsToUtterances,
  createReviewSession,
  finaliseReview,
  buildClientMeetingSummary,
  formatObservationText,
} from '@/lib/communication';

// From saved observations (with Customer:/Us: prefixes)
const utterances = observationsToUtterances(observations);
const understanding = processMeetingConversation(meetingId, utterances);

const session = createReviewSession(understanding, { jobId });
// … user reviews …
const { taskDrafts } = finaliseReview(session);

const summary = buildClientMeetingSummary(understanding, {
  projectName: 'Smith Residence',
});
```
