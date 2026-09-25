import { NextRequest, NextResponse } from 'next/server';
import { verifyUser } from '@/lib/verifyUser';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { getStripe, isStripeConfigured } from '@/lib/billing';
import type { BillingInvoiceRow } from '@/lib/billing/summaryTypes';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  if (!isStripeConfigured()) {
    return NextResponse.json({ invoices: [] as BillingInvoiceRow[] });
  }

  const { data: custRow } = await supabaseAdmin
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (!custRow?.stripe_customer_id) {
    return NextResponse.json({ invoices: [] as BillingInvoiceRow[] });
  }

  try {
    const stripe = getStripe();
    const list = await stripe.invoices.list({
      customer: custRow.stripe_customer_id as string,
      limit: 24,
    });

    const invoices: BillingInvoiceRow[] = list.data.map((inv) => ({
      id: inv.id,
      number: inv.number,
      status: inv.status,
      amountPaid: inv.amount_paid ?? inv.total ?? 0,
      currency: inv.currency || 'nzd',
      created: inv.created,
      pdfUrl: inv.invoice_pdf || null,
      hostedUrl: inv.hosted_invoice_url || null,
    }));

    return NextResponse.json({ invoices });
  } catch (err) {
    console.error('[billing.invoices]', err);
    return NextResponse.json(
      { error: 'Could not load invoices', invoices: [] },
      { status: 502 }
    );
  }
}
