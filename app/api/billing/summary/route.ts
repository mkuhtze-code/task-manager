import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/verifyUser';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  getStripe,
  isStripeConfigured,
  PLAN_COPY,
  resolveEntitlements,
} from '@/lib/billing';
import type { BillingSummary } from '@/lib/billing/summaryTypes';
import { DEFAULT_STORAGE_LIMIT_BYTES } from '@/lib/storageQuota';

export const runtime = 'nodejs';

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

export async function GET(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { data: settings } = await supabaseAdmin
    .from('user_settings')
    .select('account_tier, billing_status, storage_used_bytes, storage_limit_bytes')
    .eq('user_id', auth.userId)
    .maybeSingle();

  const { data: subRow } = await supabaseAdmin
    .from('billing_subscriptions')
    .select(
      'stripe_subscription_id, stripe_price_id, status, current_period_end, cancel_at_period_end'
    )
    .eq('user_id', auth.userId)
    .maybeSingle();

  const { data: custRow } = await supabaseAdmin
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('user_id', auth.userId)
    .maybeSingle();

  const ent = resolveEntitlements({
    accountTier: settings?.account_tier,
    billingStatus: settings?.billing_status || subRow?.status,
  });

  const planKey = ent.tier;
  const copy = PLAN_COPY[planKey] || PLAN_COPY.free;

  const summary: BillingSummary = {
    email: auth.email,
    tier: ent.tier,
    planName: copy.name,
    planSummary: copy.summary,
    isPro: ent.isPro,
    billingStatus: ent.billingStatus,
    subscriptionStatus: (subRow?.status as string) || null,
    cancelAtPeriodEnd: Boolean(subRow?.cancel_at_period_end),
    currentPeriodEnd: (subRow?.current_period_end as string) || null,
    priceId: (subRow?.stripe_price_id as string) || null,
    priceDisplay: null,
    interval: null,
    currency: null,
    paymentMethod: null,
    stripeConfigured: isStripeConfigured(),
    hasStripeCustomer: Boolean(custRow?.stripe_customer_id),
    storageUsedBytes: Number(settings?.storage_used_bytes ?? 0),
    storageLimitBytes:
      Number(settings?.storage_limit_bytes ?? 0) || DEFAULT_STORAGE_LIMIT_BYTES,
  };

  if (isStripeConfigured() && custRow?.stripe_customer_id) {
    try {
      const stripe = getStripe();
      const customerId = custRow.stripe_customer_id as string;

      const customer = await stripe.customers.retrieve(customerId, {
        expand: ['invoice_settings.default_payment_method'],
      });

      if (!customer.deleted) {
        const pm = customer.invoice_settings?.default_payment_method;
        if (pm && typeof pm !== 'string' && pm.card) {
          summary.paymentMethod = {
            brand: pm.card.brand || null,
            last4: pm.card.last4 || null,
            expMonth: pm.card.exp_month ?? null,
            expYear: pm.card.exp_year ?? null,
          };
        }
      }

      const subId = subRow?.stripe_subscription_id as string | undefined;
      if (subId) {
        const sub = await stripe.subscriptions.retrieve(subId);
        const item = sub.items.data[0];
        const price = item?.price;
        if (price) {
          summary.priceId = price.id;
          summary.currency = price.currency || null;
          summary.interval =
            price.recurring?.interval === 'year'
              ? 'year'
              : price.recurring?.interval === 'month'
                ? 'month'
                : null;
          if (typeof price.unit_amount === 'number') {
            summary.priceDisplay = formatMoney(
              price.unit_amount,
              price.currency || 'nzd'
            );
          }
        }
        if (sub.current_period_end) {
          summary.currentPeriodEnd = new Date(
            sub.current_period_end * 1000
          ).toISOString();
        }
        summary.subscriptionStatus = sub.status;
        summary.cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);
      }
    } catch (err) {
      console.error('[billing.summary] stripe', err);
      // Return DB-backed summary; UI can still work
    }
  }

  return NextResponse.json(summary);
}

