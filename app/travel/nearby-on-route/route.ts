import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/verifyUser';
import { checkRateLimit } from '@/lib/ratelimit';

type Coords = { lat: number; lng: number };

// Straight-line distance in meters — used only to size the search radius,
// never as the actual ranking signal (that's the whole point of this
// route: crow-flies distance is a bad proxy for "how much extra driving
// does this actually cost").
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

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // This route is meaningfully more expensive per call than the others
  // (one Nearby Search + up to 10 Routes calls) since it's checking real
  // detour cost for several candidates, not just one lookup — it's user-
  // triggered per leg (a deliberate "find something nearby" tap), never
  // automatic, which is what keeps this affordable. If usage patterns
  // show people hammering this button, this key is the one to give its
  // own tighter limiter rather than sharing the general 20/60s one.
  const { allowed } = await checkRateLimit(`user:${auth.userId}:travel-nearby`);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests, try again shortly.' }, { status: 429 });
  }

  const { originLat, originLng, destLat, destLng, directMins } = await req.json();
  if ([originLat, originLng, destLat, destLng, directMins].some((v) => typeof v !== 'number')) {
    return NextResponse.json({ error: 'origin/dest coordinates and directMins are required' }, { status: 400 });
  }

  const origin: Coords = { lat: originLat, lng: originLng };
  const dest: Coords = { lat: destLat, lng: destLng };
  const midpoint: Coords = { lat: (origin.lat + dest.lat) / 2, lng: (origin.lng + dest.lng) / 2 };

  // Radius sized to the leg itself — a short 10-minute hop between two
  // close stops shouldn't search a 20km circle, and a 3-hour drive
  // shouldn't only search a 1km dot at the midpoint.
  const legMeters = haversineMeters(origin, dest);
  const radius = Math.min(Math.max(legMeters / 2, 1500), 20000);

  const nearbyRes = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY as string,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.primaryTypeDisplayName',
    },
    body: JSON.stringify({
      includedTypes: ['tourist_attraction', 'park', 'museum', 'art_gallery', 'point_of_interest'],
      maxResultCount: 8,
      locationRestriction: {
        circle: { center: { latitude: midpoint.lat, longitude: midpoint.lng }, radius },
      },
    }),
  });
  const nearbyData = await nearbyRes.json();
  const candidates = (nearbyData.places || []).slice(0, 5);

  if (candidates.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  // For each candidate, the real question isn't "how far is it from the
  // midpoint" — it's "how much longer does the whole leg become if I go
  // via this place instead of straight through." That requires two real
  // route calls per candidate, which is the expensive part of this route.
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
        typeLabel: p.primaryTypeDisplayName?.text || null,
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
