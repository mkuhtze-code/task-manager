import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUser } from '@/lib/verifyUser';
import { checkRateLimit } from '@/lib/ratelimit';

type Coords = { lat: number; lng: number };

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

  const seconds = parseInt(String(route.duration).replace('s', ''), 10);
  return Math.round(seconds / 60);
}

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  // Stricter key than a single geocode call, since this route can fire
  // several Routes API calls in one invocation (one per leg in the day's
  // chain) — the shared 20/60s limiter still applies per-key, but worth
  // keeping an eye on if a day with many stops gets rate-limited too
  // eagerly in practice; tighten or split into its own limiter if so.
  const { allowed } = await checkRateLimit(`user:${auth.userId}:travel-calculate-day`);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests, try again shortly.' }, { status: 429 });
  }

  const { trip_day_id } = await req.json();
  if (!trip_day_id || typeof trip_day_id !== 'string') {
    return NextResponse.json({ error: 'trip_day_id is required' }, { status: 400 });
  }

  // supabaseAdmin bypasses RLS, so ownership has to be checked explicitly —
  // confirm this trip_day's parent trip actually belongs to the caller.
  const { data: tripDay, error: dayError } = await supabaseAdmin
    .from('trip_days')
    .select('id, base_lat, base_lng, trip_id, trips!inner(user_id)')
    .eq('id', trip_day_id)
    .maybeSingle();

  if (dayError || !tripDay) {
    return NextResponse.json({ error: 'Trip day not found' }, { status: 404 });
  }
  if ((tripDay as any).trips?.user_id !== auth.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: activities, error: actError } = await supabaseAdmin
    .from('activities')
    .select('*')
    .eq('trip_day_id', trip_day_id)
    .neq('status', 'done')
    .order('order_index', { ascending: true });

  if (actError) {
    return NextResponse.json({ error: actError.message }, { status: 500 });
  }

  const stops = activities || [];
  const hasBase = tripDay.base_lat != null && tripDay.base_lng != null;
  const skipped: string[] = [];
  const updates: { id: string; drive_mins_to_next: number }[] = [];
  let driveFromBaseMins: number | null = null;

  // Leg: base -> first stop
  if (hasBase && stops.length > 0) {
    const first = stops[0];
    if (first.lat != null && first.lng != null) {
      driveFromBaseMins = await computeRouteLeg(
        { lat: tripDay.base_lat, lng: tripDay.base_lng },
        { lat: first.lat, lng: first.lng }
      );
      if (driveFromBaseMins === null) skipped.push(first.text);
    } else {
      skipped.push(first.text);
    }
  }

  // Legs: each consecutive pair of stops
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (a.lat == null || a.lng == null || b.lat == null || b.lng == null) {
      skipped.push(b.text);
      continue;
    }
    const mins = await computeRouteLeg({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
    if (mins !== null) {
      updates.push({ id: a.id, drive_mins_to_next: mins });
    } else {
      skipped.push(b.text);
    }
  }

  // Leg: last stop -> base (reuses the last stop's existing drive_mins_to_next
  // field, same as any other leg — no separate "return trip" concept needed)
  if (hasBase && stops.length > 0) {
    const last = stops[stops.length - 1];
    if (last.lat != null && last.lng != null) {
      const mins = await computeRouteLeg(
        { lat: last.lat, lng: last.lng },
        { lat: tripDay.base_lat, lng: tripDay.base_lng }
      );
      updates.push({ id: last.id, drive_mins_to_next: mins ?? 0 });
    }
  }

  await Promise.all(
    updates.map((u) =>
      supabaseAdmin.from('activities').update({ drive_mins_to_next: u.drive_mins_to_next }).eq('id', u.id)
    )
  );
  await supabaseAdmin.from('trip_days').update({ drive_from_base_mins: driveFromBaseMins }).eq('id', trip_day_id);

  return NextResponse.json({ ok: true, driveFromBaseMins, legsComputed: updates.length, skipped });
}
