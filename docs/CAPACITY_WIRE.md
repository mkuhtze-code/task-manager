# Capacity wire — meetings + travel into runCaptureDock

**Status:** Engine ready. UI patch prepared; apply from project artifacts.

## Engine (already on main)

`lib/engine/captureDock.ts` accepts:

- `meetings?: { id, text, startAt }[]`
- `travelMins?: number | null`
- `visitDurationMins?: number | null`

ANSWER path uses these via V3 `decideTaskFit`.

## UI apply (local)

```bash
# Copy capacity-wired files (from Grok project artifacts or paths below)
cp CaptureSheet-capacity-wire.tsx components/CaptureSheet.tsx
cp TodayPage-capacity-wire.tsx components/today/TodayPage.tsx
git add components/CaptureSheet.tsx components/today/TodayPage.tsx
git commit -m "feat(capture): runCaptureDock + live meetings/travel for ANSWER"
git push origin main
```

### What changes

1. **CaptureSheet** `tryDock` → `runCaptureDock` → `processInteraction`
2. Props: `dockMeetings`, `travelMins`, `visitDurationMins`
3. **TodayPage** passes `todayMeetings` + today's `calendarEvents` + `routeDriveMins`

### Smoke test

Open Capture with a job in focus and a meeting later today:

> Have I got time to go see this job this afternoon?

Expect ANSWER text (no task created) and evidence that capacity was considered.
