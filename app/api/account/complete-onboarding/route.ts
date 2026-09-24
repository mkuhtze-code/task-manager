import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * Persist onboarding with service role.
 * Strategy: ensure row → set onboarded=true (minimal) → verify → patch profile fields.
 * Profile field failures must not leave the user stuck in the questionnaire.
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
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // 1) Ensure a settings row exists (initialize may have been skipped).
  const { error: ensureError } = await supabaseAdmin
    .from('user_settings')
    .upsert({ user_id: userId }, { onConflict: 'user_id', ignoreDuplicates: true });
  if (ensureError) {
    console.error('[complete-onboarding] ensure row', ensureError);
    return NextResponse.json(
      { error: `Could not create user_settings: ${ensureError.message}` },
      { status: 500 }
    );
  }

  // 2) Set onboarded alone — smallest possible write.
  const { error: flagError } = await supabaseAdmin
    .from('user_settings')
    .update({ onboarded: true })
    .eq('user_id', userId);
  if (flagError) {
    console.error('[complete-onboarding] set onboarded', flagError);
    return NextResponse.json(
      {
        error: `Could not set onboarded: ${flagError.message}. If the column is missing, run the onboarding migrations.`,
      },
      { status: 500 }
    );
  }

  // 3) Verify with a separate read (do not rely on RETURNING alone).
  const { data: row, error: readError } = await supabaseAdmin
    .from('user_settings')
    .select('onboarded')
    .eq('user_id', userId)
    .maybeSingle();

  if (readError) {
    console.error('[complete-onboarding] read back', readError);
    return NextResponse.json({ error: `Could not verify onboarded: ${readError.message}` }, { status: 500 });
  }

  if (!row) {
    return NextResponse.json(
      { error: 'user_settings row missing after upsert. Check Supabase project and service role key.' },
      { status: 500 }
    );
  }

  if (row.onboarded !== true) {
    return NextResponse.json(
      {
        error:
          'onboarded is still false after update. A database trigger may be resetting it (e.g. force_onboarding_for_test_user). Run the SQL in complete-onboarding-fix.sql.',
      },
      { status: 500 }
    );
  }

  // 4) Best-effort profile / hours / priors — failure here must not reopen onboarding.
  const profilePatch: Record<string, unknown> = {};
  const copy = (key: string) => {
    if (body[key] !== undefined) profilePatch[key] = body[key];
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

  if (Object.keys(profilePatch).length > 0) {
    const { error: profileError } = await supabaseAdmin
      .from('user_settings')
      .update(profilePatch)
      .eq('user_id', userId);
    if (profileError) {
      // Log but succeed — user is onboarded.
      console.error('[complete-onboarding] profile patch (non-fatal)', profileError);
    }
  }

  return NextResponse.json({ ok: true, onboarded: true });
}
