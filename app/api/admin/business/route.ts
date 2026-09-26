import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { writeAdminAudit } from '@/lib/admin/audit';
import { loadBusinessMetrics } from '@/lib/admin/businessMetrics';
import { logError } from '@/lib/logError';

export const runtime = 'nodejs';

/**
 * Business metrics for Admin — aggregates only (SOC 2 / ISO 27001).
 * No card data, no Stripe customer PII dumps.
 */
export async function GET(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  try {
    const metrics = await loadBusinessMetrics();

    await writeAdminAudit({
      actorId: access.userId,
      action: 'business.metrics.read',
      targetType: 'system',
      targetId: null,
      metadata: { stripeConfigured: metrics.stripe.configured },
    });

    return NextResponse.json(metrics);
  } catch (err) {
    await logError('server', 'admin-business', err);
    return NextResponse.json(
      { error: 'Could not load business metrics' },
      { status: 500 }
    );
  }
}
