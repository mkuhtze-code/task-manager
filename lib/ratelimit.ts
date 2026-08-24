
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// One shared limiter: 20 requests per 60 seconds per key. Generous enough
// for normal use (including a buggy client accidentally double-firing),
// tight enough to blunt actual abuse or a leaked token being hammered.
// Tune per-route later if a specific endpoint needs to be stricter.
//
// Policy: every endpoint that calls checkRateLimit enforces authentication
// and authorization independently (verifyUser / admin checks / cron
// secret). The limiter is anti-abuse cost control, never an authorization
// boundary, so it deliberately fails OPEN when Upstash is unavailable —
// a missing configuration or a Redis outage degrades abuse protection,
// it must not take signups, route calculation, notifications or error
// logging down with an opaque 500. Failures are logged either way.

const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

let warnedUnconfigured = false;

export const ratelimit =
  redisUrl && redisToken
    ? new Ratelimit({
        redis: new Redis({ url: redisUrl, token: redisToken }),
        limiter: Ratelimit.slidingWindow(20, '60 s'),
        analytics: true,
      })
    : null;

export async function checkRateLimit(key: string): Promise<{ allowed: boolean; remaining: number }> {
  if (!ratelimit) {
    if (!warnedUnconfigured) {
      console.error(
        'Rate limiting is disabled: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are not configured. Failing open.'
      );
      warnedUnconfigured = true;
    }
    return { allowed: true, remaining: 0 };
  }

  try {
    const { success, remaining } = await ratelimit.limit(key);
    return { allowed: success, remaining };
  } catch (err) {
    console.error(`Rate limiter unavailable for "${key}", failing open:`, err);
    return { allowed: true, remaining: 0 };
  }
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}
