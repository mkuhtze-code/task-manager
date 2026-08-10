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
  return Math.round(parseInt(String(route.duration).replace('s', ''), 10) / 60);
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

  const { orderedTaskIds, baseLabel } = await req.json();
  if (!Array.isArray(orderedTaskIds) || orderedTaskIds.length === 0) {
    return NextResponse.json({ error: 'orderedTaskIds is required' }, { status: 400 });
  }
  if (baseLabel !== 'work' && baseLabel !== 'home') {
    return NextResponse.json({ error: 'baseLabel must be work or home' }, { status: 400 });
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
    return NextResponse.json({ ok: true, driveFromBaseMins: null, driveToBaseMins: null, legsComputed: 0, skipped: [] });
  }

  const skipped: string[] = [];
  const updates: { id: string; drive_mins_to_next: number }[] = [];
  let driveFromBaseMins: number | null = null;
  let driveToBaseMins: number | null = null;

  if (baseCoords) {
    const first = located[0];
    const leg = await computeRouteLeg(baseCoords, { lat: first.lat, lng: first.lng });
    if (leg !== null) driveFromBaseMins = leg;
    else skipped.push(first.text);
  }

  for (let i = 0; i < located.length - 1; i++) {
    const a = located[i];
    const b = located[i + 1];
    const leg = await computeRouteLeg({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
    if (leg !== null) {
      updates.push({ id: a.id, drive_mins_to_next: leg });
    } else {
      skipped.push(b.text);
    }
  }

  if (baseCoords) {
    const last = located[located.length - 1];
    const leg = await computeRouteLeg({ lat: last.lat, lng: last.lng }, baseCoords);
    driveToBaseMins = leg ?? 0;
  }

  await Promise.all(
    updates.map((u) => supabaseAdmin.from('tasks').update({ drive_mins_to_next: u.drive_mins_to_next }).eq('id', u.id))
  );

  return NextResponse.json({ ok: true, driveFromBaseMins, driveToBaseMins, legsComputed: updates.length, skipped });
}
