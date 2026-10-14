'use client';

/**

* Capture — pen to paper.
* Primary path: type (or speak) → Dock.
* Speech goes through processCaptureSpeech before filling the line.
* List phrases map onto tasks + subtasks (taskListBridge), not collections tables.
  */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
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
import { parseThought, type ThoughtParts } from '@/lib/unifiedInput/parse';
import {
hasEntityResolution,
resolveJobAndLocation,
type EntityRelationshipMemory,
type JobLocationResolution,
type JobLocationCandidate,
} from '@/lib/unifiedInput/resolve';
import { oneShotGate } from '@/lib/unifiedInput/oneShot';
import LocationAutocomplete from '@/components/LocationAutocomplete';
import MicButton from '@/components/MicButton';
import { useCaptureSpeech, textForCaptureField } from '@/hooks/useCaptureSpeech';
import {
detectCaptureCollection,
processCaptureSpeech,
type CaptureProposal,
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
loadWorkingMemoryLocal,
pushEngineStateRemote,
saveActiveRequestLocal,
type EngineRequest,
type LearningEvidence,
type WorkingMemorySnapshot,
} from '@/lib/engine';
import { runCaptureDock, loadPriorForDock } from '@/lib/engine/captureDock';
import { canonicalMeaningFromSpeech } from '@/lib/engine/canonicalFromSpeech';
import { executeCpuDecision } from '@/lib/cpu';
import { MapPinIcon } from '@/components/icons';
import { useDialogA11y } from '@/hooks/useDialogA11y';
import { shouldShowEstimateHint, markEstimateHintSeen } from '@/lib/uxFlags';

/** Optional structured dock from the personal operating engine. */
export type EngineDockOverrides = {
text: string;
/** Parsed from the exact local draft at Dock time, not parent debounce state. */
parsedThought?: ThoughtParts;
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

type ReviewedCaptureProposal = CaptureProposal & {
  selected: boolean;
  status: 'pending' | 'created' | 'failed' | 'excluded';
  error?: string;
};
type PendingCaptureBatch = {
  rawText: string;
  proposals: ReviewedCaptureProposal[];
  completed?: boolean;
};

function captureBatchStorageKey(userId: string | null, rawText: string): string {
  // The key is content-derived without exposing the capture text in storage keys.
  let hash = 2166136261;
  const value = `${userId ?? 'anon'}\\u0000${rawText}`;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `dokkit.capture-batch.v1.${(hash >>> 0).toString(36)}`;
}

function loadPendingCaptureBatch(
  userId: string | null,
  rawText: string
): PendingCaptureBatch | null {
  if (typeof window === 'undefined' || !rawText.trim()) return null;
  try {
    const stored = window.sessionStorage.getItem(captureBatchStorageKey(userId, rawText));
    if (!stored) return null;
    const parsed = JSON.parse(stored) as PendingCaptureBatch;
    return parsed.rawText === rawText && Array.isArray(parsed.proposals) ? parsed : null;
  } catch {
    return null;
  }
}

function savePendingCaptureBatch(userId: string | null, batch: PendingCaptureBatch): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      captureBatchStorageKey(userId, batch.rawText),
      JSON.stringify(batch)
    );
  } catch {
    // Session storage may be unavailable; the in-memory review still protects
    // against duplicate submission for as long as this sheet remains mounted.
  }
}

function removePendingCaptureBatch(userId: string | null, rawText: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(captureBatchStorageKey(userId, rawText));
  } catch {
    // Storage cleanup is best-effort and never blocks capture.
  }
}

type CaptureDraftController = { flush: () => void; clear: () => void };

/**
 * Isolate keystroke renders from CaptureSheet's interpretation, suggestions,
 * speech and authorization state. The shared ref lets Dock synchronously read
 * the exact visible text without making the whole sheet controlled per key.
 */
