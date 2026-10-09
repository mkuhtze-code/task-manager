'use client';

/**

* Capture — pen to paper.
* Primary path: type (or speak) → Dock.
* Speech goes through processCaptureSpeech before filling the line.
* List phrases map onto tasks + subtasks (taskListBridge), not collections tables.
  */

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type {
EstimateSuggestion,
LocationSuggestion,
JobSuggestion,
LocationMemorySuggestion,
} from '@/lib/taskIntelligence';
import type { CaptureContextDecision } from '@/lib/thinking/types';
import { fmtMins, minsToInput, fmtClock } from '@/lib/timeFormat';
import type { Job } from '@/lib/jobTypes';
import type { ThoughtParts } from '@/lib/unifiedInput/parse';
import {
hasEntityResolution,
type JobLocationResolution,
type JobLocationCandidate,
} from '@/lib/unifiedInput/resolve';
import { oneShotGate } from '@/lib/unifiedInput/oneShot';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import MicButton from '@/components/MicButton';
import { useCaptureSpeech, textForCaptureField } from '@/hooks/useCaptureSpeech';
import {
captureIsCollectionMutation,
detectCaptureCollection,
type SpeechUnderstandingContext,
} from '@/lib/speech';
import type { CollectionIntent } from '@/lib/collections';
import {
applyListIntent,
detectListIntent,
loadActiveListState,
canUseActiveList,
type TaskListOps,
type ListTaskCandidate,
} from '@/lib/speech/taskListBridge';
import {
hydrateEngineStateRemote,
loadActiveRequestLocal,
type EngineRequest,
type LearningEvidence,
type WorkingMemorySnapshot,
} from '@/lib/engine';
import { runCaptureDock, loadPriorForDock } from '@/lib/engine/captureDock';
import { executeCpuDecision } from '@/lib/cpu';
import { MapPinIcon } from '@/components/icons';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { shouldShowEstimateHint, markEstimateHintSeen } from '@/lib/uxFlags';

/** Optional structured dock from the personal operating engine. */
export type EngineDockOverrides = {
text: string;
locationText?: string | null;
jobId?: string | null;
surfaceDate?: string | null;
estimateMins?: number;
originalInput?: string;
explanation?: string;
updateTaskId?: string;
engineRequest?: EngineRequest;
evidence?: LearningEvidence[];
workingMemory?: WorkingMemorySnapshot;
};

