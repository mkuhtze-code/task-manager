import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/verifyUser';
import { checkRateLimit } from '@/lib/ratelimit';

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { allowed } = await checkRateLimit(`user:${auth.userId}:travel-geocode`);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests, try again shortly.' }, { status: 429 });
  }

  const { address } = await req.json();
  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    return NextResponse.json({ error: 'Address is required' }, { status: 400 });
  }

  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
    address
  )}&key=${process.env.GOOGLE_MAPS_API_KEY}`;

  const res = await fetch(url);
  const data = await res.json();

  if (data.status !== 'OK' || !data.results?.length) {
    return NextResponse.json({ error: 'Could not find that location' }, { status: 404 });
  }

  const { lat, lng } = data.results[0].geometry.location;
  return NextResponse.json({ lat, lng, formattedAddress: data.results[0].formatted_address });
}
