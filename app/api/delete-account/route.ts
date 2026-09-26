import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifyUser } from '@/lib/verifyUser';
import { checkRateLimit } from '@/lib/ratelimit';
import { getStripe, isStripeConfigured } from '@/lib/billing';
const MEDIA_BUCKET = 'dokkit-media';
import { logError } from '@/lib/logError';

/**
 * Cancel all non-terminal Stripe subscriptions for a customer immediately.
 * Deleting an account must not leave the customer charged.
 */
async function cancelStripeSubscriptionsForUser(userId: string): Promise<{
  canceled: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let canceled = 0;

  if (!isStripeConfigured()) {
    return { canceled: 0, errors: [] };
  }

  const { data: customer } = await supabaseAdmin
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  const customerId = customer?.stripe_customer_id as string | undefined;
  if (!customerId) {
    return { canceled: 0, errors: [] };
  }

  try {
    const stripe = getStripe();
    const subs = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 100,
    });

    for (const sub of subs.data) {
      if (
        sub.status === 'canceled' ||
        sub.status === 'incomplete_expired'
      ) {
        continue;
      }
      try {
        await stripe.subscriptions.cancel(sub.id, {
          invoice_now: false,
          prorate: true,
        });
        canceled += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'cancel failed';
        errors.push(`${sub.id}: ${msg}`);
        await logError('server', 'account-delete-stripe-cancel', e, {
          subscriptionId: sub.id,
        });
      }
    }

    // Local billing rows — keep for audit trail until user cascade removes them
    await supabaseAdmin
      .from('billing_subscriptions')
      .update({
        status: 'canceled',
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .neq('status', 'canceled');
  } catch (e) {
    await logError('server', 'account-delete-stripe', e, { userId });
    errors.push(e instanceof Error ? e.message : 'stripe list failed');
  }

  return { canceled, errors };
}

/** Best-effort remove of user media prefix (private bucket). */
async function removeUserMedia(userId: string): Promise<void> {
  try {
    const { data: top } = await supabaseAdmin.storage
      .from(MEDIA_BUCKET)
      .list(userId, { limit: 100 });

    if (!top?.length) return;

    for (const entry of top) {
      const prefix = `${userId}/${entry.name}`;
      // list one level deeper (meetings / jobs)
      const { data: mid } = await supabaseAdmin.storage
        .from(MEDIA_BUCKET)
        .list(prefix, { limit: 100 });
      if (!mid?.length) continue;
      for (const m of mid) {
        const midPath = `${prefix}/${m.name}`;
        const { data: files } = await supabaseAdmin.storage
          .from(MEDIA_BUCKET)
          .list(midPath, { limit: 200 });
        if (files?.length) {
          const paths = files.map((f) => `${midPath}/${f.name}`);
          await supabaseAdmin.storage.from(MEDIA_BUCKET).remove(paths);
        }
      }
    }
  } catch (e) {
    await logError('server', 'account-delete-storage', e, { userId });
  }
}

export async function POST(req: NextRequest) {
  const auth = await verifyUser(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { allowed } = await checkRateLimit(`user:${auth.userId}:delete-account`);
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests, try again shortly.' },
      { status: 429 }
    );
  }

  // 1) Stop billing first — never delete auth while still subscribed
  const stripeResult = await cancelStripeSubscriptionsForUser(auth.userId);
  if (stripeResult.errors.length > 0 && stripeResult.canceled === 0) {
    // Hard failure only if we could not cancel and there may still be active billing
    const { data: open } = await supabaseAdmin
      .from('billing_subscriptions')
      .select('id')
      .eq('user_id', auth.userId)
      .in('status', ['active', 'trialing', 'past_due', 'unpaid'])
      .limit(1);
    if (open && open.length > 0) {
      return NextResponse.json(
        {
          error:
            'Could not cancel your subscription. Please use Manage billing, then try again — or contact support@dokkit.space.',
        },
        { status: 502 }
      );
    }
  }

  // 2) Best-effort media cleanup (cascade does not remove Storage objects)
  await removeUserMedia(auth.userId);

  // 3) Delete auth user — ON DELETE CASCADE clears owned rows
  const { error } = await supabaseAdmin.auth.admin.deleteUser(auth.userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    subscriptionsCanceled: stripeResult.canceled,
  });
}