export function CaptureSheet(props: {
taskText: string;
setTaskText: React.Dispatch<React.SetStateAction<string>>;
taskTime: string;
setTaskTime: (v: string) => void;
captureSuggestion: EstimateSuggestion | null;
captureLocationSuggestion: LocationSuggestion | null;
captureLocationMemorySuggestion: LocationMemorySuggestion | null;
captureJobSuggestion: JobSuggestion | null;
captureContext: CaptureContextDecision | null;
locationFieldVisible: boolean;
addTask: () => void;
captureLocation: string;
setCaptureLocation: (v: string) => void;
captureLocationCoords: { lat: number; lng: number } | null;
setCaptureLocationCoords: (c: { lat: number; lng: number } | null) => void;
manualLocationToggle: boolean;
setManualLocationToggle: (v: boolean) => void;
showReminderField: boolean;
setShowReminderField: (v: boolean) => void;
captureSurfaceDate: string;
setCaptureSurfaceDate: (v: string) => void;
jobs: Job[];
captureJobId: string | null;
setCaptureJobId: (v: string | null) => void;
thought: ThoughtParts | null;
intendedTime: string;
locationResolution: JobLocationResolution | null;
declinedResolution: boolean;
onConfirmResolution: (c: JobLocationCandidate) => void;
onDeclineResolution: () => void;
confirmedJobId?: string | null;
durationExplain?: string | null;
error: string;
onClose: () => void;
userId?: string | null;
listOps?: TaskListOps | null;
listTasks?: ListTaskCandidate[];
/** When set, dock may pass engine-structured fields instead of only the text line. */
addTaskWithOverrides?: (o: EngineDockOverrides) => void | Promise<string | null>;
/** Remaining capacity today (mins) for engine planning. */
remainingMinsToday?: number | null;
/** Timed meetings / calendar for ANSWER feasibility. */
dockMeetings?: Array<{ id: string; text: string; startAt?: string | null }>;
/** Route travel minutes for capacity reasoning. */
travelMins?: number | null;
/** Optional on-site visit duration for feasibility questions. */
visitDurationMins?: number | null;
}) {
const {
taskText,
setTaskText,
taskTime,
setTaskTime,
captureSuggestion,
captureLocationSuggestion,
captureLocationMemorySuggestion,
captureJobSuggestion,
captureContext,
locationFieldVisible,
addTask,
captureLocation,
setCaptureLocation,
captureLocationCoords,
setCaptureLocationCoords,
manualLocationToggle,
setManualLocationToggle,
showReminderField,
setShowReminderField,
captureSurfaceDate,
setCaptureSurfaceDate,
jobs,
captureJobId,
setCaptureJobId,
thought,
intendedTime,
locationResolution,
declinedResolution,
onConfirmResolution,
onDeclineResolution,
confirmedJobId = null,
durationExplain = null,
error,
onClose,
userId = null,
listOps = null,
listTasks = [],
addTaskWithOverrides,
remainingMinsToday = null,
dockMeetings = [],
travelMins = null,
visitDurationMins = null,
} = props;

const [showJobField, setShowJobField] = useState(false);
const [showTimeField, setShowTimeField] = useState(false);
const [moreOpen, setMoreOpen] = useState(false);
const [estimateHintVisible, setEstimateHintVisible] = useState(false);
const [collectionFeedback, setCollectionFeedback] = useState<string | null>(null);
const [listBusy, setListBusy] = useState(false);
const [pendingClarification, setPendingClarification] = useState<{
spoken: string;
candidates: Array<{ taskId: string; title: string; reason: string }>;
pendingIntent: Exclude<CollectionIntent, { type: 'clarification_required' }> | null;
} | null>(null);
const [enginePriorRequest, setEnginePriorRequest] = useState<EngineRequest | null>(() =>
loadActiveRequestLocal(userId)
);
const [engineHydratedUserId, setEngineHydratedUserId] = useState<string | null>(null);
const engineStateReady = !userId || engineHydratedUserId === userId;
const [engineExplain, setEngineExplain] = useState<string | null>(null);
const { speechStatus, processSpokenText, clearSpeechStatus, confirmSpeechLearning } =
useCaptureSpeech({
userId,
});

// Hydrate the account-scoped remote snapshot before allowing a capture to
// execute. This makes cross-session references available on a fresh device
// and prevents a stale local request from winning over the remote state.
useEffect(() => {
let cancelled = false;
if (!userId) {
  setEnginePriorRequest(null);
  setEngineHydratedUserId(null);
  return () => { cancelled = true; };
}

setEngineHydratedUserId(null);
void hydrateEngineStateRemote(supabase as never, userId).then(({ activeRequest }) => {
  if (cancelled) return;
  setEnginePriorRequest(activeRequest);
  setEngineHydratedUserId(userId);
}).catch(() => {
  if (cancelled) return;
  setEnginePriorRequest(loadActiveRequestLocal(userId));
  setEngineHydratedUserId(userId);
});

return () => { cancelled = true; };
}, [userId]);

function buildSpeechContext(): SpeechUnderstandingContext {
const jobEntities =
jobs?.map((j) => ({
id: j.id,
label: j.name,
kind: 'job' as const,
aliases: j.name ? [j.name.split(' ')[0]].filter(Boolean) : [],
})) ?? [];

const focus =
  captureJobId != null
    ? [captureJobId]
    : jobEntities.length === 1
      ? [jobEntities[0].id]
      : undefined;

return {
  jobs: jobEntities,
  people: [],
  focusEntityIds: focus,
};

}

function buildCollectionContext() {
const active = loadActiveListState();
const eligible = canUseActiveList(active);

return {
  activeCollectionId: eligible ? active.taskId : null,
  activeCollectionTitle: eligible ? active.title : null,
  collections: (listTasks ?? []).map((t) => ({
    id: t.id,
    userId: userId ?? '',
    title: t.text,
    normalizedTitle: t.text.toLowerCase(),
    collectionType: 'generic' as const,
    status: 'open' as const,
    contextType: null as null,
    contextId: null as null,
    aliases: [] as string[],
    isActive: active.taskId === t.id,
    createdAt: '',
    updatedAt: '',
    lastActivityAt: '',
    closedAt: null as null,
  })),
  jobs: (jobs ?? []).map((j) => ({ id: j.id, name: j.name })),
  msSinceLastActivity: active.lastInteractionAt
    ? Date.now() - Date.parse(active.lastInteractionAt)
    : null,
};

}

function onSpeechResult(spoken: string) {
const uid = userId ?? 'anon';
const collectionContext = buildCollectionContext();

const result = processSpokenText(spoken, {
  understandingContext: buildSpeechContext(),
  userId: uid,
  collectionContext,
});

if (!result) {
  setTaskText((prev) => (prev ? `${prev.trim()} ${spoken}` : spoken));
  return;
}

const next = textForCaptureField(result);

setTaskText((prev) => {
  if (!prev.trim()) return next;
  if (next.toLowerCase().includes(prev.trim().toLowerCase())) return next;
  return `${prev.trim()} ${next}`;
});

}

useEffect(() => {
setEstimateHintVisible(shouldShowEstimateHint());
}, []);

useEffect(() => {
if (captureJobId) return;

if (
  captureContext &&
  captureContext.authority !== 'observe' &&
  captureContext.suggestedJobId
) {
  const suggestedJob = jobs.find((j) => j.id === captureContext.suggestedJobId);
  if (suggestedJob) setCaptureJobId(suggestedJob.id);
}

}, [captureContext, captureJobId, jobs, setCaptureJobId]);

useEffect(() => {
if (locationFieldVisible || manualLocationToggle || captureLocation.trim()) {
setMoreOpen(true);
setManualLocationToggle(true);
}
}, [locationFieldVisible]); // eslint-disable-line react-hooks/exhaustive-deps

useEffect(() => {
if (showReminderField || captureSurfaceDate) setMoreOpen(true);
}, [showReminderField, captureSurfaceDate]);

useEffect(() => {
if (captureJobId || showJobField) setMoreOpen(true);
}, [captureJobId, showJobField]);

const dialogRef = useDialogA11y(onClose);

const gate = oneShotGate({
rawText: taskText,
thought,
locationResolution,
declinedResolution,
confirmedJobId: confirmedJobId ?? null,
});

const chosenJob =
captureJobId != null ? jobs.find((j) => j.id === captureJobId) ?? null : null;

/**

* An explicit confirmation/selection is authoritative for this capture.
*
* The resolver may briefly continue reporting `proposed` or `choose` while
* parent state and derived interpretation settle. That must never re-lock
* Dock after the user has already answered the question.
*
* Skip is likewise an explicit decision and is already represented by
* declinedResolution.
  */
  const resolutionNeedsAttention =
  confirmedJobId == null &&
  !declinedResolution &&
  !!locationResolution &&
  (locationResolution.state === 'proposed' ||
  locationResolution.state === 'choose');

const showEstimateChip =
!!captureSuggestion &&
(captureSuggestion.confidence !== 'low' || captureSuggestion.source === 'measured');

const hasOptionalActive =
!!taskTime.trim() ||
!!captureLocation.trim() ||
!!captureJobId ||
!!captureSurfaceDate ||
showTimeField ||
manualLocationToggle ||
showReminderField ||
showJobField;

/** Live list intent from the capture line (not only speech result). */
const liveListIntent = (() => {
const line = taskText.trim();
if (!line) return null;

const ctx = buildCollectionContext();
const detected = detectCaptureCollection(line, ctx);
const fallback = detectListIntent(line, listTasks);

return detected?.intent ?? fallback;

})();

const isLiveListIntent =
!!liveListIntent &&
(liveListIntent.type === 'create_collection' ||
liveListIntent.type === 'append_collection' ||
liveListIntent.type === 'complete_collection_items' ||
liveListIntent.type === 'remove_collection_items' ||
liveListIntent.type === 'update_collection_item' ||
liveListIntent.type === 'close_collection' ||
liveListIntent.type === 'reopen_collection' ||
liveListIntent.type === 'query_collection' ||
liveListIntent.type === 'clarification_required');

const collectionDockReady =
isLiveListIntent ||
(!!speechStatus?.result &&
!!speechStatus.result.collection &&
(captureIsCollectionMutation(speechStatus.result) ||
speechStatus.result.uiMode === 'collection_clarification'));

// List mutations use their own target resolution — don't block on job confirm.
const resolutionBlocksDock =
resolutionNeedsAttention && !isLiveListIntent;

async function applyListDock(intent: CollectionIntent) {
if (!listOps) {
setCollectionFeedback('List actions need an active session.');
return;
}

if (intent.type === 'clarification_required') {
  setPendingClarification({
    spoken: intent.spoken,
    candidates: intent.candidates.map((c) => ({
      taskId: c.collectionId,
      title: c.title,
      reason: c.reason,
    })),
    pendingIntent: intent.pendingIntent,
  });
  setCollectionFeedback(null);
  return;
}

setListBusy(true);

try {
  const applied = await applyListIntent(intent, listOps);

  confirmSpeechLearning();
  clearSpeechStatus();
  setPendingClarification(null);

  if (applied.needsClarification) {
    setPendingClarification(applied.needsClarification);
    setCollectionFeedback(applied.message);
  } else {
    setCollectionFeedback(
      applied.message || (applied.ok ? 'List updated.' : 'Could not update list.')
    );
    setTaskText('');

    if (applied.openTaskId) {
      onClose();
    }
  }
} finally {
  setListBusy(false);
}

}

function resolveClarification(taskId: string) {
if (!pendingClarification?.pendingIntent) {
setPendingClarification(null);
return;
}

const pending = pendingClarification.pendingIntent;
let next: CollectionIntent = pending;

if ('target' in pending) {
  next = {
    ...pending,
    target: { kind: 'id', collectionId: taskId },
  } as CollectionIntent;
}

void applyListDock(next);

}

async function tryDock() {
if (!engineStateReady) return;
const speechResult = speechStatus?.result ?? null;

// The capture field is authoritative at Dock time.
// Speech classification is an interpretation aid, not a persistent mode.
// In particular, an active list must never turn an explicit new task into
// another list item just because the speech result carried a collection
// interpretation from the active-list context.
let collectionIntent: CollectionIntent | null = null;

if (taskText.trim()) {
  const ctx = buildCollectionContext();
  const detected = detectCaptureCollection(taskText.trim(), ctx);
  const fallback = detectListIntent(taskText.trim(), listTasks);
  collectionIntent = detected?.intent ?? fallback;
}

// Only use a speech-only collection result when there is no current capture
// text to classify. This prevents stale/over-eager collection classification
// from blocking an explicit task capture.
if (!taskText.trim() && speechResult?.collection?.intent) {
  collectionIntent = speechResult.collection.intent;
}

const isListIntent =
  !!collectionIntent &&
  (collectionIntent.type === 'create_collection' ||
    collectionIntent.type === 'append_collection' ||
    collectionIntent.type === 'complete_collection_items' ||
    collectionIntent.type === 'remove_collection_items' ||
    collectionIntent.type === 'update_collection_item' ||
    collectionIntent.type === 'close_collection' ||
    collectionIntent.type === 'reopen_collection' ||
    collectionIntent.type === 'query_collection' ||
    collectionIntent.type === 'clarification_required');

if (isListIntent && collectionIntent) {
  if (!listOps) {
    setCollectionFeedback('Sign in to use lists.');
    return;
  }

  void applyListDock(collectionIntent);
  return;
}

// Personal operating engine — processInteraction via runCaptureDock.
// Outcomes: ACT / ANSWER / DEFER / CLARIFY / fallthrough → ordinary dock.
const line = taskText.trim();

if (line && addTaskWithOverrides) {
  try {
    const prior = loadPriorForDock(userId) ?? enginePriorRequest ?? null;

    const dock = runCaptureDock({
      line,
      userId: userId ?? null,
      priorRequest: prior,
      jobs: jobs.map((j) => ({
        id: j.id,
        name: j.name,
        locationText: j.location_text ?? null,
      })),
      captureJobId,
      captureSurfaceDate,
      remainingMinsToday,
      openTaskCount: listTasks.length,
      inputType: speechStatus?.result ? 'speech_transcript' : 'text',
      meetings: dockMeetings,
      travelMins,
      visitDurationMins,
    });

    if (dock.request) {
      setEnginePriorRequest(dock.request);
    }

    if (dock.kind === 'act_create' || dock.kind === 'act_update') {
      setEngineExplain(dock.message);
      setCollectionFeedback(dock.message);
      confirmSpeechLearning();
      clearSpeechStatus();
      const execution = await executeCpuDecision(dock.cpuCycle, {
        tasks: {
          createTask: async (action) => {
            if (!addTaskWithOverrides) {
              throw new Error('Capture task executor is not connected.');
            }

            return (await addTaskWithOverrides({
              text: action.text,
              locationText: action.locationText,
              jobId: action.jobId,
              surfaceDate: action.surfaceDate,
              estimateMins: action.estimateMins ?? undefined,
              originalInput: dock.overrides.originalInput,
              explanation: dock.overrides.explanation,
              engineRequest: dock.overrides.engineRequest,
              evidence: dock.overrides.evidence,
              workingMemory: dock.overrides.workingMemory,
            })) ?? null;
          },
          updateTask: async (action) => {
            if (!addTaskWithOverrides) {
              throw new Error('Capture task executor is not connected.');
            }

            await addTaskWithOverrides({
              text: action.text ?? dock.overrides.text,
              locationText: action.locationText,
              jobId: action.jobId,
              surfaceDate: action.surfaceDate,
              estimateMins: action.estimateMins ?? undefined,
              originalInput: dock.overrides.originalInput,
              explanation: dock.overrides.explanation,
              updateTaskId: action.taskId,
              engineRequest: dock.overrides.engineRequest,
              evidence: dock.overrides.evidence,
              workingMemory: dock.overrides.workingMemory,
            });
          },
        },
      });

      if (execution.execution?.status === 'executed') {
        return;
      }

      setCollectionFeedback(
        execution.execution?.message || 'Could not complete that action.'
      );
      return;
    }

    if (dock.kind === 'answer') {
      setEngineExplain(dock.message);
      setCollectionFeedback(dock.message);
      return;
    }

    if (dock.kind === 'defer') {
      setEngineExplain(dock.message);
      setCollectionFeedback(dock.message);
      confirmSpeechLearning();
      clearSpeechStatus();

      if (dock.clearLine) {
        setTaskText('');
      }

      return;
    }

    if (dock.kind === 'clarify') {
      setEngineExplain(dock.message);
      setCollectionFeedback(dock.message);
      return;
    }

    if (dock.kind === 'fallthrough' && dock.message) {
      setEngineExplain(dock.message);
      setCollectionFeedback(dock.message);
    }
  } catch (err) {
    console.error('processInteraction dock', err);
  }
}

if (!gate.ready) return;

confirmSpeechLearning();
clearSpeechStatus();
addTask();

}

function applySuggestedMins() {
if (!captureSuggestion) return;

setTaskTime(minsToInput(captureSuggestion.suggestedMins));
setShowTimeField(true);
setMoreOpen(true);

if (estimateHintVisible) {
  markEstimateHintSeen();
  setEstimateHintVisible(false);
}

}

return ( <div className="sheet-overlay" onClick={onClose}>
<div
className="sheet-panel capture-sheet capture-sheet-paper capture-sheet-product"
role="dialog"
aria-modal="true"
aria-labelledby="capture-sheet-title"
aria-describedby={error ? 'capture-error' : undefined}
ref={dialogRef}
onClick={(e) => e.stopPropagation()}
> <div className="capture-sheet-header"> <h2 id="capture-sheet-title" className="capture-sheet-title">
        Capture
      </h2>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          className="btn-text capture-sheet-close"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>

    <div className="capture-text-row">
      <input
        id="capture-task-text"
        type="text"
        value={taskText}
        onChange={(e) => {
          setTaskText(e.target.value);

          if (speechStatus) {
            clearSpeechStatus();
          }

          if (collectionFeedback) {
            setCollectionFeedback(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            tryDock();
          }
        }}
        placeholder="What needs doing…"
        autoComplete="off"
        autoFocus
        aria-invalid={!!error}
        aria-describedby={error ? 'capture-error' : undefined}
      />

      <MicButton onResult={onSpeechResult} />
    </div>

    {speechStatus && speechStatus.message ? (
      <div
        className={`capture-speech-status capture-speech-status-${speechStatus.tone}`}
        role="status"
        aria-live="polite"
      >
        <span>{speechStatus.message}</span>

        <button
          type="button"
          className="btn-text capture-speech-status-dismiss"
          onClick={clearSpeechStatus}
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      </div>
    ) : null}

    {collectionFeedback ? (
      <div
        className="capture-speech-status capture-speech-status-propose"
        role="status"
        aria-live="polite"
      >
        <span>{collectionFeedback}</span>

        <button
          type="button"
          className="btn-text capture-speech-status-dismiss"
          onClick={() => setCollectionFeedback(null)}
          aria-label="Dismiss"
        >
          Dismiss
        </button>
      </div>
    ) : null}

    {pendingClarification ? (
      <div
        className="unified-thought-choose"
        role="group"
        aria-label="Which list"
      >
        <span className="unified-thought-prompt">Which list?</span>

        <div className="sheet-inline-options">
          {pendingClarification.candidates.map((c) => (
            <button
              type="button"
              key={c.taskId}
              className="move-day-option"
              onClick={() => resolveClarification(c.taskId)}
            >
              {c.title}
            </button>
          ))}

          <button
            type="button"
            className="btn-text"
            onClick={() => setPendingClarification(null)}
          >
            Cancel
          </button>
        </div>
      </div>
    ) : null}

    {thought && thought.hadFacets && (
      <div className="capture-facet-strip" aria-live="polite">
        {thought.date && (
          <span className="capture-facet-chip">
            {thought.date === new Date().toISOString().slice(0, 10)
              ? 'Today'
              : thought.date}
          </span>
        )}

        {thought.time && (
          <span className="capture-facet-chip">
            {fmtClock(thought.time.label)}
          </span>
        )}

        {thought.locationHint && (
          <span className="capture-facet-chip">
            {thought.locationHint}
          </span>
        )}
      </div>
    )}

    {resolutionNeedsAttention &&
      !isLiveListIntent &&
      locationResolution?.state === 'proposed' && (
        <div
          className="capture-entity-chip capture-entity-chip-ask"
          role="group"
          aria-label="Possible job match"
        >
          <span className="capture-entity-chip-text">
            <strong>
              {locationResolution.candidate.matchedField === 'location' &&
              locationResolution.candidate.locationText
                ? locationResolution.candidate.locationText
                : locationResolution.candidate.jobName}
            </strong>

            {locationResolution.candidate.matchedField === 'location'
              ? ` · ${locationResolution.candidate.jobName}`
              : ''}
          </span>

          <span className="capture-entity-chip-actions">
            <button
              type="button"
              className="btn-text capture-entity-chip-yes"
              onClick={() =>
                onConfirmResolution(locationResolution.candidate)
              }
            >
              Yes
            </button>

            <button
              type="button"
              className="btn-text"
              onClick={onDeclineResolution}
            >
              Skip
            </button>
          </span>
        </div>
      )}

    {resolutionNeedsAttention &&
      !isLiveListIntent &&
      locationResolution?.state === 'choose' && (
        <div className="unified-thought-choose">
          <span className="unified-thought-prompt">Job</span>

          <div className="sheet-inline-options">
            {locationResolution.candidates.map((c) => (
              <button
                type="button"
                key={c.jobId}
                className="move-day-option"
                onClick={() => onConfirmResolution(c)}
              >
                {c.matchedField === 'location' && c.locationText
                  ? `${c.locationText} (${c.jobName})`
                  : c.jobName}
              </button>
            ))}

            <button
              type="button"
              className="btn-text"
              onClick={onDeclineResolution}
            >
              Skip
            </button>
          </div>
        </div>
      )}

    {showEstimateChip && captureSuggestion && (
      <button
        type="button"
        className="estimate-suggestion-chip"
        onClick={applySuggestedMins}
      >
        Usually {fmtMins(captureSuggestion.suggestedMins)}
        {estimateHintVisible ? ' · tap to use' : ''}
      </button>
    )}

    {durationExplain && showTimeField && (
      <p className="settings-help capture-duration-explain">
        {durationExplain}
      </p>
    )}

    <button
      type="button"
      className="btn btn-steel capture-dock-btn"
      disabled={
        !engineStateReady ||
        listBusy ||
        (resolutionBlocksDock && !collectionDockReady) ||
        (!gate.ready && !collectionDockReady)
      }
      onClick={tryDock}
    >
      {gate.ready || collectionDockReady ? 'Dock' : 'Add'}
    </button>

    {error && (
      <p id="capture-error" role="alert" className="capture-error-line">
        {error}
      </p>
    )}

    <div className="capture-more">
      <button
        type="button"
        className={moreOpen ? 'capture-more-toggle open' : 'capture-more-toggle'}
        aria-expanded={moreOpen}
        onClick={() => setMoreOpen((v) => !v)}
      >
        {moreOpen
          ? 'Less'
          : hasOptionalActive
            ? 'Details'
            : 'Time, place, job…'}
      </button>

      {moreOpen && (
        <div className="capture-more-body">
          {!showTimeField && !taskTime.trim() ? (
            <button
              type="button"
              className="reveal-reminder-link"
              onClick={() => setShowTimeField(true)}
            >
              + Time estimate
            </button>
          ) : (
            <div className="capture-row">
              <input
                id="capture-task-time"
                type="text"
                inputMode="text"
                value={taskTime}
                onChange={(e) => setTaskTime(e.target.value)}
                placeholder="e.g. 25m or 1.5h"
                aria-label="Time estimate"
              />

              <button
                type="button"
                className="btn-text"
                onClick={() => {
                  setTaskTime('');
                  setShowTimeField(false);
                }}
              >
                Clear
              </button>
            </div>
          )}

          {!manualLocationToggle && !captureLocation.trim() ? (
            <button
              type="button"
              className="reveal-reminder-link"
              onClick={() => setManualLocationToggle(true)}
            >
              + Place
            </button>
          ) : (
            <>
              <LocationAutocomplete
                value={captureLocation}
                placeholder="Where?"
                onChange={setCaptureLocation}
                onPlaceSelected={(result) => {
                  setCaptureLocation(result.formattedAddress);
                  setCaptureLocationCoords({
                    lat: result.lat,
                    lng: result.lng,
                  });
                }}
              />

              {captureLocationMemorySuggestion &&
                !captureLocation.trim() && (
                  <button
                    type="button"
                    className="estimate-suggestion-chip"
                    onClick={() => {
                      const mem = captureLocationMemorySuggestion;
                      setCaptureLocation(mem.locationText);

                      if (mem.lat != null && mem.lng != null) {
                        setCaptureLocationCoords({
                          lat: mem.lat,
                          lng: mem.lng,
                        });
                      }
                    }}
                  >
                    <MapPinIcon size={13} />
                    <span>{captureLocationMemorySuggestion.locationText}</span>
                  </button>
                )}

              {captureLocationSuggestion &&
                !captureLocationMemorySuggestion &&
                !captureLocation.trim() && (
                  <button
                    type="button"
                    className="estimate-suggestion-chip"
                    onClick={() => {
                      setCaptureLocation(
                        captureLocationSuggestion.location.text
                      );
                      setCaptureLocationCoords({
                        lat: captureLocationSuggestion.location.lat,
                        lng: captureLocationSuggestion.location.lng,
                      });
                    }}
                  >
                    <MapPinIcon size={13} />
                    <span>{captureLocationSuggestion.location.text}</span>
                  </button>
                )}

              <button
                type="button"
                className="btn-text"
                onClick={() => {
                  setCaptureLocation('');
                  setCaptureLocationCoords(null);
                  setManualLocationToggle(false);
                }}
              >
                Clear place
              </button>
            </>
          )}

          {!showJobField && !captureJobId ? (
            <button
              type="button"
              className="reveal-reminder-link"
              onClick={() => setShowJobField(true)}
            >
              + Job
            </button>
          ) : captureJobId ? (
            <div
              className="capture-row"
              style={{ alignItems: 'center', gap: 8 }}
            >
              <span
                className="settings-help"
                style={{ margin: 0 }}
              >
                {chosenJob?.name ?? 'Job'}
              </span>

              <button
                type="button"
                className="btn-text"
                onClick={() => {
                  setCaptureJobId(null);
                  setShowJobField(false);
                }}
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="job-picker">
              {jobs.map((j) => (
                <button
                  type="button"
                  key={j.id}
                  className="move-day-option"
                  onClick={() => {
                    setCaptureJobId(j.id);
                    setShowJobField(false);
                  }}
                >
                  {j.name}
                </button>
              ))}

              <button
                type="button"
                className="btn-text"
                onClick={() => setShowJobField(false)}
              >
                Cancel
              </button>
            </div>
          )}

          {!showReminderField && !captureSurfaceDate ? (
            <button
              type="button"
              className="reveal-reminder-link"
              onClick={() => setShowReminderField(true)}
            >
              + Day
            </button>
          ) : (
            <div className="capture-row">
              <input
                type="date"
                value={captureSurfaceDate}
                onChange={(e) => setCaptureSurfaceDate(e.target.value)}
                aria-label="Surface date"
              />

              <button
                type="button"
                className="btn-text"
                onClick={() => {
                  setCaptureSurfaceDate('');
                  setShowReminderField(false);
                }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  </div>
</div>

);
}
