import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/verifyUser';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  appBaseUrl,
  getStripe,
  getStripePriceMonthly,
  isStripeConfigured,
  resolveEntitlements,
} from '@/lib/billing';

const BLOCKING_STATUSES = [
  'active',
  'trialing',
  'past_due',
  'unpaid',
  'incomplete',
] as const;

/**
 * Create Stripe Checkout for Dokkit monthly plan.
 * Blocks if the account already has a non-terminal subscription (one sub per person).
 */
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

  // Prefer local subscription rows (webhook source of truth)
  const { data: openSubs } = await supabaseAdmin
    .from('billing_subscriptions')
    .select('id, status')
    .eq('user_id', auth.userId)
    .in('status', [...BLOCKING_STATUSES])
    .limit(1);

  if (openSubs && openSubs.length > 0) {
    return NextResponse.json(
      {
        error: 'You already have a Dokkit subscription. Manage it from billing.',
        code: 'already_subscribed',
        usePortal: true,
      },
      { status: 409 }
    );
  }

  // Trusted tester / premium without a sub row — send to portal or account
  const { data: settings } = await supabaseAdmin
    .from('user_settings')
    .select('account_tier, billing_status')
    .eq('user_id', auth.userId)
    .maybeSingle();

  const ent = resolveEntitlements({
    accountTier: settings?.account_tier as string | undefined,
    billingStatus: settings?.billing_status as string | undefined,
  });

  if (ent.isPro && settings?.account_tier === 'premium') {
    return NextResponse.json(
      {
        error: 'Your account already has Dokkit access. Manage billing from Account.',
        code: 'already_entitled',
        usePortal: true,
      },
      { status: 409 }
    );
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
    success_url: `${base}/app/account/billing?checkout=success`,
    cancel_url: `${base}/app/account/billing?checkout=cancel`,
    allow_promotion_codes: true,
  });

  return NextResponse.json({ url: session.url });
}
