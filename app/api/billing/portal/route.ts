
import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/verifyUser';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { appBaseUrl, getStripe, isStripeConfigured } from '@/lib/billing';

export async function POST(req: NextRequest) {
  if (!isStripeConfigured()) {
    return NextResponse.json(
      { error: 'Billing is not configured yet.' },
      { status: 503 }
    );
  }

  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: row } = await supabaseAdmin
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (!row?.stripe_customer_id) {
    return NextResponse.json(
      { error: 'No billing account yet. Upgrade first.' },
      { status: 400 }
    );
  }

  const stripe = getStripe();
  const portal = await stripe.billingPortal.sessions.create({
    customer: row.stripe_customer_id as string,
    return_url: `${appBaseUrl()}/account/billing`,
  });

  return NextResponse.json({ url: portal.url });
}
