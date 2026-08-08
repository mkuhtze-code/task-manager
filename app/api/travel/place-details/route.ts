import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/verifyUser';
import { checkRateLimit } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { allowed } = await checkRateLimit(`user:${auth.userId}:travel-place-details`);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests, try again shortly.' }, { status: 429 });
  }

  const { placeId, sessionToken } = await req.json();
  if (!placeId || typeof placeId !== 'string') {
    return NextResponse.json({ error: 'placeId is required' }, { status: 400 });
  }

  // Field mask kept to just what's needed (location + display name) — this
  // is what keeps the call inside the free Essentials tier when paired with
  // a session token from the autocomplete call above. Requesting extra
  // fields (photos, reviews, hours) would push it into a billed tier.
  const res = await fetch(
    `https://places.googleapis.com/v1/places/${placeId}?sessionToken=${encodeURIComponent(sessionToken || '')}`,
    {
      headers: {
        'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY as string,
        'X-Goog-FieldMask': 'location,displayName,formattedAddress',
      },
    }
  );

  const data = await res.json();
  if (!data.location) {
    return NextResponse.json({ error: 'Could not resolve that place' }, { status: 404 });
  }

  return NextResponse.json({
    lat: data.location.latitude,
    lng: data.location.longitude,
    formattedAddress: data.formattedAddress || data.displayName?.text || '',
  });
}
