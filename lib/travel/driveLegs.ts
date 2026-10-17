export type DriveDestination = {
  lat: number | null | undefined;
  lng: number | null | undefined;
  locationText?: string | null;
  label?: string | null;
};

/**
 * Build a Google Maps directions handoff to the intended stop.
 * Coordinates are preferred because display labels can be ambiguous; text is
 * a fallback for places that have not been geocoded yet.
 */
export function buildGoogleMapsDirectionsUrl(destination: DriveDestination, origin?: DriveDestination): string | null {
  const hasDestinationCoords = destination.lat != null && destination.lng != null;
  const destinationValue = hasDestinationCoords
    ? `${destination.lat},${destination.lng}`
    : destination.locationText?.trim() || destination.label?.trim();
  if (!destinationValue) return null;

  const params = new URLSearchParams();
  params.set('api', '1');
  params.set('destination', destinationValue);
  params.set('travelmode', 'driving');

  if (origin) {
    const hasOriginCoords = origin.lat != null && origin.lng != null;
    const originValue = hasOriginCoords
      ? `${origin.lat},${origin.lng}`
      : origin.locationText?.trim() || origin.label?.trim();
    if (originValue) params.set('origin', originValue);
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** A zero stored drive is the legacy representation of an unknown leg. */
export function displayDriveEstimate(mins: number | null | undefined): string {
  if (mins == null || !Number.isFinite(mins) || mins <= 0) return 'Drive unknown';
  const rounded = Math.round(mins);
  if (rounded < 60) return `${rounded}m`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}
