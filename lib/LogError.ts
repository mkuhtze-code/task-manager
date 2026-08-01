import { supabaseAdmin } from '@/lib/supabaseAdmin';

// Central place every route and the client error boundary funnel through.
// Always console.errors first (so Vercel's own logs still catch it even
// if the DB write itself fails), then best-effort writes to error_logs so
// it's visible in the admin Error Log page without digging through logs.
export async function logError(
  source: 'server' | 'client',
  route: string,
  error: unknown,
  context?: Record<string, any>,
  userId?: string | null
) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error(`[${source}:${route}]`, message, context || '');

  try {
    await supabaseAdmin.from('error_logs').insert({
      source,
      route,
      message,
      stack: stack || null,
      context: context || null,
      user_id: userId || null,
    });
  } catch (writeErr) {
    console.error('Failed to write to error_logs', writeErr);
  }
}
