import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUser } from '@/lib/verifyUser';
import { checkRateLimit } from '@/lib/ratelimit';

type Coords = { lat: number; lng: number };
type RouteLeg = { mins: number; polyline: string | null };

async function computeRouteLeg(origin: Coords, destination: Coords): Promise<RouteLeg | null> {
  const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': process.env.GOOGLE_MAPS_API_KEY as string,
      'X-Goog-FieldMask': 'routes.duration,routes.polyline.encodedPolyline',
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
  return {
    mins: Math.round(seconds / 60),
    polyline: route.polyline?.encodedPolyline || null,
  };
}

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { allowed } = await checkRateLimit(`user:${auth.userId}:today-calculate-route`);
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests, try again shortly.' }, { status: 429 });
  }

  const { orderedTaskIds, baseLabel, origin } = await req.json();
  if (!Array.isArray(orderedTaskIds) || orderedTaskIds.length === 0) {
    return NextResponse.json({ error: 'orderedTaskIds is required' }, { status: 400 });
  }
  if (baseLabel !== 'work' && baseLabel !== 'home') {
    return NextResponse.json({ error: 'baseLabel must be work or home' }, { status: 400 });
  }

  // origin is the client's live GPS fix when the user granted location
  // permission. It is the starting point for the first and last leg; when
  // absent, those legs fall back to the stored Home/Work base below.
  let gpsOrigin: Coords | null = null;
  if (origin != null) {
    if (typeof origin !== 'object' || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
      return NextResponse.json({ error: 'origin must be { lat, lng }' }, { status: 400 });
    }
    gpsOrigin = { lat: origin.lat, lng: origin.lng };
  }

  // Base coordinates come from the verified user's own stored settings,
  // never from the client — the client only tells us which one (work vs
  // home) applies right now, not where it actually is.
  const { data: settings } = await supabaseAdmin
    .from('user_settings')
    .select('home_lat, home_lng, work_lat, work_lng')
    .eq('user_id', auth.userId)
    .maybeSingle();

  const baseCoords: Coords | null =
    baseLabel === 'work'
      ? (settings?.work_lat != null && settings?.work_lng != null ? { lat: settings.work_lat, lng: settings.work_lng } : null)
      : (settings?.home_lat != null && settings?.home_lng != null ? { lat: settings.home_lat, lng: settings.home_lng } : null);

  // The route starts and ends at the live GPS position when the client
  // supplied one; otherwise at the Home/Work base. Without either, there
  // is no origin leg, only the between-stop legs.
  const originCoords = gpsOrigin ?? baseCoords;

  // Fetch tasks fresh, scoped to this user — never trust client-sent
  // coordinates for the actual route legs, only the requested order.
  const { data: tasks, error: taskError } = await supabaseAdmin
    .from('tasks')
    .select('id, lat, lng, text')
    .eq('user_id', auth.userId)
    .in('id', orderedTaskIds);

  if (taskError) {
    return NextResponse.json({ error: taskError.message }, { status: 500 });
  }

  const byId: Record<string, { id: string; lat: number | null; lng: number | null; text: string }> = {};
  (tasks || []).forEach((t) => (byId[t.id] = t));

  type LocatedTask = { id: string; lat: number; lng: number; text: string };

  const located = orderedTaskIds
    .map((id: string) => byId[id])
    .filter((t): t is LocatedTask => !!t && t.lat != null && t.lng != null);

  if (located.length === 0) {
    return NextResponse.json({ ok: true, driveFromBaseMins: null, basePolyline: null, legsComputed: 0, skipped: [] });
  }

  const skipped: string[] = [];
  const updates: { id: string; drive_mins_to_next: number; route_polyline: string | null }[] = [];
  let driveFromBaseMins: number | null = null;
  let basePolyline: string | null = null;

  if (originCoords) {
    const first = located[0];
    const leg = await computeRouteLeg(originCoords, { lat: first.lat, lng: first.lng });
    if (leg !== null) {
      driveFromBaseMins = leg.mins;
      basePolyline = leg.polyline;
    } else {
      skipped.push(first.text);
    }
  }

  for (let i = 0; i < located.length - 1; i++) {
    const a = located[i];
    const b = located[i + 1];
    const leg = await computeRouteLeg({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
    if (leg !== null) {
      updates.push({ id: a.id, drive_mins_to_next: leg.mins, route_polyline: leg.polyline });
    } else {
      skipped.push(b.text);
    }
  }

  // The return leg (last stop back to the origin) rides on the last
  // located task's own leg fields, mirroring how Travel stores the drive
  // back to base — so MapView can draw the closing polyline with the same
  // per-activity route_polyline convention and the Today list can show a
  // final leg row.
  if (originCoords) {
    const last = located[located.length - 1];
    const leg = await computeRouteLeg({ lat: last.lat, lng: last.lng }, originCoords);
    updates.push({ id: last.id, drive_mins_to_next: leg?.mins ?? 0, route_polyline: leg?.polyline ?? null });
  }

  await Promise.all(
    updates.map((u) =>
      supabaseAdmin
        .from('tasks')
        .update({ drive_mins_to_next: u.drive_mins_to_next, route_polyline: u.route_polyline })
        .eq('id', u.id)
    )
  );

  return NextResponse.json({ ok: true, driveFromBaseMins, basePolyline, legsComputed: updates.length, skipped });
}
