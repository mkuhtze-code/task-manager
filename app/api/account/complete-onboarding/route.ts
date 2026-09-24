import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Persist onboarding answers + priors with the service role.
 * Client RLS updates were matching 0 rows (or not returning the row),
 * which left onboarded=false and re-opened the questionnaire in a loop.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace(/^Bearer\s+/i, '');
  if (!token) {
    return NextResponse.json({ error: 'Missing authorization token' }, { status: 401 });
  }

  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !authData.user) {
    return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
  }

  const userId = authData.user.id;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Only allow known columns — never accept arbitrary client keys.
  const patch: Record<string, unknown> = {
    user_id: userId,
    onboarded: true,
  };

  const copy = (key: string) => {
    if (body[key] !== undefined) patch[key] = body[key];
  };

  copy('work_start');
  copy('work_end');
  copy('work_days');
  copy('home_location_text');
  copy('home_lat');
  copy('home_lng');
  copy('work_location_text');
  copy('work_lat');
  copy('work_lng');
  copy('onboarding_answers');
  copy('role');
  copy('work_type');
  copy('carry_style');
  copy('day_shape');
  copy('soft_cost_scale');
  copy('same_day_protection');
  copy('jobs_emphasis');
  copy('travel_emphasis');
  copy('meetings_emphasis');
  copy('sort_mode');

  const { data, error } = await supabaseAdmin
    .from('user_settings')
    .upsert(patch, { onConflict: 'user_id' })
    .select('onboarded')
    .maybeSingle();

  if (error) {
    console.error('[complete-onboarding]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data || data.onboarded !== true) {
    return NextResponse.json(
      { error: 'Could not set onboarded flag. Ensure user_settings exists and migrations are applied.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, onboarded: true });
}
