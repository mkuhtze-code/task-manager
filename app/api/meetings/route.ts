import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/verifyUser';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { assertCanUseMeetings } from '@/lib/billing/serverEntitlements';

export const runtime = 'nodejs';

type CreateBody = {
  text?: string;
  durationMins?: number;
  startTime?: string | null;
  jobId?: string | null;
  locationText?: string | null;
  lat?: number | null;
  lng?: number | null;
  notes?: string | null;
};

/**
 * Create a meeting — entitlement enforced server-side (not only UI).
 */
export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const gate = await assertCanUseMeetings(auth.userId);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: CreateBody = {};
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const text = (body.text || '').trim();
  if (!text) {
    return NextResponse.json({ error: 'Meeting text is required' }, { status: 400 });
  }

  const durationMins =
    typeof body.durationMins === 'number' && body.durationMins > 0
      ? Math.round(body.durationMins)
      : 60;

  const { data, error } = await supabaseAdmin
    .from('meetings')
    .insert({
      user_id: auth.userId,
      text,
      duration_mins: durationMins,
      start_time: body.startTime ?? null,
      source: 'manual',
      job_id: body.jobId ?? null,
      location_text: body.locationText ?? null,
      lat: body.lat ?? null,
      lng: body.lng ?? null,
      notes: body.notes ?? null,
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[api/meetings] insert', error);
    return NextResponse.json(
      { error: "Couldn't record the meeting" },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: data.id });
}