const CaptureTextInput = memo(function CaptureTextInput(props: {
  value: string;
  setTaskText: React.Dispatch<React.SetStateAction<string>>;
  draftRef: React.MutableRefObject<string>;
  controllerRef: React.MutableRefObject<CaptureDraftController | null>;
  speechStatusActive: boolean;
  clearSpeechStatus: () => void;
  collectionFeedbackActive: boolean;
  clearCollectionFeedback: () => void;
  error: string;
  onSubmit: () => void;
  onDraftChange: () => void;
}) {
  const {
    value,
    setTaskText,
    draftRef,
    controllerRef,
    speechStatusActive,
    clearSpeechStatus,
    collectionFeedbackActive,
    clearCollectionFeedback,
    error,
    onSubmit,
    onDraftChange,
  } = props;
  const [draft, setDraft] = useState(value);
  const lastPropValueRef = useRef(value);

  useEffect(() => {
    // A parent rerender with unchanged, still-debouncing state must not erase
    // newer keystrokes. Only treat an actual prop transition as an external
    // update (speech insertion, clear-after-success, or a reset).
    if (value === lastPropValueRef.current) return;
    lastPropValueRef.current = value;
    if (value === draftRef.current) return;
    draftRef.current = value;
    setDraft(value);
  }, [value, draftRef]);

  useEffect(() => {
    // Publish only at an interaction boundary. Draft keystrokes stay local so
    // Today’s parsing and intelligence hooks do not run on every typing pause.
    const flush = () => setTaskText(draftRef.current);
    const clear = () => {
      draftRef.current = '';
      setDraft('');
    };
    controllerRef.current = { flush, clear };
    return () => {
      if (controllerRef.current?.flush === flush) controllerRef.current = null;
    };
  }, [controllerRef, draftRef, setTaskText]);

  function handleDraftChange(next: string) {
    onDraftChange();
    draftRef.current = next;
    setDraft(next);
    if (speechStatusActive) clearSpeechStatus();
    if (collectionFeedbackActive) clearCollectionFeedback();
  }

  return (
    <input
      id="capture-task-text"
      type="text"
      value={draft}
      onChange={(e) => handleDraftChange(e.target.value)}
      onBlur={(e) => {
        // Moving focus to Dock is not a draft commit: Dock reads draftRef
        // directly and must not trigger TodayPage's debounced parse cascade.
        const nextTarget = e.relatedTarget as HTMLElement | null;
        if (nextTarget?.closest('.capture-dock-btn')) return;
        controllerRef.current?.flush();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          onSubmit();
        }
      }}
      placeholder="What needs doing…"
      autoComplete="off"
      autoFocus
      aria-invalid={!!error}
      aria-describedby={error ? 'capture-error' : undefined}
    />
  );
});

