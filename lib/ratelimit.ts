
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL as string,
  token: process.env.UPSTASH_REDIS_REST_TOKEN as string,
});

// One shared limiter: 20 requests per 60 seconds per key. Generous enough
// for normal use (including a buggy client accidentally double-firing),
// tight enough to blunt actual abuse or a leaked token being hammered.
// Tune per-route later if a specific endpoint needs to be stricter.
export const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '60 s'),
  analytics: true,
});

export async function checkRateLimit(key: string): Promise<{ allowed: boolean; remaining: number }> {
  const { success, remaining } = await ratelimit.limit(key);
  return { allowed: success, remaining };
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}
