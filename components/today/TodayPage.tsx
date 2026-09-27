'use client';

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import TravelAwarenessBanner from '@/components/TravelAwarenessBanner';
import {
  computeTravelPresenceImpact,
} from '@/lib/travelPresence';
import { localDateStr as travelLocalDateStr } from '@/lib/travelContext';
import { TaskCard } from '@/components/TaskCard';
import { TravelLeg } from '@/components/TravelLeg';
import { TaskDetailSheet } from '@/components/TaskDetailSheet';
import { ScheduledSheet } from '@/components/ScheduledSheet';
import { CaptureSheet } from '@/components/CaptureSheet';
import { RealityCheckSheet } from '@/components/RealityCheckSheet';
import { TodayHeader } from '@/components/TodayHeader';
import MapView from '@/components/MapView';
import SurfaceNav from '@/components/SurfaceNav';
import { OnboardingScreen } from '@/components/AuthScreen';
import { PostStopPrompt, type PostStopPromptState } from '@/components/PostStopPrompt';
import { PlusIcon } from '@/components/icons';
import { useDragReorder } from '@/hooks/useDragReorder';
import { useRecordSurfaceEvent } from '@/hooks/useRecordSurfaceEvent';
import { registerCaptureOpen } from '@/lib/captureOpen';
import { useSurfaceMode } from '@/hooks/useSurfaceMode';
import { useDesktopWorkspaceKeys } from '@/hooks/useDesktopWorkspaceKeys';
import type { OnboardingAnswers } from '@/lib/onboardingTypes';
import { seedStarterPack, clearStarterPack, isStarterTask } from '@/lib/starterPack';
import { todayEmptyCopy, orderedNavSurfaces, firstSessionLine } from '@/lib/surfaceCopy';
import { persistNavOrder } from '@/components/DesktopProductNav';

import {
  defaultUserProfile,
  profileFromAnswers,
  profileFromSettings,
  settingsPatchFromProfile,
  type UserProfile,
} from '@/lib/userProfile';
import { isReliableActualMins, resolveActualForLearning } from '@/lib/thinking/durationQuality';
import {
  buildClusters,
  suggestEstimate,
  effectiveEstimate,
  hasMeaningfulDivergence,
  suggestLocation,
  suggestsLocation,
  suggestJob,
  suggestLocationMemory,
  type HistoricalTask,
} from '@/lib/taskIntelligence';
import { logCapturePrediction } from '@/lib/thinking/evidence/predictionLog';
import { closeCompletionLoop, historyRowFromCompletion } from '@/lib/thinking/evidence/closeCompletionLoop';
import { decidePersonalGravity, LOOKBACK_DAYS } from '@/lib/thinking/decisions/personalGravity';
import { parseThought, type ThoughtParts } from '@/lib/unifiedInput/parse';
import { oneShotGate, formatDockSummary } from '@/lib/unifiedInput/oneShot';
import { resolveJobAndLocation, deriveAliasTerm, type JobLocationResolution, type JobLocationCandidate, type EntityAliasMemory, type EntityRelationshipMemory } from '@/lib/unifiedInput/resolve';
import { decideCaptureContext } from '@/lib/thinking/decisions/captureContext';
import type { SurfaceEvent, Surface } from '@/lib/thinking/types';
import { determineBase, nearestNeighborOrder, weaveGeoOrder, type Coords } from '@/lib/todayRoute';
import { sortTasks } from '@/lib/taskSort';
import { authedFetch, apiUrl } from '@/lib/authedFetch';
import {
  INITIALIZED_FOR_KEY,
  DEFAULT_WORK_DAYS,
  type Meeting,
  type SortMode,
  type Subtask,
  type Task,
} from '@/lib/taskTypes';
import type { Job } from '@/lib/jobTypes';
import {
  fmtMins,
  fmtClock,
  isScheduledForLater,
  localDateStr,
  parseMins,
  timeStringToMinutes,
} from '@/lib/timeFormat';
import { computeAvailability } from '@/lib/calendar/planning';
import {
  nextWorkSurfaceDate,
  summarizeReshape,
  tasksForRealityCheck,
  historyObservationForUpdate,
  saveDayClose,
  consumeMorningPlanMessage,
  noteOpenRealityWindow,
  readPendingRealityInvite,
  dismissPendingRealityInvite,
  type RealityUpdate,
  type PendingRealityInvite,
} from '@/lib/realityCapture';
import {
  planOverflowCarry,
  buildRuntimeObservations,
  lookupTaskSignals,
} from '@/lib/dayFit';
import { calibrateFromOutcomes } from '@/lib/thinking/calibration';
import { getBuffer } from '@/lib/thinking/evidence';
import { getGpsPosition } from '@/lib/today/geolocation';
import { TASK_COLUMNS, PASSIVE_TODAY_KEY } from '@/lib/today/constants';
import {
  remainingForTask as remainingForTaskPure,
  effectiveRemainingForTask as effectiveRemainingForTaskPure,
} from '@/lib/today/taskRemaining';
import { useNow } from '@/hooks/useNow';
import { useTodayAuth } from '@/hooks/useTodayAuth';
import { notifyTaskActivity } from '@/hooks/useActiveTask';
import { showActiveTimerNotification } from '@/lib/activeTimerNotify';

/** Authenticated Today surface — mounted only after authReady && session. */
export function TodayPage() {
  const router = useRouter();
  const { session, setSignInError } = useTodayAuth();
  const now = useNow(5000);

  // Keep Today in sync when the global player stops a task.
  // If real minutes were banked, offer one-tap Done (frictionless learning).
  useEffect(() => {
    function onActivity(e: Event) {
      const detail = (e as CustomEvent).detail || {};
      if (detail.type === 'stopped' && detail.taskId) {
        const taskId = String(detail.taskId);
        const logged =
          typeof detail.logged_mins === 'number' ? detail.logged_mins : null;
        const detailText =
          typeof detail.text === 'string' ? detail.text : null;

        setTasks((prev) => {
          const row = prev.find((t) => t.id === taskId);
          const mins = logged != null ? logged : row?.logged_mins ?? 0;
          const text = detailText ?? row?.text ?? '';
          if (isReliableActualMins(mins) && text) {
            queueMicrotask(() => {
              setPostStopPrompt({ taskId, text, loggedMins: mins });
            });
          }
          return prev.map((t) =>
            t.id === taskId
              ? {
                  ...t,
                  status: 'pending' as const,
                  started_at: null,
                  logged_mins: logged != null ? logged : t.logged_mins,
                }
              : t
          );
        });
      }
      if (detail.type === 'completed' && detail.taskId) {
        setPostStopPrompt((prev) =>
          prev && prev.taskId === detail.taskId ? null : prev
        );
      }
    }
    window.addEventListener('dokkit:task-activity', onActivity);
    return () => window.removeEventListener('dokkit:task-activity', onActivity);
  }, []);

  const [tasks, setTasks] = useState<Task[]>([]);
  // STUB_MARKER - full file continues via second push if truncated
}
