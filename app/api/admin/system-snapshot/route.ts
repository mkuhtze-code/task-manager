import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { requireAdmin } from '@/lib/admin/requireAdmin';
import { writeAdminAudit } from '@/lib/admin/audit';
import { logError } from '@/lib/logError';
import type { SystemState } from '@/lib/admin/types';

type StatusRow = {
  key: string;
  label: string;
  state: SystemState;
  detail: string;
};

/**
 * Config and health signals only — no tokens, connection emails, or secrets.
 */
export async function GET(req: NextRequest) {
  const access = await requireAdmin(req);
  if (!access.ok) return access.response;

  try {
    const generatedAt = new Date().toISOString();

    const [{ data: connections }, { count: pushCount }, { count: fcmCount }, { count: errorUnresolved }] =
      await Promise.all([
        supabaseAdmin.from('calendar_connections').select('provider, sync_status'),
        supabaseAdmin.from('push_subscriptions').select('*', { count: 'exact', head: true }),
        supabaseAdmin
          .from('fcm_web_tokens')
          .select('*', { count: 'exact', head: true })
          .eq('revoked', false),
        supabaseAdmin
          .from('error_logs')
          .select('*', { count: 'exact', head: true })
          .eq('resolved', false),
      ]);

    const rows = connections || [];
    const microsoft = rows.filter((c) => c.provider === 'microsoft');
    const inError = rows.filter((c) => c.sync_status === 'error');

    const vapidConfigured = Boolean(
      process.env.VAPID_SUBJECT &&
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
        process.env.VAPID_PRIVATE_KEY
    );
    const upstashConfigured = Boolean(
      process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    );
    const mapsConfigured = Boolean(process.env.GOOGLE_MAPS_API_KEY);
    const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);

    const integrations: StatusRow[] = [
      {
        key: 'microsoft-calendar',
        label: 'Microsoft calendar',
        state:
          microsoft.length === 0
            ? 'not_configured'
            : inError.length > 0
              ? 'warning'
              : 'operational',
        detail:
          microsoft.length === 0
            ? 'No Microsoft calendar connections.'
            : `${microsoft.length} connection${microsoft.length === 1 ? '' : 's'}${inError.length ? `, ${inError.length} in error` : ', syncing'}. Email addresses are not listed here.`,
      },
      {
        key: 'google-calendar',
        label: 'Google calendar',
        state: 'not_configured',
        detail: 'No Google OAuth calendar connection.',
      },
      {
        key: 'maps',
        label: 'Maps',
        state: mapsConfigured ? 'not_monitored' : 'not_configured',
        detail: mapsConfigured
          ? 'Google Maps key present. No live probe.'
          : 'Google Maps Platform key not configured.',
      },
    ];

    const notifications: StatusRow[] = [
      {
        key: 'web-push',
        label: 'Web Push (VAPID)',
        state: vapidConfigured ? 'operational' : 'not_configured',
        detail: vapidConfigured
          ? `Configured. ${pushCount ?? 0} browser subscription${(pushCount ?? 0) === 1 ? '' : 's'} (count only).`
          : 'VAPID credentials not configured.',
      },
      {
        key: 'fcm-web',
        label: 'FCM web tokens',
        state: (fcmCount ?? 0) > 0 ? 'operational' : 'not_configured',
        detail: `${fcmCount ?? 0} active web token${(fcmCount ?? 0) === 1 ? '' : 's'} (count only; tokens never returned).`,
      },
    ];

    const infrastructure: StatusRow[] = [
      {
        key: 'app',
        label: 'Dokkit application',
        state: 'operational',
        detail: 'This request succeeded against the live app.',
      },
      {
        key: 'database',
        label: 'Database',
        state: 'operational',
        detail: 'Supabase queries completed for this snapshot.',
      },
      {
        key: 'auth',
        label: 'Authentication',
        state: 'operational',
        detail: 'Admin session verified.',
      },
      {
        key: 'rate-limit',
        label: 'Rate limiting',
        state: upstashConfigured ? 'not_monitored' : 'not_configured',
        detail: upstashConfigured
          ? 'Upstash Redis configured. No live health probe.'
          : 'Upstash not configured; rate limiting fails open.',
      },
      {
        key: 'vercel',
        label: 'Vercel',
        state: 'not_monitored',
        detail: 'Deployment platform is not polled from the app.',
      },
      {
        key: 'storage',
        label: 'Storage',
        state: 'not_configured',
        detail: 'No storage buckets in use — meeting media stays device-local.',
      },
      {
        key: 'errors',
        label: 'Unresolved errors',
        state: (errorUnresolved ?? 0) > 0 ? 'warning' : 'operational',
        detail: `${errorUnresolved ?? 0} unresolved error log entr${(errorUnresolved ?? 0) === 1 ? 'y' : 'ies'}.`,
      },
    ];

    const database = {
      state: 'operational' as SystemState,
      detail:
        'Postgres is reachable via service role. Table sizes and schema dumps are not exposed in Admin to avoid operational and privacy risk.',
      notes: [
        'Row counts for product surfaces are available under Product pages (aggregates only).',
        'No SQL console or raw table browser is provided here.',
        'Schema changes belong in migrations / Supabase SQL editor, not this UI.',
      ],
    };

    const business = {
      stripe: {
        state: (stripeConfigured ? 'not_monitored' : 'not_configured') as SystemState,
        detail: stripeConfigured
          ? 'STRIPE_SECRET_KEY is set. Revenue APIs are not wired yet.'
          : 'Stripe is not connected. No payment data exists in Dokkit.',
      },
    };

    await writeAdminAudit({
      actorId: access.userId,
      action: 'system_snapshot.view',
      metadata: {},
    });

    return NextResponse.json({
      generatedAt,
      privacyNote:
        'Configuration and counts only. No API keys, tokens, or connected account emails are returned.',
      integrations,
      notifications,
      infrastructure,
      database,
      business,
    });
  } catch (error) {
    await logError('server', 'admin:system-snapshot', error, {}, access.userId);
    return NextResponse.json({ error: 'Could not load system status.' }, { status: 500 });
  }
}
