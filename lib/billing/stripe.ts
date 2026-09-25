import Stripe from 'stripe';

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  if (!stripe) {
    // apiVersion: pin when upgrading the stripe package; omit uses account default.
    stripe = new Stripe(key, {
      // @ts-expect-error allow SDK default when versions drift
      apiVersion: undefined,
      typescript: true,
    });
  }
  return stripe;
}

export function getStripePriceMonthly(): string {
  const id = process.env.STRIPE_PRICE_MONTHLY;
  if (!id) throw new Error('STRIPE_PRICE_MONTHLY is not configured');
  return id;
}

export function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
}

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PRICE_MONTHLY &&
      process.env.STRIPE_WEBHOOK_SECRET
  );
}
