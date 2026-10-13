import type { Task } from '@/lib/taskTypes';
import type { Coords } from '@/lib/todayRoute';

type TodayRouteDerivationInput = {
  visibleTasks: Task[];
  orderedTasks: Task[];
  geoAware: boolean;
  driveFromBaseMins: number;
  gpsCoords: Coords | null;
  currentBase: { coords: Coords | null; label: string | null };
  basePolyline: string | null;
  isRouteStop: (task: Task) => boolean;
};

/**
 * Derive the shared route representation used by Today capacity, task rows,
 * and MapView. This is intentionally a pure projection of existing state.
 */
export function deriveTodayRoute({
  visibleTasks,
  orderedTasks,
  geoAware,
  driveFromBaseMins,
  gpsCoords,
  currentBase,
  basePolyline,
  isRouteStop,
}: TodayRouteDerivationInput) {
  // Route drive time only enters capacity math in geo_aware mode. Each
  // located task carries its own outgoing leg's drive_mins_to_next (the
  // last located task carries the return leg back to the start), and the
  // origin → first leg is held in driveFromBaseMins.
  const locatedDriveSum = geoAware
    ? visibleTasks
        .filter((task) => isRouteStop(task))
        .reduce((sum, task) => sum + (task.drive_mins_to_next || 0), 0)
    : 0;
  const routeDriveMins = geoAware ? driveFromBaseMins + locatedDriveSum : 0;

  // The located destinations in on-screen (geo) order. Leg rows and the
  // route map both render from this sequence.
  const locatedInOrder = orderedTasks.filter((task) => isRouteStop(task));
  const locatedIndexById: Record<string, number> = {};
  locatedInOrder.forEach((task, index) => (locatedIndexById[task.id] = index));

  // The route's start point: live GPS when we have a fix, else the
  // current Home/Work base the order was built from.
  const routeOrigin = gpsCoords ?? currentBase.coords;
  const originLabel = gpsCoords
    ? 'current location'
    : currentBase.label === 'work'
      ? 'office'
      : currentBase.label === 'home'
        ? 'home'
        : 'start';

  // Keep MapView's existing base marker and polyline handoff unchanged.
  const mapBase = routeOrigin && basePolyline
    ? {
        location_text: gpsCoords ? 'Current location' : currentBase.label === 'work' ? 'Office' : 'Home',
        lat: routeOrigin.lat,
        lng: routeOrigin.lng,
        route_polyline: basePolyline,
      }
    : null;
  const mapActivities = locatedInOrder.map((task) => ({
    id: task.id,
    text: task.text,
    location_text: task.location_text,
    lat: task.lat,
    lng: task.lng,
    route_polyline: task.route_polyline,
  }));
  const hasRoute = geoAware && locatedInOrder.length > 0 && basePolyline != null;

  return {
    locatedDriveSum,
    routeDriveMins,
    locatedInOrder,
    locatedIndexById,
    routeOrigin,
    originLabel,
    mapBase,
    mapActivities,
    hasRoute,
  };
}