export function CaptureSheet(props: {
taskText: string;
setTaskText: React.Dispatch<React.SetStateAction<string>>;
entityMemory?: EntityRelationshipMemory;
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
entityMemory = { aliases: [], activeEntityIds: new Set<string>() },
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

// The input owns its keystroke state; this ref is the synchronous source of
// truth for Dock/Enter while parent state receives only committed drafts.
const draftTextRef = useRef(taskText);
const draftControllerRef = useRef<CaptureDraftController | null>(null);

function flushDraftText() {
  draftControllerRef.current?.flush();
  setTaskText(draftTextRef.current);
}

function clearDraftText() {
  draftTextRef.current = '';
  draftControllerRef.current?.clear();
  setTaskText('');
}

const [showJobField, setShowJobField] = useState(false);
const [showTimeField, setShowTimeField] = useState(false);
const [moreOpen, setMoreOpen] = useState(false);
const [estimateHintVisible, setEstimateHintVisible] = useState(false);
const [collectionFeedback, setCollectionFeedback] = useState<string | null>(null);
const [pendingCaptureBatch, setPendingCaptureBatch] = useState<PendingCaptureBatch | null>(
  () => loadPendingCaptureBatch(userId, taskText)
);
useEffect(() => {
  if (pendingCaptureBatch) savePendingCaptureBatch(userId, pendingCaptureBatch);
}, [pendingCaptureBatch, userId]);
const [listBusy, setListBusy] = useState(false);
const [dockBusy, setDockBusy] = useState(false);
const dockBusyRef = useRef(false);
// Prevent an accidental second Dock after a successful create when the user
// has not changed the capture. Editing the draft starts a new capture.
const completedDraftRef = useRef<string | null>(null);
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
const liveListIntent = useMemo(() => {
const line = taskText.trim();
if (!line) return null;

const ctx = buildCollectionContext();
const detected = detectCaptureCollection(line, ctx);

// Keep the fallback lazy: the live preview runs during renders as well as
// Dock, so eagerly evaluating it here defeats the redundant-work reduction.
return detected?.intent ?? detectListIntent(line, listTasks);
// Classification is synchronous; don't repeat it for unrelated sheet state
// changes. Inputs that affect intent/context remain explicit dependencies.
}, [taskText, listTasks, jobs, userId, captureJobId]);

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

    // Preserve the user's words when a list mutation was not confirmed.
    if (applied.ok) {
      clearDraftText();
      if (applied.openTaskId) onClose();
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

if (dockBusyRef.current) return;
dockBusyRef.current = true;
setDockBusy(true);
void applyListDock(next).finally(() => {
  dockBusyRef.current = false;
  setDockBusy(false);
});

}

async function executeReviewedCaptureBatch() {
  const batch = pendingCaptureBatch;
  if (!batch || !addTaskWithOverrides) return;
  const eligible = batch.proposals.filter(
    (proposal) =>
      proposal.selected &&
      (proposal.status === 'pending' || proposal.status === 'failed')
  );
  if (eligible.length === 0) {
    setCollectionFeedback('Select at least one action that is ready to create.');
    return;
  }

  let createdCount = 0;
  let failedCount = 0;
  for (const proposal of eligible) {
    // Batch creation is deliberately limited to independently createable acts.
    // Existing-object updates, questions and blocked interpretations stay out of
    // the mutation path; they must never be converted into new tasks by fallback.
    if (
      proposal.blocked ||
      !['positive_action', 'commitment_signal'].includes(proposal.reason)
    ) {
      setPendingCaptureBatch((current) => current ? ({
        ...current,
        proposals: current.proposals.map((item) =>
          item.actId === proposal.actId
            ? { ...item, status: 'excluded', selected: false, error: undefined }
            : item
        ),
      }) : current);
      continue;
    }

    setPendingCaptureBatch((current) => current ? ({
      ...current,
      proposals: current.proposals.map((item) =>
        item.actId === proposal.actId ? { ...item, error: undefined } : item
      ),
    }) : current);

    try {
      // Resolve the date for this act, not from the entire day-dump sentence.
      // Include its temporal phrase for the existing deterministic thought parser.
      const itemText = [proposal.summary, proposal.temporalRaw]
        .filter((part): part is string => !!part?.trim())
        .join(' ')
        .trim();
      const parsed = parseThought(itemText, captureSurfaceDate || undefined);
      const jobLink = proposal.entityLinks?.find((link) => link.kind === 'job');
      const placeLink = proposal.entityLinks?.find((link) => link.kind === 'place');
      const linkedJobId = jobLink && jobs.some((job) => job.id === jobLink.entityId)
        ? jobLink.entityId
        : captureJobId;
      const taskId = await addTaskWithOverrides({
        text: parsed.intent || proposal.summary,
        parsedThought: parsed,
        locationText: placeLink?.label ?? null,
        jobId: linkedJobId,
        surfaceDate: proposal.temporalResolvedDate ?? parsed.date ?? captureSurfaceDate ?? null,
        originalInput: batch.rawText,
      });
      if (!taskId) throw new Error('Save was not confirmed. This action remains available to retry.');

      createdCount += 1;
      setPendingCaptureBatch((current) => current ? ({
        ...current,
        proposals: current.proposals.map((item) =>
          item.actId === proposal.actId
            ? { ...item, status: 'created', selected: false, error: undefined }
            : item
        ),
      }) : current);
    } catch (error) {
      failedCount += 1;
      const message = error instanceof Error ? error.message : 'Could not save this action.';
      setPendingCaptureBatch((current) => current ? ({
        ...current,
        proposals: current.proposals.map((item) =>
          item.actId === proposal.actId
            ? { ...item, status: 'failed', error: message }
            : item
        ),
      }) : current);
    }
  }

  const excludedCount = batch.proposals.filter((item) => item.status === 'excluded').length;
  setCollectionFeedback(
    failedCount > 0
      ? `Created ${createdCount}; ${failedCount} need retry. The original capture is preserved.`
      : excludedCount > 0
        ? `Created ${createdCount}; ${excludedCount} action${excludedCount === 1 ? '' : 's'} need individual review and were not created.`
        : `Created ${createdCount} ${createdCount === 1 ? 'task' : 'tasks'}.`
  );
  confirmSpeechLearning();
  clearSpeechStatus();

  // Keep the original dump and per-item outcomes visible whenever anything
  // remains unresolved. A later retry only sees pending/failed selected items;
  // already-created items are never submitted again in this mounted review.
  setPendingCaptureBatch((current) => {
    if (!current) return null;
    const unresolved = current.proposals.some(
      (item) => item.status === 'pending' || item.status === 'failed'
    );
    if (unresolved) return current;
    completedDraftRef.current = current.rawText;
    return { ...current, completed: true };
  });
}

async function tryDock() {
if (!engineStateReady) return;
if (dockBusyRef.current) return;
const draftToDock = draftTextRef.current.trim();
if (!draftToDock) return;
if (!pendingCaptureBatch) {
  const storedBatch = loadPendingCaptureBatch(userId, draftToDock);
  if (storedBatch) {
    setPendingCaptureBatch(storedBatch);
    setCollectionFeedback(
      storedBatch.completed
        ? 'This capture was already processed. Edit the text to start another capture.'
        : 'Restored your previous action review. Completed items will not be submitted again.'
    );
    return;
  }
}
if (pendingCaptureBatch && pendingCaptureBatch.rawText === draftToDock) {
  if (pendingCaptureBatch.completed) {
    setCollectionFeedback('This capture was already processed. Edit the text to start another capture.');
    return;
  }
  dockBusyRef.current = true;
  setDockBusy(true);
  try {
    await executeReviewedCaptureBatch();
  } finally {
    dockBusyRef.current = false;
    setDockBusy(false);
  }
  return;
}
if (completedDraftRef.current === draftToDock) {
  setCollectionFeedback('This capture was already saved. Edit the text to create another task.');
  return;
}
dockBusyRef.current = true;
setDockBusy(true);
try {
// Keep Phase 2's paint opportunity, but do not publish the draft to TodayPage.
// The input ref remains authoritative while synchronous interpretation runs.
await new Promise<void>((resolve) => setTimeout(resolve, 0));
// The input ref is authoritative. Do not flush into TodayPage here: that
// would trigger its full parse/intelligence cascade before the dock completes.
const currentText = draftTextRef.current;
const line = currentText.trim();
const currentThought = line ? parseThought(line) : null;
const draftChanged = currentText !== taskText;
const currentResolution = currentThought
  ? resolveJobAndLocation(currentThought, jobs, entityMemory)
  : locationResolution;
const currentConfirmedJobId = draftChanged
  ? currentResolution?.state === 'known'
    ? currentResolution.candidate.jobId
    : null
  : (confirmedJobId ??
      (currentResolution?.state === 'known' ? currentResolution.candidate.jobId : null));
const currentDeclinedResolution = draftChanged ? false : declinedResolution;
const currentGate = oneShotGate({
  rawText: currentText,
  thought: currentThought,
  locationResolution: currentResolution,
  declinedResolution: currentDeclinedResolution,
  confirmedJobId: currentConfirmedJobId ?? null,
});
const effectiveCaptureJobId =
  currentResolution?.state === 'known'
    ? currentResolution.candidate.jobId
    : (currentConfirmedJobId ?? captureJobId);
const speechResult = speechStatus?.result ?? null;

// The capture field is authoritative at Dock time.
// Speech classification is an interpretation aid, not a persistent mode.
// In particular, an active list must never turn an explicit new task into
// another list item just because the speech result carried a collection
// interpretation from the active-list context.
let collectionIntent: CollectionIntent | null = null;

if (line) {
  const ctx = buildCollectionContext();
  const detected = detectCaptureCollection(line, ctx);
  // The fallback detector is only needed when the primary classifier has no
  // intent. Both classifiers are deterministic, but running both on every
  // list-shaped capture duplicates parsing and candidate work.
  collectionIntent = detected?.intent ?? detectListIntent(line, listTasks);
}

// Only use a speech-only collection result when there is no current capture
// text to classify. This prevents stale/over-eager collection classification
// from blocking an explicit task capture.
if (!line && speechResult?.collection?.intent) {
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

  await applyListDock(collectionIntent);
  return;
}

// Multi-act capture is reviewed before any task mutation. Speech and typed
// entry use the same deterministic interpretation contract; collections keep
// their dedicated path above.
const batchInterpretation = speechResult && speechResult.rawText.trim() === line
  ? speechResult
  : processCaptureSpeech({
      text: line,
      todayIso: captureSurfaceDate || undefined,
      understandingContext: buildSpeechContext(),
      userId: userId ?? 'anon',
      collectionContext: buildCollectionContext(),
    });
const createableBatchItems = batchInterpretation.proposals.filter(
  (proposal) =>
    !proposal.blocked &&
    ['positive_action', 'commitment_signal'].includes(proposal.reason)
);
if (
  !pendingCaptureBatch &&
  batchInterpretation.outcome === 'CREATE_MULTIPLE_TASKS' &&
  createableBatchItems.length <= 1
) {
  setCollectionFeedback(
    'This capture mixes actions that need different handling. Nothing was created; split or clarify the actions before trying again.'
  );
  return;
}

if (
  !pendingCaptureBatch &&
  batchInterpretation.outcome === 'CREATE_MULTIPLE_TASKS' &&
  createableBatchItems.length > 1
) {
  setPendingCaptureBatch({
    rawText: line,
    proposals: batchInterpretation.proposals.map((proposal) => {
      const canCreate =
        !proposal.blocked &&
        ['positive_action', 'commitment_signal'].includes(proposal.reason);
      return {
        ...proposal,
        selected: canCreate,
        status: canCreate ? 'pending' as const : 'excluded' as const,
      };
    }),
  });
  setCollectionFeedback('Review each action and its date before creating tasks.');
  return;
}

// Personal operating engine — processInteraction via runCaptureDock.
// Outcomes: ACT / ANSWER / DEFER / CLARIFY / fallthrough → ordinary dock.
const unresolvedCurrentResolution =
  !!currentResolution &&
  !currentDeclinedResolution &&
  currentConfirmedJobId == null &&
  (currentResolution.state === 'proposed' || currentResolution.state === 'choose');
if (unresolvedCurrentResolution) {
  // Commit only when fresh parsing shows a confirmation is required. This
  // lets Today render the existing Yes/Skip UI without parsing every Dock.
  if (draftChanged) setTaskText(currentText);
  setCollectionFeedback(
    currentResolution.state === 'choose'
      ? 'Pick which place, or skip'
      : 'Confirm or skip the place first'
  );
  return;
}
const currentThoughtForDock = currentThought;
const parsedTaskText =
  currentThought?.hadFacets && currentThought.intent && currentThought.intent.length > 0
    ? currentThought.intent
    : line;

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
      captureJobId: effectiveCaptureJobId,
      captureSurfaceDate,
      remainingMinsToday,
      openTaskCount: listTasks.length,
      inputType: speechStatus?.result ? 'speech_transcript' : 'text',
      canonicalMeaning:
        speechStatus?.result?.pipeline.interpretation &&
        textForCaptureField(speechStatus.result).trim() === line
          ? canonicalMeaningFromSpeech(speechStatus.result.pipeline.interpretation, line)
          : undefined,
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

            const createdId = await addTaskWithOverrides({
              text: action.text,
              parsedThought: currentThought ?? undefined,
              locationText: action.locationText,
              jobId: action.jobId,
              surfaceDate: action.surfaceDate,
              estimateMins: action.estimateMins ?? undefined,
              originalInput: line,
              explanation: dock.overrides.explanation,
              engineRequest: dock.overrides.engineRequest,
              evidence: dock.overrides.evidence,
              workingMemory: dock.overrides.workingMemory,
            });
            if (!createdId) {
              throw new Error('Could not confirm the save. Your capture is still here; retry when ready.');
            }
            return createdId;
          },
          updateTask: async (action) => {
            if (!addTaskWithOverrides) {
              throw new Error('Capture task executor is not connected.');
            }

            const updatedId = await addTaskWithOverrides({
              text: action.text ?? dock.overrides.text,
              parsedThought: currentThought ?? undefined,
              locationText: action.locationText,
              jobId: action.jobId,
              surfaceDate: action.surfaceDate,
              estimateMins: action.estimateMins ?? undefined,
              originalInput: line,
              explanation: dock.overrides.explanation,
              updateTaskId: action.taskId,
              engineRequest: dock.overrides.engineRequest,
              evidence: dock.overrides.evidence,
              workingMemory: dock.overrides.workingMemory,
            });
            if (!updatedId) {
              throw new Error('Could not confirm the update. Your capture is still here; retry when ready.');
            }
          },
        },
      });

      if (execution.execution?.status === 'executed') {
        if (dock.kind === 'act_create') {
          completedDraftRef.current = line;
          // A completed create is a boundary between captures, not an unfinished
          // request to resume. Keep active-request state only for refinements.
          setEnginePriorRequest(null);
          saveActiveRequestLocal(null, userId);
          if (userId) {
            void pushEngineStateRemote(
              supabase as never,
              userId,
              loadWorkingMemoryLocal(userId),
              null,
              [],
            );
          }
        }
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
        clearDraftText();
      }

      return;
    }

    if (
      (dock.kind === 'clarify' || dock.kind === 'fallthrough') &&
      /no hard day set/i.test(dock.message || '') &&
      addTaskWithOverrides
    ) {
      // A missing day is planning uncertainty, not a reason to reject an
      // explicit Dock. Save the user's exact wording as a flexible task;
      // leave the date unset so Dokkit can learn/refine it later.
      const savedId = await addTaskWithOverrides({
        text: parsedTaskText,
        parsedThought: currentThought ?? undefined,
        originalInput: line,
        locationText: captureLocation.trim() || null,
        jobId: captureJobId,
        surfaceDate: captureSurfaceDate || null,
      });
      if (!savedId) {
        setCollectionFeedback('Could not confirm the save. Your capture is still here; retry when ready.');
        return;
      }
      completedDraftRef.current = line;
      setEngineExplain('Saved as a flexible task. No day was assigned.');
      setCollectionFeedback('Saved as a flexible task. No day was assigned.');
      confirmSpeechLearning();
      clearSpeechStatus();
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
    setCollectionFeedback(
      err instanceof Error ? err.message : 'Could not complete that action.'
    );
    // An engine failure is not permission to fall through and create a second,
    // ordinary task. Keep the draft available for an explicit retry instead.
    return;
  }
}

