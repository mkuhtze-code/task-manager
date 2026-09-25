
import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/verifyUser';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { appBaseUrl, getStripe, getStripePriceMonthly, isStripeConfigured } from '@/lib/billing';

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

  const stripe = getStripe();
  const priceId = getStripePriceMonthly();
  const base = appBaseUrl();

  const { data: existing } = await supabaseAdmin
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('user_id', auth.userId)
    .maybeSingle();

  let customerId = existing?.stripe_customer_id as string | undefined;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: auth.email || undefined,
      metadata: { supabase_user_id: auth.userId },
    });
    customerId = customer.id;
    await supabaseAdmin.from('billing_customers').upsert({
      user_id: auth.userId,
      stripe_customer_id: customerId,
      email: auth.email || null,
      updated_at: new Date().toISOString(),
    });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: auth.userId,
    metadata: { supabase_user_id: auth.userId },
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${base}/account/billing?checkout=success`,
    cancel_url: `${base}/account/billing?checkout=cancel`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
