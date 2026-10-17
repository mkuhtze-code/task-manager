import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/verifyUser';
import { checkRateLimit } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { allowed } = await checkRateLimit(`user:${auth.userId}:travel-autocomplete`);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests, try again shortly.' }, { status: 429 });
  }

  const { input, sessionToken, biasLat, biasLng, radiusMeters, includedPrimaryTypes } = await req.json();
  if (!input || typeof input !== 'string' || input.trim().length < 2) {
    return NextResponse.json({ predictions: [] });
  }
  if (!sessionToken || typeof sessionToken !== 'string') {
    return NextResponse.json({ error: 'sessionToken is required' }, { status: 400 });
  }

  const hasBias = Number.isFinite(biasLat) && Number.isFinite(biasLng) && biasLat >= -90 && biasLat <= 90 && biasLng >= -180 && biasLng <= 180;
  const safeRadius = Number.isFinite(radiusMeters) ? Math.min(50000, Math.max(100, Math.round(radiusMeters))) : 5000;
  const payload: Record<string, unknown> = { input, sessionToken };
  if (hasBias) {
    payload.locationBias = { circle: { center: { latitude: biasLat, longitude: biasLng }, radius: safeRadius } };
    payload.origin = { latitude: biasLat, longitude: biasLng };
  }
  const allowedTypes = new Set(['restaurant', 'cafe', 'bakery', 'hardware_store', 'supermarket', 'gas_station', 'lodging', 'tourist_attraction', 'museum', 'park']);
  if (Array.isArray(includedPrimaryTypes)) {
    const types = includedPrimaryTypes.filter((type: unknown) => typeof type === 'string' && allowedTypes.has(type));
    if (types.length) payload.includedPrimaryTypes = types;
  }

  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY as string,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error('[places.autocomplete]', data);
    return NextResponse.json({ predictions: [], error: 'Place search unavailable' }, { status: 502 });
  }

  const predictions = (data.suggestions || [])
    .filter((s: { placePrediction?: unknown }) => s.placePrediction)
    .map((s: {
      placePrediction: {
        placeId?: string;
        distanceMeters?: number;
        text?: { text?: string };
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
      };
    }) => {
      const pred = s.placePrediction;
      const full = pred.text?.text || '';
      const main = pred.structuredFormat?.mainText?.text || full;
      const secondary = pred.structuredFormat?.secondaryText?.text || '';
      return {
        placeId: pred.placeId || '',
        text: full || main,
        mainText: main,
        secondaryText: secondary,
        distanceMeters: typeof pred.distanceMeters === 'number' ? pred.distanceMeters : null,
      };
    })
    .filter((p: { placeId: string }) => p.placeId);

  return NextResponse.json({ predictions });
}
