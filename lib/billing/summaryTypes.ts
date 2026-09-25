export type BillingSummary = {
  email: string | null;
  tier: 'free' | 'premium' | 'trusted_tester';
  planName: string;
  planSummary: string;
  isPro: boolean;
  billingStatus: string;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  priceId: string | null;
  /** Human amount e.g. "$6.00" when Stripe price retrieved */
  priceDisplay: string | null;
  interval: 'month' | 'year' | null;
  currency: string | null;
  paymentMethod: {
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
  } | null;
  stripeConfigured: boolean;
  hasStripeCustomer: boolean;
  storageUsedBytes: number;
  storageLimitBytes: number;
};

export type BillingInvoiceRow = {
  id: string;
  number: string | null;
  status: string | null;
  amountPaid: number;
  currency: string;
  created: number;
  pdfUrl: string | null;
  hostedUrl: string | null;
};
