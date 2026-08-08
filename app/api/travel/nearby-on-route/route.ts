import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/verifyUser';
import { checkRateLimit } from '@/lib/ratelimit';

type Coords = { lat: number; lng: number };

// Straight-line distance in meters — used only to size the search radius,
// never as the actual ranking signal (crow-flies distance is a bad proxy
// for "how much extra driving does this actually cost").
function haversineMeters(a: Coords, b: Coords): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function computeRouteLeg(origin: Coords, destination: Coords): Promise<number | null> {
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY as string,
      'X-Goog-FieldMask': 'routes.duration',
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: 'DRIVE',
    }),
  });
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route?.duration) return null;
  return Math.round(parseInt(String(route.duration).replace('s', ''), 10) / 60);
}

function humanizeType(type: string | undefined | null): string | null {
  if (!type) return null;
  return type
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Only confirmed Table A types go here — includedTypes rejects the whole
// request on a single bad value (this is what broke point_of_interest
// earlier), so nothing speculative belongs in this list. "lookout" has no
// dedicated Google type — tourist_attraction + park is the closest real
// match, not a perfect one.
const CATEGORY_TYPES: Record<string, string[]> = {
  rest_stop: ['rest_stop', 'gas_station'],
  lookout: ['tourist_attraction', 'park'],
  attraction: ['tourist_attraction', 'museum', 'art_gallery', 'monument', 'historical_place', 'cultural_landmark'],
  food: ['restaurant', 'cafe', 'meal_takeaway'],
  supplies: ['supermarket', 'convenience_store', 'pharmacy'],
};

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { allowed } = await checkRateLimit(`user:${auth.userId}:travel-nearby`);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests, try again shortly.' }, { status: 429 });
  }

  const { originLat, originLng, destLat, destLng, directMins, category } = await req.json();
  if ([originLat, originLng, destLat, destLng, directMins].some((v) => typeof v !== 'number')) {
    return NextResponse.json({ error: 'origin/dest coordinates and directMins are required' }, { status: 400 });
  }

  const includedTypes = CATEGORY_TYPES[category] || CATEGORY_TYPES.attraction;

  const origin: Coords = { lat: originLat, lng: originLng };
  const dest: Coords = { lat: destLat, lng: destLng };
  const midpoint: Coords = { lat: (origin.lat + dest.lat) / 2, lng: (origin.lng + dest.lng) / 2 };

  const legMeters = haversineMeters(origin, dest);
  const radius = Math.min(Math.max(legMeters / 2, 1500), 20000);

  const nearbyRes = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY as string,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.primaryType',
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: 8,
      locationRestriction: {
        circle: { center: { latitude: midpoint.lat, longitude: midpoint.lng }, radius },
      },
    }),
  });

  const nearbyData = await nearbyRes.json();

  if (!nearbyRes.ok) {
    return NextResponse.json(
      { error: nearbyData?.error?.message || 'Places search failed', suggestions: [] },
      { status: 502 }
    );
  }

  const candidates = (nearbyData.places || []).slice(0, 5);
  if (candidates.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  const withDetour = await Promise.all(
    candidates.map(async (p: any) => {
      const placeCoords: Coords = { lat: p.location.latitude, lng: p.location.longitude };
      const [toPlace, fromPlace] = await Promise.all([
        computeRouteLeg(origin, placeCoords),
        computeRouteLeg(placeCoords, dest),
      ]);
      if (toPlace === null || fromPlace === null) return null;
      const detourMins = Math.max(toPlace + fromPlace - directMins, 0);
      return {
        placeId: p.id,
        name: p.displayName?.text || 'Unnamed place',
        address: p.formattedAddress || '',
        lat: placeCoords.lat,
        lng: placeCoords.lng,
        rating: p.rating ?? null,
        typeLabel: humanizeType(p.primaryType),
        detourMins,
      };
    })
  );

  const suggestions = withDetour
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .sort((a, b) => a.detourMins - b.detourMins)
    .slice(0, 3);

  return NextResponse.json({ suggestions });
}
