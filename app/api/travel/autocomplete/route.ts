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

  const { input, sessionToken } = await req.json();
  if (!input || typeof input !== 'string' || input.trim().length < 2) {
    return NextResponse.json({ predictions: [] });
  }
  if (!sessionToken || typeof sessionToken !== 'string') {
    return NextResponse.json({ error: 'sessionToken is required' }, { status: 400 });
  }

  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY as string,
    },
    body: JSON.stringify({ input, sessionToken }),
  });

  const data = await res.json();
  const predictions = (data.suggestions || [])
    .filter((s: any) => s.placePrediction)
    .map((s: any) => ({
      placeId: s.placePrediction.placeId,
      text: s.placePrediction.text?.text || '',
    }));

  return NextResponse.json({ predictions });
}
