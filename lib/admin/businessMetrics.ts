import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { isStripeConfigured, getStripe } from '@/lib/billing';
import type { SystemState } from '@/lib/admin/types';

export type SubStatusCounts = {
  active: number;
  trialing: number;
  past_due: number;
  canceled: number;
  unpaid: number;
  incomplete: number;
  other: number;
  total: number;
};

export type TierCounts = {
  free: number;
  premium: number;
  trusted_tester: number;
};

export type BusinessMetrics = {
  generatedAt: string;
  stripe: {
    configured: boolean;
    state: SystemState;
    detail: string;
    mode: 'test' | 'live' | 'unknown';
  };
  tiers: TierCounts;
  subscriptions: SubStatusCounts;
  /** Estimated monthly recurring from active+trialing rows × configured price unit (if known). */
  estimatedMrrDisplay: string | null;
  estimatedMrrCents: number | null;
  currency: string | null;
  /** Recent billing_events count (7d) — operational signal only. */
  billingEvents7d: number;
  failedPaymentsSignal: number;
  attention: { title: string; detail: string; href: string }[];
};

function emptySubs(): SubStatusCounts {
  return {
    active: 0,
    trialing: 0,
    past_due: 0,
    canceled: 0,
    unpaid: 0,
    incomplete: 0,
    other: 0,
    total: 0,
  };
}

/**
 * Aggregate business metrics for Admin.
 * SOC 2 / ISO 27001: aggregates only — no card numbers, no full Stripe customer dumps.
 */
export async function loadBusinessMetrics(): Promise<BusinessMetrics> {
  const generatedAt = new Date().toISOString();
  const configured = isStripeConfigured();
  const stripeKey = process.env.STRIPE_SECRET_KEY || '';
  const mode: 'test' | 'live' | 'unknown' = stripeKey.startsWith('sk_live')
    ? 'live'
    : stripeKey.startsWith('sk_test')
      ? 'test'
      : configured
        ? 'unknown'
        : 'unknown';

  const stripe = {
    configured,
    state: (configured ? 'operational' : 'not_configured') as SystemState,
    detail: configured
      ? `Stripe secret key present (${mode} mode). Webhook secret ${
          process.env.STRIPE_WEBHOOK_SECRET ? 'configured' : 'missing'
        }.`
      : 'Stripe is not configured. Set STRIPE_SECRET_KEY and related env vars.',
    mode,
  };

  const [{ data: settingsRows }, { data: subRows }, { count: events7d }] =
    await Promise.all([
      supabaseAdmin.from('user_settings').select('account_tier'),
      supabaseAdmin
        .from('billing_subscriptions')
        .select('status, stripe_price_id, cancel_at_period_end'),
      supabaseAdmin
        .from('billing_events')
        .select('*', { count: 'exact', head: true })
        .gte(
          'created_at',
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        ),
    ]);

  const tiers: TierCounts = { free: 0, premium: 0, trusted_tester: 0 };
  for (const row of settingsRows || []) {
    const t = (row as { account_tier?: string }).account_tier;
    if (t === 'premium') tiers.premium += 1;
    else if (t === 'trusted_tester') tiers.trusted_tester += 1;
    else tiers.free += 1;
  }

  const subscriptions = emptySubs();
  for (const row of subRows || []) {
    const status = String((row as { status?: string }).status || 'other');
    subscriptions.total += 1;
    if (status === 'active') subscriptions.active += 1;
    else if (status === 'trialing') subscriptions.trialing += 1;
    else if (status === 'past_due') subscriptions.past_due += 1;
    else if (status === 'canceled') subscriptions.canceled += 1;
    else if (status === 'unpaid') subscriptions.unpaid += 1;
    else if (status === 'incomplete' || status === 'incomplete_expired')
      subscriptions.incomplete += 1;
    else subscriptions.other += 1;
  }

  let estimatedMrrCents: number | null = null;
  let currency: string | null = null;
  let estimatedMrrDisplay: string | null = null;

  if (configured) {
    try {
      const stripeClient = getStripe();
      const priceId = process.env.STRIPE_PRICE_MONTHLY;
      if (priceId) {
        const price = await stripeClient.prices.retrieve(priceId);
        const unit = price.unit_amount ?? 0;
        currency = (price.currency || 'nzd').toUpperCase();
        const paying = subscriptions.active + subscriptions.trialing;
        estimatedMrrCents = unit * paying;
        estimatedMrrDisplay = new Intl.NumberFormat(undefined, {
          style: 'currency',
          currency,
        }).format(estimatedMrrCents / 100);
      }
    } catch {
      // Price retrieve failed — leave MRR null; do not invent numbers
    }
  }

  const failedPaymentsSignal = subscriptions.past_due + subscriptions.unpaid;
  const attention: BusinessMetrics['attention'] = [];
  if (!configured) {
    attention.push({
      title: 'Stripe not configured',
      detail: 'Billing APIs cannot process upgrades until env is set.',
      href: '/admin/stripe',
    });
  } else if (!process.env.STRIPE_WEBHOOK_SECRET) {
    attention.push({
      title: 'Webhook secret missing',
      detail: 'Subscription state may not sync from Stripe without STRIPE_WEBHOOK_SECRET.',
      href: '/admin/stripe',
    });
  }
  if (failedPaymentsSignal > 0) {
    attention.push({
      title: 'Payment attention',
      detail: `${failedPaymentsSignal} subscription(s) past_due or unpaid.`,
      href: '/admin/subscriptions',
    });
  }

  return {
    generatedAt,
    stripe,
    tiers,
    subscriptions,
    estimatedMrrDisplay,
    estimatedMrrCents,
    currency,
    billingEvents7d: events7d ?? 0,
    failedPaymentsSignal,
    attention,
  };
}
