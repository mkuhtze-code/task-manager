import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUser } from '@/lib/verifyUser';
import { checkRateLimit } from '@/lib/ratelimit';

type Coords = { lat: number; lng: number };
type RouteLeg = { mins: number; polyline: string | null };

// 'HH:MM' → minutes since midnight, defaulting to the schema's 16:00.
function timeToMinutes(t: string | null | undefined): number {
  const [h, m] = (t || '16:00').split(':').map((n) => parseInt(n, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 16 * 60;
  return h * 60 + m;
}

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

  const { orderedTaskIds, baseLabel, origin, nowLocalMins, remainingTaskMins } = await req.json();
  if (!Array.isArray(orderedTaskIds) || orderedTaskIds.length === 0) {
    return NextResponse.json({ error: 'orderedTaskIds is required' }, { status: 400 });
  }
  if (baseLabel !== 'work' && baseLabel !== 'home') {
    return NextResponse.json({ error: 'baseLabel must be work or home' }, { status: 400 });
  }

  // The client computes the local clock minutes at the moment of recalc and
  // the estimated duration of all tasks remaining before the return leg —
  // those live in browser-side history/estimate data the server can't
  // reproduce. They feed the predicted arrival used to pick the return
  // destination below. nowLocalMins must be 0–1439.
  const nowLocal = typeof nowLocalMins === 'number' && Number.isFinite(nowLocalMins) ? nowLocalMins : 0;
  const remainingMins =
    typeof remainingTaskMins === 'number' && Number.isFinite(remainingTaskMins) && remainingTaskMins >= 0
      ? remainingTaskMins
      : 0;

  // origin is the client's live GPS fix when the user granted location
  // permission. It is the starting point for the first leg; when absent,
  // that leg falls back to the stored Home/Work base below. The final
  // return leg separately targets Work, Home, or the origin per the
  // return-destination decision further down.
  let gpsOrigin: Coords | null = null;
  if (origin != null) {
    if (typeof origin !== 'object' || !Number.isFinite(origin.lat) || !Number.isFinite(origin.lng)) {
      return NextResponse.json({ error: 'origin must be { lat, lng }' }, { status: 400 });
    }
    gpsOrigin = { lat: origin.lat, lng: origin.lng };
  }

  // Base coordinates come from the verified user's own stored settings,
  // never from the client — the client only tells us which one (work vs
  // home) applies right now, not where it actually is. work_end drives the
  // return-destination decision below.
  const { data: settings } = await supabaseAdmin
    .from('user_settings')
    .select('home_lat, home_lng, work_lat, work_lng, work_end')
    .eq('user_id', auth.userId)
    .maybeSingle();

  const baseCoords: Coords | null =
    baseLabel === 'work'
      ? (settings?.work_lat != null && settings?.work_lng != null ? { lat: settings.work_lat, lng: settings.work_lng } : null)
      : (settings?.home_lat != null && settings?.home_lng != null ? { lat: settings.home_lat, lng: settings.home_lng } : null);

  const workCoords: Coords | null =
    settings?.work_lat != null && settings?.work_lng != null ? { lat: settings.work_lat, lng: settings.work_lng } : null;
  const homeCoords: Coords | null =
    settings?.home_lat != null && settings?.home_lng != null ? { lat: settings.home_lat, lng: settings.home_lng } : null;
  const workEndMins = timeToMinutes(settings?.work_end);

  // The route starts at the live GPS position when the client supplied
  // one, otherwise at the Home/Work base. Without either, there is no
  // origin leg, only the between-stop legs.
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
    return NextResponse.json({
      ok: true,
      driveFromBaseMins: null,
      basePolyline: null,
      returnTo: null,
      returnLabel: null,
      legsComputed: 0,
      skipped: [],
    });
  }

  const skipped: string[] = [];
  const updates: { id: string; drive_mins_to_next: number; route_polyline: string | null }[] = [];
  let driveFromBaseMins: number | null = null;
  let basePolyline: string | null = null;
  let betweenLegsMins = 0;

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
      betweenLegsMins += leg.mins;
    } else {
      skipped.push(b.text);
    }
  }

  const last = located[located.length - 1];

  // ── Return destination decision ──────────────────────────────────
  // The route's final leg ends at Work when the predicted arrival there
  // is within an hour of the workday end, and at Home when running more
  // than an hour late. Predicted arrival = current local clock + all
  // remaining task duration (sent by the client) + the origin and
  // between-stop drive legs + the drive back to the candidate
  // destination, so longer-than-expected tasks push the arrival later and
  // can flip the choice from Work to Home. No Work → Home. No Home →
  // keep returning to the route's origin (the existing behaviour).
  const predictedArrivalMins =
    nowLocal + remainingMins + (driveFromBaseMins ?? 0) + betweenLegsMins;

  let returnTo: 'work' | 'home' | 'origin' = 'origin';
  let returnLabel = gpsOrigin ? 'current location' : baseLabel === 'work' ? 'Office' : 'Home';
  let returnCoords: Coords | null = originCoords;
  let returnLeg: RouteLeg | null = null;

  if (workCoords) {
    // Predict using the drive back to Work specifically — that is the
    // arrival that decides whether heading to the office still makes
    // sense; a Home return is the late-arrival fallback.
    const workReturnLeg = await computeRouteLeg({ lat: last.lat, lng: last.lng }, workCoords);
    if (predictedArrivalMins + (workReturnLeg?.mins ?? 0) <= workEndMins + 60) {
      returnTo = 'work';
      returnLabel = 'Work';
      returnCoords = workCoords;
      returnLeg = workReturnLeg;
    } else if (homeCoords) {
      returnTo = 'home';
      returnLabel = 'Home';
      returnCoords = homeCoords;
    }
  } else if (homeCoords) {
    returnTo = 'home';
    returnLabel = 'Home';
    returnCoords = homeCoords;
  }

  // The return leg rides on the last located task's own leg fields,
  // mirroring how Travel stores the drive back to base — so MapView draws
  // the closing polyline to the chosen destination with the same
  // per-activity route_polyline convention and the Today list can show a
  // final leg row.
  if (returnCoords) {
    const leg = returnLeg ?? (await computeRouteLeg({ lat: last.lat, lng: last.lng }, returnCoords));
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

  return NextResponse.json({
    ok: true,
    driveFromBaseMins,
    basePolyline,
    returnTo,
    returnLabel,
    legsComputed: updates.length,
    skipped,
  });
}
