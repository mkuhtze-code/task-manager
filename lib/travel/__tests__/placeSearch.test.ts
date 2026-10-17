import { describe, expect, it } from 'vitest';
import { buildInsertionOrder, buildPlaceAutocompletePayload, buildPlaceBias } from '../placeSearch';

describe('contextual place search', () => {
  it('builds an optional circular provider bias from supplied coordinates', () => {
    expect(buildPlaceBias('stay', { stay: { lat: -36.85, lng: 174.76 } })).toEqual({ biasLat: -36.85, biasLng: 174.76, radiusMeters: 5000 });
    expect(buildPlaceBias('here', {})).toEqual({});
    expect(buildPlaceBias('stop', { stop: { lat: 999, lng: 0 } })).toEqual({});
  });
  it('forwards bias, origin and category types to the provider payload', () => {
    expect(buildPlaceAutocompletePayload('coffee', 'token', { biasLat: -36.85, biasLng: 174.76, radiusMeters: 2500 }, ['cafe'])).toEqual({
      input: 'coffee', sessionToken: 'token',
      locationBias: { circle: { center: { latitude: -36.85, longitude: 174.76 }, radius: 2500 } },
      origin: { latitude: -36.85, longitude: 174.76 }, includedPrimaryTypes: ['cafe'],
    });
    expect(buildPlaceAutocompletePayload('coffee', 'token')).toEqual({ input: 'coffee', sessionToken: 'token' });
  });
  it('creates a free order slot between leg endpoints', () => {
    const result = buildInsertionOrder([{ id: 'a', order_index: 0 }, { id: 'b', order_index: 1 }, { id: 'c', order_index: 2 }], 1);
    expect(result.insertOrderIndex).toBe(1000);
    expect(result.updates).toEqual([{ id: 'a', order_index: 0 }, { id: 'b', order_index: 2000 }, { id: 'c', order_index: 3000 }]);
  });
});
