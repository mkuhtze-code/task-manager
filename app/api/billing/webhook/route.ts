
import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getStripe, tierFromStripeStatus } from '@/lib/billing';

export const runtime = 'nodejs';

async function alreadyProcessed(eventId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('billing_events')
    .select('id')
    .eq('stripe_event_id', eventId)
    .maybeSingle();
  return Boolean(data);
}

async function recordEvent(event: Stripe.Event) {
  await supabaseAdmin.from('billing_events').insert({
    stripe_event_id: event.id,
    event_type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });
}

async function userIdFromCustomer(customerId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('billing_customers')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle();
  return (data?.user_id as string) || null;
}

async function applySubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  if (!customerId) return;

  let userId = await userIdFromCustomer(customerId);
  if (!userId && sub.metadata?.supabase_user_id) {
    userId = sub.metadata.supabase_user_id;
  }
  if (!userId) {
    console.error('[billing.webhook] no user for customer', customerId);
    return;
  }

  const priceId =
    sub.items.data[0]?.price?.id ||
    (typeof sub.items.data[0]?.price === 'string' ? sub.items.data[0]?.price : null);

  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  await supabaseAdmin.from('billing_subscriptions').upsert({
    user_id: userId,
    stripe_subscription_id: sub.id,
    stripe_price_id: priceId,
    status: sub.status,
    current_period_end: periodEnd,
    cancel_at_period_end: Boolean(sub.cancel_at_period_end),
    updated_at: new Date().toISOString(),
  });

  const { accountTier, billingStatus } = tierFromStripeStatus(sub.status);

  // Do not demote trusted_tester via Stripe cancel.
  const { data: settings } = await supabaseAdmin
    .from('user_settings')
    .select('account_tier')
    .eq('user_id', userId)
    .maybeSingle();

  const currentTier = settings?.account_tier as string | undefined;
  const nextTier =
    currentTier === 'trusted_tester' ? 'trusted_tester' : accountTier;

  await supabaseAdmin.from('user_settings').upsert({
    user_id: userId,
    account_tier: nextTier,
    billing_status: billingStatus,
  });
}

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, sig, secret);
  } catch (err) {
    console.error('[billing.webhook] signature', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  if (await alreadyProcessed(event.id)) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.customer && session.client_reference_id) {
          await supabaseAdmin.from('billing_customers').upsert({
            user_id: session.client_reference_id,
            stripe_customer_id:
              typeof session.customer === 'string'
                ? session.customer
                : session.customer.id,
            email: session.customer_details?.email || null,
            updated_at: new Date().toISOString(),
          });
        }
        if (session.subscription) {
          const subId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id;
          const sub = await getStripe().subscriptions.retrieve(subId);
          await applySubscription(sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        await applySubscription(event.data.object as Stripe.Subscription);
        break;
      }
      case 'invoice.payment_failed': {
        // Ensure past_due is reflected even if subscription.updated is delayed
        const inv = event.data.object as Stripe.Invoice;
        const subRef = inv.subscription;
        if (subRef) {
          const subId = typeof subRef === 'string' ? subRef : subRef.id;
          const sub = await getStripe().subscriptions.retrieve(subId);
          await applySubscription(sub);
        }
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        const inv = event.data.object as Stripe.Invoice;
        const subRef = inv.subscription;
        if (subRef) {
          const subId = typeof subRef === 'string' ? subRef : subRef.id;
          const sub = await getStripe().subscriptions.retrieve(subId);
          await applySubscription(sub);
        }
        break;
      }
      default:
        break;
    }

    await recordEvent(event);
  } catch (err) {
    console.error('[billing.webhook] handler', err);
    return NextResponse.json({ error: 'Handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
