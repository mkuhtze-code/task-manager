import { useEffect, useRef, useState } from 'react';
import type { Task, SortMode } from '@/lib/taskTypes';
import type { HistoricalTask } from '@/lib/taskIntelligence';
import type { UserProfile } from '@/lib/userProfile';
import type { Coords } from '@/lib/todayRoute';
import { determineBase, nearestNeighborOrder } from '@/lib/todayRoute';
import { authedFetch } from '@/lib/authedFetch';
import { localDateStr, isScheduledForLater } from '@/lib/timeFormat';
import { getGpsPosition } from '@/lib/today/geolocation';
import { isRouteStop, personalVisitEvidenceFromHistory } from '@/lib/today/visitIntent';

type RouteSetter<T> = (value: T | ((previous: T) => T)) => void;

type UseTodayRouteControllerInput = {
  sortMode: SortMode;
  session: unknown | null;
  todayDataReady: boolean;
  now: Date;
  workStart: string;
  workEnd: string;
  workDays: number[];
  homeCoords: Coords | null;
  workCoords: Coords | null;
  userProfile: Pick<UserProfile, 'workType' | 'travelEmphasis'>;
  history: HistoricalTask[];
  tasksRef: { current: Task[] };
  effectiveRemainingForTask: (task: Task) => number;
  applyRouteLegs: (legs: unknown) => void;
};

/**
 * Owns the asynchronous route lifecycle for Today.
 *
 * The sequence token ensures only the newest calculation can publish results.
 * Automatic routing waits until the task surface is ready; manual refreshes
 * can call recalcRoute directly. Route state remains ephemeral and is never
 * persisted as a substitute for the authoritative task fields.
 */
export function useTodayRouteController({
  sortMode,
  session,
  todayDataReady,
  now,
  workStart,
  workEnd,
  workDays,
  homeCoords,
  workCoords,
  userProfile,
  history,
  tasksRef,
  effectiveRemainingForTask,
  applyRouteLegs,
}: UseTodayRouteControllerInput) {
  const [gpsCoords, setGpsCoords] = useState<Coords | null>(null);
  const [driveFromBaseMins, setDriveFromBaseMins] = useState(0);
  const [basePolyline, setBasePolyline] = useState<string | null>(null);
  const [returnLabel, setReturnLabel] = useState<string | null>(null);
  const [recalculatingRoute, setRecalculatingRoute] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const recalcSeqRef = useRef(0);

  async function recalcRoute() {
    if (sortMode !== 'geo_aware' || !session) {
      setDriveFromBaseMins(0);
      setBasePolyline(null);
      setReturnLabel(null);
      return;
    }

    const base = determineBase(now, workStart, workEnd, workDays, homeCoords, workCoords);
    if (!base.coords || !base.label) {
      setRouteError('Set a home or work address in Preferences to enable route-aware capacity.');
      setDriveFromBaseMins(0);
      setBasePolyline(null);
      setReturnLabel(null);
      return;
    }

    // Route only the exact visible task set; future reminders must not shift
    // the leg-to-task relationship returned by the server.
    const todayForRoute = localDateStr(now);
    const tasksNow = tasksRef.current;
    const visibleForRoute = tasksNow.filter(
      (task) => task.status !== 'done' && !isScheduledForLater(task, todayForRoute)
    );
    const located = visibleForRoute
      .filter((task) =>
        isRouteStop(task, {
          bases: { home: homeCoords, work: workCoords },
          profile: {
            workType: userProfile.workType,
            travelEmphasis: userProfile.travelEmphasis,
          },
          personal: personalVisitEvidenceFromHistory(history, {
            home: homeCoords,
            work: workCoords,
          }),
        })
      )
      .map((task) => ({ id: task.id, lat: task.lat as number, lng: task.lng as number }));

    if (located.length === 0) {
      setRouteError(null);
      setDriveFromBaseMins(0);
      setBasePolyline(null);
      setReturnLabel(null);
      return;
    }

    const seq = ++recalcSeqRef.current;
    setRecalculatingRoute(true);
    setRouteError(null);

    try {
      const gps = await getGpsPosition();
      if (seq !== recalcSeqRef.current || sortMode !== 'geo_aware' || !session) return;
      setGpsCoords(gps);

      const nowLocalMins = now.getHours() * 60 + now.getMinutes();
      const remainingTaskMins = visibleForRoute.reduce(
        (sum, task) => sum + effectiveRemainingForTask(task),
        0
      );

      const json = await authedFetch('/api/today/calculate-route', {
        orderedTaskIds: nearestNeighborOrder(base.coords, located),
        baseLabel: base.label,
        nowLocalMins,
        remainingTaskMins,
        ...(gps ? { origin: { lat: gps.lat, lng: gps.lng } } : {}),
      });
      if (seq !== recalcSeqRef.current) return;

      if (json.error) {
        setRouteError(json.error);
      } else {
        setDriveFromBaseMins(json.driveFromBaseMins || 0);
        setBasePolyline(json.basePolyline || null);
        setReturnLabel(json.returnLabel || null);
        if (Array.isArray(json.skipped) && json.skipped.length > 0) {
          setRouteError(
            json.skipped.length === 1
              ? `Couldn't get a drive time for "${json.skipped[0]}".`
              : `Couldn't get drive times for: ${json.skipped.join(', ')}.`
          );
        }
        applyRouteLegs(json.legs);
      }
    } catch {
      if (seq === recalcSeqRef.current) {
        setRouteError('Could not reach the server — check your connection and try again.');
      }
    } finally {
      if (seq === recalcSeqRef.current) {
        setRecalculatingRoute(false);
      }
    }
  }

  useEffect(() => {
    if (sortMode === 'geo_aware' && session && todayDataReady) {
      recalcRoute();
    } else if (!(sortMode === 'geo_aware' && session)) {
      setDriveFromBaseMins(0);
      setBasePolyline(null);
      setGpsCoords(null);
      setReturnLabel(null);
      setRouteError(null);
    }
    // Preserve the previous lifecycle: route refresh is keyed to mode,
    // authentication and first useful paint, not the five-second clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortMode, session, todayDataReady]);

  return {
    gpsCoords,
    driveFromBaseMins,
    basePolyline,
    returnLabel,
    recalculatingRoute,
    routeError,
    recalcRoute,
  };
}
