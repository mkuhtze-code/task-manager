export type PlaceCoordinates = { lat: number; lng: number };
export type PlaceBiasMode = 'here' | 'stay' | 'stop' | 'leg' | 'next';
export type PlaceBiasContexts = Partial<Record<PlaceBiasMode, PlaceCoordinates | null>>;
export type PlaceBiasPayload = { biasLat?: number; biasLng?: number; radiusMeters?: number };
export type OrderedActivity = { id: string; order_index: number };

/** Build an optional provider bias. Missing coordinates mean no bias, never a guessed location. */
export function buildPlaceBias(mode: PlaceBiasMode, contexts: PlaceBiasContexts, radiusMeters = 5000): PlaceBiasPayload {
  const point = contexts[mode];
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng) ||
      point.lat < -90 || point.lat > 90 || point.lng < -180 || point.lng > 180) return {};
  return { biasLat: point.lat, biasLng: point.lng, radiusMeters: Math.min(50000, Math.max(100, Math.round(radiusMeters))) };
}

/** Reindex a stop list with a gap at insertIndex, so a new stop can be placed inside a leg. */
export function buildInsertionOrder<T extends OrderedActivity>(activities: T[], insertIndex: number) {
  const ordered = [...activities].sort((a, b) => a.order_index - b.order_index);
  const slot = Math.max(0, Math.min(ordered.length, Math.trunc(insertIndex)));
  return {
    insertOrderIndex: slot * 1000,
    updates: ordered.map((activity, index) => ({ id: activity.id, order_index: index < slot ? index * 1000 : (index + 1) * 1000 })),
  };
}

export function buildPlaceAutocompletePayload(input: string, sessionToken: string, bias: PlaceBiasPayload = {}, includedPrimaryTypes?: string[]) {
  const payload: Record<string, unknown> = { input, sessionToken };
  if (bias.biasLat != null && bias.biasLng != null) {
    payload.locationBias = { circle: { center: { latitude: bias.biasLat, longitude: bias.biasLng }, radius: Math.min(50000, Math.max(100, bias.radiusMeters ?? 5000)) } };
    payload.origin = { latitude: bias.biasLat, longitude: bias.biasLng };
  }
  if (includedPrimaryTypes?.length) payload.includedPrimaryTypes = includedPrimaryTypes;
  return payload;
}