if (!currentGate.ready) return;

confirmSpeechLearning();
clearSpeechStatus();
if (addTaskWithOverrides) {
  const savedId = await addTaskWithOverrides({
    text: parsedTaskText,
    parsedThought: currentThoughtForDock ?? undefined,
    originalInput: line,
    jobId: effectiveCaptureJobId,
  });
  if (!savedId) {
    setCollectionFeedback('Could not confirm the save. Your capture is still here; retry when ready.');
    return;
  }
  completedDraftRef.current = line;
} else {
  // Compatibility path for callers that have not adopted structured payloads.
  flushDraftText();
  addTask();
  completedDraftRef.current = line;
}

} finally {
  dockBusyRef.current = false;
  setDockBusy(false);
}
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
          className="btn-text capture-sheet-close ux-button ux-button--quiet"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>

    <div className="capture-text-row">
      <CaptureTextInput
        value={taskText}
        setTaskText={setTaskText}
        draftRef={draftTextRef}
        controllerRef={draftControllerRef}
        speechStatusActive={!!speechStatus}
        clearSpeechStatus={clearSpeechStatus}
        collectionFeedbackActive={!!collectionFeedback}
        clearCollectionFeedback={() => setCollectionFeedback(null)}
        error={error}
        onSubmit={tryDock}
        onDraftChange={() => {
          completedDraftRef.current = null;
          // Preserve any unfinished batch in session storage for the original
          // dump, but detach it from the newly edited draft.
          setPendingCaptureBatch(null);
        }}
      />

      <MicButton onResult={onSpeechResult} />
    </div>

    {speechStatus && speechStatus.message ? (
      <div
        className={`capture-speech-status capture-speech-status-${speechStatus.tone}`}
        role="status"
        aria-live="polite"
      >
        {speechStatus.tone !== 'neutral' ? (
          <span className="capture-speech-status-label">
            {speechStatus.tone === 'propose'
              ? 'Suggestion'
              : speechStatus.tone === 'ask'
                ? 'Needs your input'
                : 'No action taken'}
          </span>
        ) : null}
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

    {pendingCaptureBatch ? (
      <div className="capture-batch-review" role="group" aria-label="Review actions to create">
        <p className="settings-help">
          {pendingCaptureBatch.completed
            ? 'This capture has been processed. Edit the text to start a new capture.'
            : 'Review the actions below. Each date is resolved independently; completed actions will not be submitted again during this review.'}
        </p>
        <ul className="capture-batch-review-list">
          {pendingCaptureBatch.proposals.map((proposal) => (
            <li key={proposal.actId} className="capture-batch-review-item">
              <label>
                <input
                  type="checkbox"
                  checked={proposal.selected}
                  disabled={proposal.status === 'created' || proposal.status === 'excluded'}
                  onChange={(event) => setPendingCaptureBatch((current) => current ? ({
                    ...current,
                    proposals: current.proposals.map((item) =>
                      item.actId === proposal.actId
                        ? { ...item, selected: event.target.checked }
                        : item
                    ),
                  }) : current)}
                />
                <span>
                  <strong>{proposal.summary || proposal.objectText || 'Unclear action'}</strong>
                  {proposal.temporalRaw ? <span> · {proposal.temporalRaw}</span> : null}
                  {proposal.temporalResolvedDate ? <span> · {proposal.temporalResolvedDate}</span> : null}
                  {proposal.status === 'created' ? <span> · Created</span> : null}
                  {proposal.status === 'excluded' ? <span> · Needs individual review</span> : null}
                  {proposal.status === 'failed' ? <span role="alert"> · {proposal.error || 'Failed; select to retry'}</span> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <button
          type="button"
          className="btn-text"
          disabled={pendingCaptureBatch.completed || pendingCaptureBatch.proposals.some((item) => item.status === 'created' || item.status === 'failed')}
          onClick={() => {
            removePendingCaptureBatch(userId, pendingCaptureBatch.rawText);
            setPendingCaptureBatch(null);
            setCollectionFeedback(null);
          }}
        >
          Cancel review
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
        dockBusy ||
        !!pendingCaptureBatch?.completed
      }
      onClick={tryDock}
    >
      {dockBusy ? 'Saving…' : pendingCaptureBatch?.completed ? 'Processed' : pendingCaptureBatch ? `Create selected (${pendingCaptureBatch.proposals.filter((item) => item.selected && (item.status === 'pending' || item.status === 'failed')).length})` : 'Dock'}
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